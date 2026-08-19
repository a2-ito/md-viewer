import { load } from 'js-yaml';

export type Frontmatter = Readonly<Record<string, unknown>>;

export type FrontmatterResult = {
  /** パースできた frontmatter。無い/壊れている場合は空 */
  readonly data: Frontmatter;
  /** frontmatter を除いた本文 */
  readonly body: string;
  /** パースに失敗した場合の理由。表示側で警告として出す */
  readonly warnings: readonly string[];
};

/** 先頭の `---` 区切りブロックと、それに続く本文を切り出す */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * YAML frontmatter を抽出する。
 * パースに失敗しても本文の表示を止めず、warnings に理由を残す。
 */
export const extractFrontmatter = (source: string): FrontmatterResult => {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match === null) {
    return { data: {}, body: source, warnings: [] };
  }

  const [matched, yaml = ''] = match;
  const body = source.slice(matched.length);

  // js-yaml は空入力に対して例外を投げるため、先に空を弾く
  if (yaml.trim() === '') {
    return { data: {}, body, warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = load(yaml);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
    return {
      data: {},
      body,
      warnings: [`frontmatter の YAML を解釈できませんでした: ${reason}`],
    };
  }

  // 空の frontmatter（`---\n---`）は undefined になる
  if (parsed === undefined || parsed === null) {
    return { data: {}, body, warnings: [] };
  }

  if (!isPlainObject(parsed)) {
    return {
      data: {},
      body,
      warnings: ['frontmatter がマッピング形式ではないため無視しました。'],
    };
  }

  return { data: parsed, body, warnings: [] };
};

/** frontmatter から表示用タイトルを取り出す。文字列でなければ null。 */
export const readTitle = (data: Frontmatter): string | null => {
  const title = data['title'];
  return typeof title === 'string' && title.trim() !== '' ? title.trim() : null;
};
