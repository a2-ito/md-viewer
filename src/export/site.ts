import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { splitHash } from '../core/links.ts';
import { createRenderer, type FenceHighlighter } from '../core/renderer.ts';
import { buildTree, findReadme, isMarkdownPath, type FileNode } from '../fs/tree.ts';
import { KATEX_CSS, KATEX_FONTS_DIR, MERMAID_JS, STYLES_DIR, STYLE_FILES } from '../paths.ts';
import { ASSETS_DIR, renderStaticPage, toHtmlPath } from './page.ts';

export type ExportOptions = {
  readonly root: string;
  readonly outDir: string;
  readonly allowHtml?: boolean;
  readonly highlightFence?: FenceHighlighter;
  /** 指定時はこの 1 ファイルだけを出力し、ツリーを描画しない */
  readonly only?: string;
};

export type ExportResult = {
  readonly pages: readonly string[];
  readonly copiedAssets: readonly string[];
  /** 参照されていたが見つからなかったファイル */
  readonly missingAssets: readonly string[];
  readonly warnings: readonly string[];
};

const flatten = (nodes: readonly FileNode[]): readonly string[] =>
  nodes.flatMap((node) => (node.kind === 'file' ? [node.relPath] : flatten(node.children)));

/**
 * 出力先では同じディレクトリ構造を保つため、相対リンクはそのまま使える。
 * Markdown への参照だけ拡張子を .html に差し替え、それ以外は複製対象として覚える。
 */
const createExportRewriters = (relPath: string, assets: Set<string>) => {
  const dir = posix.dirname(relPath);
  const base = dir === '.' ? '' : dir;

  const toRootRel = (target: string): string | null => {
    const joined = posix.normalize(posix.join(base, target));
    return joined.startsWith('..') ? null : joined;
  };

  return {
    rewriteHref: (href: string): string => {
      const [path, hash] = splitHash(href);
      if (path === '') return href;
      const rel = toRootRel(path);
      if (rel === null) return href;
      if (isMarkdownPath(rel)) return `${toHtmlPath(path)}${hash}`;
      assets.add(rel);
      return href;
    },
    rewriteSrc: (src: string): string => {
      const rel = toRootRel(src);
      if (rel !== null) assets.add(rel);
      return src;
    },
  };
};

/** root 配下の Markdown を静的 HTML として outDir に書き出す。 */
export const exportSite = async (options: ExportOptions): Promise<ExportResult> => {
  const { root, outDir, allowHtml = false, highlightFence, only } = options;

  const fullTree = await buildTree(root);
  const tree = only === undefined ? fullTree : [];
  const files = only === undefined ? flatten(fullTree) : [only];
  const css = (
    await Promise.all(STYLE_FILES.map((name) => readFile(join(STYLES_DIR, name), 'utf8')))
  ).join('\n');

  const referenced = new Set<string>();
  const warnings: string[] = [];
  const pages: string[] = [];
  let needsKatex = false;
  let needsMermaid = false;

  for (const relPath of files) {
    const source = await readFile(join(root, relPath), 'utf8');
    const { rewriteHref, rewriteSrc } = createExportRewriters(relPath, referenced);
    const rendered = createRenderer({
      allowHtml,
      rewriteHref,
      rewriteSrc,
      ...(highlightFence === undefined ? {} : { highlightFence }),
    })(source);

    const html = renderStaticPage({
      title: rendered.title ?? relPath,
      body: rendered.html,
      breadcrumb: relPath,
      tree,
      currentRelPath: relPath,
      toc: rendered.toc,
      css,
      hasMath: rendered.hasMath,
      hasMermaid: rendered.hasMermaid,
      warnings: rendered.warnings,
    });

    const outPath = join(outDir, toHtmlPath(relPath));
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf8');

    pages.push(toHtmlPath(relPath));
    needsKatex = needsKatex || rendered.hasMath;
    needsMermaid = needsMermaid || rendered.hasMermaid;
    for (const warning of rendered.warnings) warnings.push(`${relPath}: ${warning}`);
  }

  // 参照されていた画像などを同じ相対位置に複製する
  const copiedAssets: string[] = [];
  const missingAssets: string[] = [];
  for (const relPath of referenced) {
    const destination = join(outDir, relPath);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await copyFile(join(root, relPath), destination);
      copiedAssets.push(relPath);
    } catch {
      missingAssets.push(relPath);
    }
  }

  const sharedDir = join(outDir, ASSETS_DIR);

  if (needsKatex) {
    await mkdir(join(sharedDir, 'fonts'), { recursive: true });
    await copyFile(KATEX_CSS, join(sharedDir, 'katex.css'));
    // woff2 だけで現行ブラウザは足りるため、woff/ttf は複製しない
    const fonts = (await readdir(KATEX_FONTS_DIR)).filter((name) => name.endsWith('.woff2'));
    for (const font of fonts) {
      await copyFile(join(KATEX_FONTS_DIR, font), join(sharedDir, 'fonts', font));
    }
  }

  if (needsMermaid) {
    await mkdir(sharedDir, { recursive: true });
    await copyFile(MERMAID_JS, join(sharedDir, 'mermaid.js'));
  }

  // README があれば入口として index.html も置く（同じ階層なのでリンクはそのまま）
  const readme = only === undefined ? await findReadme(root) : null;
  if (readme !== null) {
    await copyFile(join(outDir, toHtmlPath(readme)), join(outDir, 'index.html'));
    pages.push('index.html');
  }

  return { pages, copiedAssets, missingAssets, warnings };
};
