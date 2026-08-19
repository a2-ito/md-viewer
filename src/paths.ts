import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * パッケージルート。
 * src/ からも dist/ からも 1 階層上がルートになる。
 */
const PACKAGE_ROOT = join(import.meta.dirname, '..');

/** 依存パッケージのインストール先を解決する。 */
const packageDir = (name: string): string => dirname(require.resolve(`${name}/package.json`));

export const STYLES_DIR = join(PACKAGE_ROOT, 'styles');

/** 配信順に連結して 1 本の CSS として返す */
export const STYLE_FILES = [
  'base.css',
  'markdown.css',
  'code.css',
  'print.css',
] as const;

/** ブラウザ向けスクリプトの置き場。`npm run build` の出力を配信する */
export const CLIENT_DIR = join(PACKAGE_ROOT, 'dist', 'client');

/** KaTeX の CSS。フォントは同ディレクトリの fonts/ を相対参照する */
export const KATEX_CSS = join(packageDir('katex'), 'dist', 'katex.min.css');

/** KaTeX が参照する woff2/woff/ttf の置き場 */
export const KATEX_FONTS_DIR = join(packageDir('katex'), 'dist', 'fonts');

/** mermaid の単一ファイル UMD ビルド。ESM 版はチャンク分割されており配信が煩雑 */
export const MERMAID_JS = join(packageDir('mermaid'), 'dist', 'mermaid.min.js');
