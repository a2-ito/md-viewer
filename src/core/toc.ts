/** 目次に載せる見出しレベル（h1 はページタイトル、h4 以下は細かすぎるため除く） */
export const TOC_LEVELS = [2, 3] as const;

export type TocLevel = (typeof TOC_LEVELS)[number];

export const isTocLevel = (level: number): level is TocLevel =>
  (TOC_LEVELS as readonly number[]).includes(level);

/** 見出しを出現順に並べたもの */
export type FlatHeading = {
  readonly level: TocLevel;
  readonly text: string;
  readonly slug: string;
};

export type TocEntry = {
  readonly level: TocLevel;
  readonly text: string;
  readonly slug: string;
  readonly children: readonly TocEntry[];
};

/**
 * 見出しテキストをアンカー用の slug に変換する。
 * 日本語をそのまま残すため、除去するのは記号のみに限る。
 */
export const slugify = (text: string): string => {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "section" : slug;
};

/**
 * 同一ページ内で一意な slug を払い出す関数を作る。
 * 呼び出し回数を数えるため状態を持つので、ページごとに生成する。
 */
export const createSlugger = (): ((text: string) => string) => {
  const counts = new Map<string, number>();
  return (text) => {
    const base = slugify(text);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen}`;
  };
};

/** 平坦な見出し列を、レベルに従って入れ子にする。 */
export const buildTocTree = (
  headings: readonly FlatHeading[],
): readonly TocEntry[] => {
  const roots: TocEntry[] = [];
  // 各レベルの「現在の親候補」を保持する
  const stack: Array<{ level: TocLevel; children: TocEntry[] }> = [];

  for (const heading of headings) {
    const children: TocEntry[] = [];
    const entry: TocEntry = { ...heading, children };

    while (
      stack.length > 0 &&
      (stack[stack.length - 1]?.level ?? 0) >= heading.level
    ) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      roots.push(entry);
    } else {
      parent.children.push(entry);
    }

    stack.push({ level: heading.level, children });
  }

  return roots;
};
