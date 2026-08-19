import { createHighlighter } from 'shiki';
import type { FenceHighlighter } from '../core/renderer.ts';

/**
 * ハイライト対象の言語。
 * 起動時にロードされるため、増やすほど起動が遅くなる（15 言語で約 160ms）。
 */
const LANGS = [
  'typescript', 'tsx', 'javascript', 'jsx', 'json', 'yaml', 'toml',
  'bash', 'python', 'go', 'rust', 'java', 'ruby', 'php', 'sql',
  'html', 'css', 'scss', 'markdown', 'diff', 'dockerfile', 'ini', 'xml',
] as const;

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

export type { FenceHighlighter };

/**
 * Shiki ハイライタを構築する。
 * テーマは CSS 変数として両方出力し、明暗の切り替えは CSS 側で行う。
 */
export const createFenceHighlighter = async (): Promise<FenceHighlighter> => {
  const highlighter = await createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [...LANGS],
  });

  const loaded = new Set(highlighter.getLoadedLanguages());

  return (code, lang) => {
    if (lang === '' || !loaded.has(lang)) return null;
    return highlighter.codeToHtml(code, {
      lang,
      themes: THEMES,
      defaultColor: false,
    });
  };
};
