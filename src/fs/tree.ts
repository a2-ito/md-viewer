import { readdir } from "node:fs/promises";
import { join, posix } from "node:path";

export type FileNode =
  | { readonly kind: "file"; readonly name: string; readonly relPath: string }
  | {
      readonly kind: "dir";
      readonly name: string;
      readonly relPath: string;
      readonly children: readonly FileNode[];
    };

/** 走査・監視から除外するディレクトリ名 */
export const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "vendor",
  "target",
]);

/** 走査の深さ上限。異常な階層構造で暴走しないための保険 */
const MAX_DEPTH = 12;

export const isMarkdownPath = (path: string): boolean =>
  /\.(md|markdown)$/i.test(path);

/** ディレクトリ優先、次に名前順（数字を自然順で扱う） */
const compareNodes = (a: FileNode, b: FileNode): number => {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name, "ja", { numeric: true });
};

const walk = async (
  absDir: string,
  relDir: string,
  depth: number,
): Promise<readonly FileNode[]> => {
  if (depth > MAX_DEPTH) return [];

  const entries = await readdir(absDir, { withFileTypes: true }).catch(
    () => [],
  );
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    // ドット始まりと除外ディレクトリはスキップ。
    // シンボリックリンクは追わない（循環と root 外への露出を避けるため）
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;

    const relPath = relDir === "" ? entry.name : posix.join(relDir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const children = await walk(join(absDir, entry.name), relPath, depth + 1);
      // Markdown を1つも含まないディレクトリは表示しない
      if (children.length > 0) {
        nodes.push({ kind: "dir", name: entry.name, relPath, children });
      }
      continue;
    }

    if (entry.isFile() && isMarkdownPath(entry.name)) {
      nodes.push({ kind: "file", name: entry.name, relPath });
    }
  }

  return nodes.sort(compareNodes);
};

/** root 配下の Markdown ファイルツリーを構築する。 */
export const buildTree = (root: string): Promise<readonly FileNode[]> =>
  walk(root, "", 0);

/** root 直下から README 相当のファイルを探す。見つからなければ null。 */
export const findReadme = async (root: string): Promise<string | null> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const names = entries.filter((e) => e.isFile()).map((e) => e.name);
  return (
    names.find((n) => /^readme\.(md|markdown)$/i.test(n)) ??
    names.find((n) => /^index\.(md|markdown)$/i.test(n)) ??
    null
  );
};
