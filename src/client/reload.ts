import { renderDiagrams } from "./mermaid.ts";
import { setupTocHighlight } from "./toc.ts";
import { setupTreeState } from "./tree.ts";

const KATEX_HREF = "/__static/katex.css";

/**
 * ペインを新しい内容に入れ替える。
 * 目次やツリーは条件次第で出現・消滅するため、両方向を扱う。
 */
const syncPane = (
  selector: string,
  next: Document,
  insert: (element: Element) => void,
): void => {
  const incoming = next.querySelector(selector);
  const current = document.querySelector(selector);

  if (incoming === null) {
    current?.remove();
    return;
  }
  if (current === null) {
    insert(incoming);
    return;
  }
  current.replaceWith(incoming);
};

/** 数式を含むページに切り替わったときに KaTeX の CSS を足す */
const ensureKatexCss = (next: Document): void => {
  const needed = next.querySelector(`link[href="${KATEX_HREF}"]`) !== null;
  if (!needed || document.querySelector(`link[href="${KATEX_HREF}"]`) !== null)
    return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = KATEX_HREF;
  document.head.append(link);
};

/**
 * 現在の URL を取り直して本文・目次・ツリーだけを差し替える。
 * ページ全体を再読み込みしないので、スクロール位置がそのまま残る。
 */
const applyUpdate = async (): Promise<void> => {
  const response = await fetch(location.href, { cache: "no-store" });
  const next = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );

  const body = document.querySelector(".app-body");
  if (body === null) {
    location.reload();
    return;
  }

  syncPane(".tree-pane", next, (el) => body.prepend(el));
  syncPane(".markdown-body", next, (el) => body.append(el));
  syncPane(".toc-pane", next, (el) => body.append(el));
  ensureKatexCss(next);
  document.title = next.title;

  setupTreeState();
  setupTocHighlight();
  await renderDiagrams();
};

/**
 * ファイル変更の通知を受け取り、表示を更新する。
 * EventSource は切断時に自動再接続するため、サーバ再起動にもそのまま追従する。
 */
export const startLiveReload = (): void => {
  const source = new EventSource("/__events");
  let updating = false;

  source.addEventListener("change", () => {
    // 更新中に届いた通知は捨てる（直後に最新を取り直すので取りこぼしにならない）
    if (updating) return;
    updating = true;
    void applyUpdate().finally(() => {
      updating = false;
    });
  });
};
