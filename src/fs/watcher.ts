import { watch } from 'chokidar';
import { relative, sep } from 'node:path';
import { EXCLUDED_DIRS, isMarkdownPath } from './tree.ts';

export type ChangeEvent = {
  readonly kind: 'add' | 'change' | 'unlink';
  /** root からの相対パス（区切りは / に正規化済み） */
  readonly relPath: string;
};

export type Watcher = {
  readonly close: () => Promise<void>;
};

/** ドット始まり、または除外ディレクトリを含むパスか */
const isIgnored = (root: string, absPath: string): boolean => {
  const rel = relative(root, absPath);
  if (rel === '') return false;
  return rel
    .split(sep)
    .some((segment) => segment.startsWith('.') || EXCLUDED_DIRS.has(segment));
};

/**
 * root 配下の Markdown を監視する。
 * エディタの保存は複数イベントを生むため、まとめて 1 回だけ通知する。
 */
export const watchMarkdown = (
  root: string,
  onChange: (event: ChangeEvent) => void,
  debounceMs = 80,
): Watcher => {
  const watcher = watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignored: (absPath) => isIgnored(root, absPath),
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: ChangeEvent | null = null;

  const emit = (kind: ChangeEvent['kind'], absPath: string): void => {
    if (!isMarkdownPath(absPath)) return;

    pending = { kind, relPath: relative(root, absPath).split(sep).join('/') };
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      const event = pending;
      timer = null;
      pending = null;
      if (event !== null) onChange(event);
    }, debounceMs);
  };

  watcher.on('add', (p) => emit('add', p));
  watcher.on('change', (p) => emit('change', p));
  watcher.on('unlink', (p) => emit('unlink', p));

  return {
    close: async () => {
      if (timer !== null) clearTimeout(timer);
      await watcher.close();
    },
  };
};
