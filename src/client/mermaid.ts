type MermaidApi = {
  readonly initialize: (config: Record<string, unknown>) => void;
  readonly run: (options: { readonly querySelector: string }) => Promise<void>;
};

const isMermaidApi = (value: unknown): value is MermaidApi =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { initialize?: unknown }).initialize === 'function' &&
  typeof (value as { run?: unknown }).run === 'function';

let loading: Promise<void> | null = null;

/** mermaid の UMD ビルドを一度だけ読み込む */
const loadMermaid = (): Promise<void> => {
  loading ??= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = '/__static/mermaid.js';
    el.addEventListener('load', () => resolve());
    el.addEventListener('error', () => reject(new Error('mermaid の読み込みに失敗しました')));
    document.head.append(el);
  });
  return loading;
};

/** 図の描画に失敗したことを、該当ブロックの直前に表示する */
const showFailure = (message: string): void => {
  for (const block of document.querySelectorAll('pre.mermaid')) {
    const notice = document.createElement('div');
    notice.className = 'notice notice-error';
    notice.textContent = message;
    block.before(notice);
  }
};

/** ページ内の mermaid ブロックを描画する。無ければ何もしない。 */
export const renderDiagrams = async (): Promise<void> => {
  if (document.querySelector('pre.mermaid') === null) return;

  try {
    await loadMermaid();
  } catch (cause) {
    showFailure(cause instanceof Error ? cause.message : 'mermaid の読み込みに失敗しました');
    return;
  }

  const api: unknown = (window as unknown as { mermaid?: unknown }).mermaid;
  if (!isMermaidApi(api)) {
    showFailure('mermaid の API を認識できませんでした');
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  api.initialize({
    startOnLoad: false,
    theme: prefersDark ? 'dark' : 'default',
    securityLevel: 'strict',
  });

  try {
    await api.run({ querySelector: 'pre.mermaid' });
  } catch (cause) {
    showFailure(cause instanceof Error ? cause.message : '図の描画に失敗しました');
  }
};
