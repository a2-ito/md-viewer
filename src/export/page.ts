import { posix } from "node:path";
import { escapeHtml } from "../core/escape.ts";
import type { TocEntry } from "../core/toc.ts";
import type { FileNode } from "../fs/tree.ts";
import { renderToc, renderTree, type HrefFor } from "../view/layout.ts";

/** 出力ディレクトリ内で共有アセットを置く場所 */
export const ASSETS_DIR = "_assets";

/** ページの深さに応じた `_assets` への相対パスを返す */
export const assetsPrefix = (relPath: string): string => {
  const depth = relPath.split("/").length - 1;
  return depth === 0 ? ASSETS_DIR : `${"../".repeat(depth)}${ASSETS_DIR}`;
};

/** 出力先ページ同士を結ぶ相対リンクを作る */
export const staticHref = (fromRelPath: string): HrefFor => {
  const fromDir = posix.dirname(fromRelPath);
  const base = fromDir === "." ? "" : fromDir;
  return (relPath) => encodeURI(posix.relative(base, toHtmlPath(relPath)));
};

/** `a/b.md` を `a/b.html` にする */
export const toHtmlPath = (relPath: string): string =>
  relPath.replace(/\.(md|markdown)$/i, ".html");

export type StaticPageInput = {
  readonly title: string;
  readonly body: string;
  readonly breadcrumb: string;
  readonly tree: readonly FileNode[];
  readonly currentRelPath: string;
  readonly toc: readonly TocEntry[];
  /** 各ページに埋め込む CSS。単体で開いても崩れないようインライン化する */
  readonly css: string;
  readonly hasMath: boolean;
  readonly hasMermaid: boolean;
  readonly warnings: readonly string[];
};

/**
 * 単体で開ける HTML を組み立てる。
 * file:// では ESM の import が使えないため、スクリプトは classic script に限る。
 */
export const renderStaticPage = ({
  title,
  body,
  breadcrumb,
  tree,
  currentRelPath,
  toc,
  css,
  hasMath,
  hasMermaid,
  warnings,
}: StaticPageInput): string => {
  const prefix = assetsPrefix(currentRelPath);
  const hrefFor = staticHref(currentRelPath);

  const treePane =
    tree.length === 0
      ? ""
      : `<nav class="tree-pane" aria-label="ファイルツリー">${renderTree(tree, currentRelPath, hrefFor)}</nav>`;

  const tocPane =
    toc.length === 0
      ? ""
      : `<aside class="toc-pane" aria-label="目次"><div class="toc-heading">ON THIS PAGE</div>${renderToc(toc)}</aside>`;

  // mermaid は UMD を読み込んでから描画する（ESM はローカルファイルで動かない）
  const mermaidScript = hasMermaid
    ? `<script src="${prefix}/mermaid.js"></script>
<script>
  mermaid.initialize({
    startOnLoad: false,
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    securityLevel: 'strict',
  });
  mermaid.run({ querySelector: 'pre.mermaid' });
</script>
`
    : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
${hasMath ? `<link rel="stylesheet" href="${prefix}/katex.css">\n` : ""}</head>
<body>
<header class="app-header">
  <span class="app-name">md-viewer</span>
  <span class="app-path">${escapeHtml(breadcrumb)}</span>
  <button class="app-print" onclick="window.print()">印刷</button>
</header>
<div class="app-body">
${treePane}<main class="markdown-body">
${warnings.map((w) => `<div class="notice notice-error">${escapeHtml(w)}</div>`).join("\n")}
${body}
</main>
${tocPane}
</div>
${mermaidScript}</body>
</html>
`;
};
