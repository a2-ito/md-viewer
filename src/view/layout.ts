import { escapeHtml } from "../core/escape.ts";
import type { TocEntry } from "../core/toc.ts";
import type { FileNode } from "../fs/tree.ts";

/** 現在表示中のファイルがこのディレクトリ配下にあるか（=開いた状態にする） */
const containsCurrent = (
  dirRelPath: string,
  currentRelPath: string | null,
): boolean =>
  currentRelPath !== null && currentRelPath.startsWith(`${dirRelPath}/`);

/** ファイル 1 件を指すリンク先を組み立てる */
export type HrefFor = (relPath: string) => string;

/** 表示サーバ用のリンク先 */
export const viewHref: HrefFor = (relPath) => `/view/${encodeURI(relPath)}`;

/**
 * ファイルツリーを描画する。
 * 開閉は <details> に委ね、静的出力でも JS なしで動く。
 */
export const renderTree = (
  nodes: readonly FileNode[],
  currentRelPath: string | null,
  hrefFor: HrefFor = viewHref,
): string =>
  `<ul class="tree">${nodes
    .map((node) => {
      if (node.kind === "dir") {
        const open = containsCurrent(node.relPath, currentRelPath)
          ? " open"
          : "";
        return `<li class="tree-dir"><details${open} data-path="${escapeHtml(node.relPath)}"><summary>${escapeHtml(node.name)}</summary>${renderTree(node.children, currentRelPath, hrefFor)}</details></li>`;
      }
      const current = node.relPath === currentRelPath ? " is-current" : "";
      return `<li class="tree-item"><a class="tree-file${current}" href="${hrefFor(node.relPath)}">${escapeHtml(node.name)}</a></li>`;
    })
    .join("")}</ul>`;

/** 目次を描画する。リンクはネイティブのアンカー遷移に任せる。 */
export const renderToc = (entries: readonly TocEntry[]): string =>
  `<ul class="toc">${entries
    .map(
      (entry) =>
        `<li class="toc-item toc-l${entry.level}"><a href="#${encodeURIComponent(entry.slug)}">${escapeHtml(entry.text)}</a>${
          entry.children.length > 0 ? renderToc(entry.children) : ""
        }</li>`,
    )
    .join("")}</ul>`;

export type LayoutInput = {
  readonly title: string;
  /** レンダリング済みの本文 HTML */
  readonly body: string;
  /** ヘッダに表示するパス */
  readonly breadcrumb: string;
  /** サイドバーに出すツリー。null ならサイドバーを描画しない */
  readonly tree: readonly FileNode[] | null;
  /** ツリー内でハイライトする現在ファイル */
  readonly currentRelPath: string | null;
  /** KaTeX の CSS を読み込むか */
  readonly hasMath?: boolean;
  /** 右側に出す目次。空なら目次ペインを描画しない */
  readonly toc?: readonly TocEntry[];
  /** 画面上部に出す警告 */
  readonly warnings?: readonly string[];
};

/** 本文 HTML を包むシェルを組み立てる。 */
export const renderLayout = ({
  title,
  body,
  breadcrumb,
  tree,
  currentRelPath,
  hasMath = false,
  toc = [],
  warnings = [],
}: LayoutInput): string => {
  const sidebar =
    tree === null
      ? ""
      : `<nav class="tree-pane" aria-label="ファイルツリー">${renderTree(tree, currentRelPath)}</nav>`;

  const tocPane =
    toc.length === 0
      ? ""
      : `<aside class="toc-pane" aria-label="目次"><div class="toc-heading">ON THIS PAGE</div>${renderToc(toc)}</aside>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/__static/app.css">
${hasMath ? '<link rel="stylesheet" href="/__static/katex.css">\n' : ""}</head>
<body${tree === null ? ' class="no-sidebar"' : ""}>
<header class="app-header">
  <span class="app-name">md-viewer</span>
  <span class="app-path">${escapeHtml(breadcrumb)}</span>
  <button class="app-print" onclick="window.print()">印刷</button>
</header>
<div class="app-body">
${sidebar}
<main class="markdown-body">
${warnings.map((w) => `<div class="notice notice-error">${escapeHtml(w)}</div>`).join("\n")}
${body}
</main>
${tocPane}
</div>
<script type="module" src="/__static/js/main.js"></script>
</body>
</html>
`;
};

/** 上限超過ファイル用のフォールバック表示。 */
export const renderRawFallback = (source: string, sizeBytes: number): string =>
  `<div class="notice">ファイルサイズが上限を超えているため、生テキストを表示しています（${Math.round((sizeBytes / 1024 / 1024) * 10) / 10} MB）。</div>
<pre class="raw">${escapeHtml(source)}</pre>`;

export type ErrorPageInput = {
  readonly message: string;
  readonly tree: readonly FileNode[] | null;
};

export const renderErrorPage = ({ message, tree }: ErrorPageInput): string =>
  renderLayout({
    title: "エラー - md-viewer",
    breadcrumb: "",
    tree,
    currentRelPath: null,
    body: `<div class="notice notice-error">${escapeHtml(message)}</div>`,
  });
