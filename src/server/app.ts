import { readFile } from "node:fs/promises";
import { basename, extname, join, posix } from "node:path";
import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { splitHash } from "../core/links.ts";
import { createRenderer } from "../core/renderer.ts";
import { DEFAULT_MAX_BYTES, resolveWithinRoot } from "../fs/resolve.ts";
import { buildTree, isMarkdownPath } from "../fs/tree.ts";
import type { Broadcaster } from "./broadcast.ts";
import {
  CLIENT_DIR,
  KATEX_CSS,
  KATEX_FONTS_DIR,
  MERMAID_JS,
  STYLES_DIR,
  STYLE_FILES,
} from "../paths.ts";
import type { FenceHighlighter } from "./highlight.ts";
import {
  renderErrorPage,
  renderLayout,
  renderRawFallback,
} from "../view/layout.ts";

/** DNS rebinding 対策として許可する Host（DESIGN §8） */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

const FONT_TYPES: Readonly<Record<string, string>> = {
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/** node_modules 由来の不変アセットに付けるキャッシュ指示 */
const IMMUTABLE_CACHE = "public, max-age=86400";

export type AppOptions = {
  /** 公開ルート。この外へのアクセスは拒否される */
  readonly root: string;
  /** `/` にアクセスされたときに表示する root 相対パス。null ならツリーのみ表示 */
  readonly entryRelPath: string | null;
  readonly allowHtml?: boolean;
  readonly maxBytes?: number;
  /** コードフェンスのハイライタ。未指定ならハイライトなし */
  readonly highlightFence?: FenceHighlighter;
  /** ファイル変更の配信元。未指定ならライブリロードは無効 */
  readonly broadcaster?: Broadcaster;
};

/**
 * 表示中ファイルを基準に、ドキュメント相対リンクを URL へ変換する関数を作る。
 * Markdown は /view/ 、それ以外は /assets/ に振り分ける。
 */
export const createLinkRewriters = (relPath: string) => {
  const dir = posix.dirname(relPath);
  const base = dir === "." ? "" : dir;

  /** root 相対パスへ正規化する。root 外に出るものは null */
  const toRootRel = (target: string): string | null => {
    const joined = posix.normalize(posix.join(base, target));
    return joined.startsWith("..") ? null : joined;
  };

  return {
    rewriteHref: (href: string): string => {
      const [path, hash] = splitHash(href);
      if (path === "") return href;
      const rel = toRootRel(path);
      if (rel === null) return href;
      const prefix = isMarkdownPath(rel) ? "/view/" : "/assets/";
      return `${prefix}${encodeURI(rel)}${hash}`;
    },
    rewriteSrc: (src: string): string => {
      const rel = toRootRel(src);
      return rel === null ? src : `/assets/${encodeURI(rel)}`;
    },
  };
};

/** ファイルをそのまま返す。読めなければ 404。 */
const serveFile = async (
  c: Context,
  absPath: string,
  contentType: string,
  cacheControl?: string,
) => {
  const data = await readFile(absPath).catch(() => null);
  if (data === null) {
    return c.text(`Not Found: ${basename(absPath)}`, 404);
  }
  return c.body(new Uint8Array(data), 200, {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    ...(cacheControl === undefined ? {} : { "cache-control": cacheControl }),
  });
};

export const createApp = (options: AppOptions): Hono => {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowHtml = options.allowHtml ?? false;
  const { highlightFence } = options;
  const app = new Hono();

  // Host ヘッダを localhost 系に限定する
  app.use("*", async (c, next) => {
    const host = c.req.header("host")?.split(":")[0] ?? "";
    if (!ALLOWED_HOSTS.has(host)) {
      return c.text("Forbidden: unexpected Host header", 403);
    }
    await next();
  });

  // ---- 静的アセット ----

  app.get("/__static/app.css", async (c) => {
    const parts = await Promise.all(
      STYLE_FILES.map((name) => readFile(join(STYLES_DIR, name), "utf8")),
    );
    return c.body(parts.join("\n"), 200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "no-cache",
    });
  });

  // クライアントスクリプトは ESM のまま複数ファイルで配信する
  app.get("/__static/js/:file", async (c) => {
    const file = basename(c.req.param("file"));
    if (!/^[a-z]+\.js$/.test(file)) {
      return c.text("Not Found", 404);
    }
    return await serveFile(
      c,
      join(CLIENT_DIR, file),
      "text/javascript; charset=utf-8",
      "no-cache",
    );
  });

  app.get("/__static/katex.css", (c) =>
    serveFile(c, KATEX_CSS, "text/css; charset=utf-8", IMMUTABLE_CACHE),
  );

  app.get("/__static/mermaid.js", (c) =>
    serveFile(c, MERMAID_JS, "text/javascript; charset=utf-8", IMMUTABLE_CACHE),
  );

  // KaTeX の CSS が fonts/ を相対参照するため、同じ階層に置く
  app.get("/__static/fonts/:file", async (c) => {
    const file = basename(c.req.param("file"));
    const type = FONT_TYPES[extname(file).toLowerCase()];
    // KaTeX のフォント以外は返さない
    if (
      type === undefined ||
      !/^KaTeX_[A-Za-z0-9-]+\.(woff2|woff|ttf)$/.test(file)
    ) {
      return c.text("Not Found", 404);
    }
    return await serveFile(
      c,
      join(KATEX_FONTS_DIR, file),
      type,
      IMMUTABLE_CACHE,
    );
  });

  // ---- API ----

  app.get("/api/tree", async (c) => c.json(await buildTree(options.root)));

  // ファイル変更を配る。EventSource 側が切断時に自動再接続する
  app.get("/__events", (c) => {
    const { broadcaster } = options;
    return streamSSE(c, async (stream) => {
      if (broadcaster === undefined) {
        await stream.writeSSE({ event: "disabled", data: "" });
        return;
      }

      const unsubscribe = broadcaster.subscribe((event) => {
        void stream.writeSSE({ event: "change", data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);

      // 接続が生きていることを示すため定期的に送る
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(15_000);
        if (stream.aborted || stream.closed) break;
        await stream.writeSSE({ event: "ping", data: "" });
      }
      unsubscribe();
    });
  });

  // ---- ページ ----

  app.get("/", async (c) => {
    if (options.entryRelPath !== null) {
      return c.redirect(`/view/${encodeURI(options.entryRelPath)}`);
    }
    // README が無いフォルダでは、ツリーだけを出して選択を促す
    const tree = await buildTree(options.root);
    return c.html(
      renderLayout({
        title: "md-viewer",
        breadcrumb: "",
        tree,
        currentRelPath: null,
        body:
          tree.length === 0
            ? '<div class="notice">このフォルダに Markdown ファイルが見つかりませんでした。</div>'
            : '<div class="notice">左のツリーからファイルを選んでください。</div>',
      }),
    );
  });

  app.get("/view/*", async (c) => {
    const relPath = decodeURIComponent(c.req.path.slice("/view/".length));
    const tree = await buildTree(options.root);

    if (!isMarkdownPath(relPath)) {
      return c.html(
        renderErrorPage({
          message: `Markdown ファイルではありません: ${relPath}`,
          tree,
        }),
        400,
      );
    }

    const resolved = await resolveWithinRoot(options.root, relPath);
    if (!resolved.ok) {
      const { error } = resolved;
      const [status, message] =
        error.type === "outside-root"
          ? ([
              403,
              `公開ルートの外へのアクセスは許可されていません: ${error.requested}`,
            ] as const)
          : error.type === "not-found"
            ? ([404, `ファイルが見つかりません: ${error.requested}`] as const)
            : ([400, `ファイルではありません: ${error.requested}`] as const);
      return c.html(renderErrorPage({ message, tree }), status);
    }

    const { absPath, sizeBytes } = resolved.value;
    const source = await readFile(absPath, "utf8");

    if (sizeBytes > maxBytes) {
      return c.html(
        renderLayout({
          title: `${relPath} - md-viewer`,
          body: renderRawFallback(source, sizeBytes),
          breadcrumb: relPath,
          tree,
          currentRelPath: relPath,
        }),
      );
    }

    const { rewriteHref, rewriteSrc } = createLinkRewriters(relPath);
    const rendered = createRenderer({
      allowHtml,
      rewriteHref,
      rewriteSrc,
      ...(highlightFence === undefined ? {} : { highlightFence }),
    })(source);

    return c.html(
      renderLayout({
        title: `${rendered.title ?? relPath} - md-viewer`,
        body: rendered.html,
        breadcrumb: relPath,
        tree,
        currentRelPath: relPath,
        hasMath: rendered.hasMath,
        toc: rendered.toc,
        warnings: rendered.warnings,
      }),
    );
  });

  // Markdown から参照される画像などを返す
  app.get("/assets/*", async (c) => {
    const relPath = decodeURIComponent(c.req.path.slice("/assets/".length));
    const resolved = await resolveWithinRoot(options.root, relPath);
    if (!resolved.ok) {
      const forbidden = resolved.error.type === "outside-root";
      return c.text(
        forbidden ? "Forbidden" : "Not Found",
        forbidden ? 403 : 404,
      );
    }

    const contentType =
      CONTENT_TYPES[extname(relPath).toLowerCase()] ??
      "application/octet-stream";
    const data = await readFile(resolved.value.absPath);

    return c.body(new Uint8Array(data), 200, {
      "content-type": contentType,
      "x-content-type-options": "nosniff",
      // SVG は script を含みうるため、直接開かれた場合の実行を封じる
      ...(contentType === "image/svg+xml"
        ? {
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'",
          }
        : {}),
    });
  });

  return app;
};
