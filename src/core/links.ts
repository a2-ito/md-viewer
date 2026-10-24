/** `http:`, `mailto:` などスキーム付き、または `//host` 形式か */
const hasScheme = (href: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");

/**
 * ドキュメント相対リンクとして書き換えるべき href か判定する。
 * 外部 URL・同一ページ内アンカー・サイト絶対パスは対象外。
 */
export const isDocumentRelative = (href: string): boolean =>
  href !== "" &&
  !hasScheme(href) &&
  !href.startsWith("#") &&
  !href.startsWith("/");

/** `path#hash` を分解する。hash は `#` を含んだ形で返す。 */
export const splitHash = (
  href: string,
): readonly [path: string, hash: string] => {
  const i = href.indexOf("#");
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
};
