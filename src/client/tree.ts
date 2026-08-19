const STORAGE_KEY = 'md-viewer:open-dirs';

/** 開いているディレクトリの集合を読み出す。壊れていれば空として扱う。 */
const loadOpenDirs = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [],
    );
  } catch {
    // プライベートモードなどで localStorage が使えなくても表示は続ける
    return new Set();
  }
};

const saveOpenDirs = (dirs: ReadonlySet<string>): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dirs]));
  } catch {
    // 保存できないだけなので無視する
  }
};

/**
 * ツリーの開閉状態を復元し、以後の開閉を記憶する。
 * 内容が差し替わったあとにも呼び直す必要がある。
 */
export const setupTreeState = (): void => {
  const openDirs = loadOpenDirs();

  for (const details of document.querySelectorAll<HTMLDetailsElement>(
    '.tree-dir > details[data-path]',
  )) {
    const path = details.dataset['path'];
    if (path === undefined) continue;

    // サーバが開いた状態（現在ファイルを含む階層）は閉じない
    if (openDirs.has(path)) details.open = true;

    details.addEventListener('toggle', () => {
      if (details.open) openDirs.add(path);
      else openDirs.delete(path);
      saveOpenDirs(openDirs);
    });
  }
};
