import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

/** 既定の読み込み上限。超過分は生テキスト表示にフォールバックする（DESIGN §8） */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export type ResolveError =
  | { readonly type: "outside-root"; readonly requested: string }
  | { readonly type: "not-found"; readonly requested: string }
  | { readonly type: "not-a-file"; readonly requested: string };

export type Resolved = {
  readonly absPath: string;
  readonly sizeBytes: number;
};

export type ResolveResult =
  | { readonly ok: true; readonly value: Resolved }
  | { readonly ok: false; readonly error: ResolveError };

/** root 配下に収まっているかを、シンボリックリンク解決後のパスで判定する。 */
const isWithin = (root: string, target: string): boolean =>
  target === root || target.startsWith(root.endsWith(sep) ? root : root + sep);

/**
 * root を起点に相対パスを解決する。
 * パストラバーサルは realpath 解決後に接頭辞一致で弾く（DESIGN §8）。
 */
export const resolveWithinRoot = async (
  root: string,
  requested: string,
): Promise<ResolveResult> => {
  if (isAbsolute(requested)) {
    return { ok: false, error: { type: "outside-root", requested } };
  }

  const candidate = resolve(root, requested);

  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = await realpath(root);
    realTarget = await realpath(candidate);
  } catch {
    return { ok: false, error: { type: "not-found", requested } };
  }

  if (!isWithin(realRoot, realTarget)) {
    return { ok: false, error: { type: "outside-root", requested } };
  }

  const info = await stat(realTarget);
  if (!info.isFile()) {
    return { ok: false, error: { type: "not-a-file", requested } };
  }

  return { ok: true, value: { absPath: realTarget, sizeBytes: info.size } };
};
