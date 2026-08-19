import MarkdownItFactory, { type MarkdownIt, type RendererRule, type Token } from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import { escapeHtml } from './escape.ts';
import { extractFrontmatter, readTitle, type Frontmatter } from './frontmatter.ts';
import { isDocumentRelative } from './links.ts';
import {
  buildTocTree,
  createSlugger,
  isTocLevel,
  type FlatHeading,
  type TocEntry,
} from './toc.ts';

export type RenderResult = {
  readonly html: string;
  /** 見出しから組み立てた目次（h2〜h3） */
  readonly toc: readonly TocEntry[];
  /** frontmatter の内容。無ければ空オブジェクト */
  readonly frontmatter: Frontmatter;
  /** frontmatter の title。無ければ null */
  readonly title: string | null;
  /** KaTeX の出力を含むか（CSS を読み込む判定に使う） */
  readonly hasMath: boolean;
  /** mermaid ブロックを含むか（スクリプトを読み込む判定に使う） */
  readonly hasMermaid: boolean;
  /** 表示を止めない程度の問題。画面上に警告として出す */
  readonly warnings: readonly string[];
};

export type RendererOptions = {
  /** Markdown 内の生 HTML を許可するか。既定 false（XSS 対策 / DESIGN §8） */
  readonly allowHtml?: boolean;
  /** ドキュメント相対リンクの書き換え。外部 URL とアンカーには適用されない */
  readonly rewriteHref?: (href: string) => string;
  /** ドキュメント相対な画像 src の書き換え */
  readonly rewriteSrc?: (src: string) => string;
  /**
   * コードフェンスの描画を委譲する。`<pre` で始まる文字列を返すとそのまま採用される。
   * null を返すと markdown-it の既定描画になる。
   * ハイライタの生成は I/O を伴うため、生成済みの関数を外から渡す。
   */
  readonly highlightFence?: FenceHighlighter;
};

export type Renderer = (source: string) => RenderResult;

/**
 * コードフェンスを HTML に変換する。非対応言語では null を返す。
 * 実装は I/O を伴うため server 側で構築し、ここには結果だけを渡す。
 */
export type FenceHighlighter = (code: string, lang: string) => string | null;

type MarkdownItPlugin = Parameters<MarkdownIt['use']>[0];

/**
 * 1 回の render 中だけ有効な収集用の状態。
 * インスタンスを共有しても混ざらないよう、md.render の env で受け渡す。
 */
type RenderEnv = {
  readonly headings: FlatHeading[];
  readonly slug: (text: string) => string;
};

const asRenderEnv = (env: unknown): RenderEnv | null =>
  typeof env === 'object' &&
  env !== null &&
  Array.isArray((env as { headings?: unknown }).headings) &&
  typeof (env as { slug?: unknown }).slug === 'function'
    ? (env as RenderEnv)
    : null;

/** 見出しの表示テキストを取り出す（強調やリンクの記法は落とす） */
const headingText = (inline: Token | undefined): string =>
  (inline?.children ?? [])
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')
    .trim();

/**
 * @vscode/markdown-it-katex は CJS のため、環境によって関数が
 * `default` に一段ラップされて届く。両方の形を受け付ける。
 */
const resolvePlugin = (mod: unknown, name: string): MarkdownItPlugin => {
  if (typeof mod === 'function') return mod as MarkdownItPlugin;
  if (typeof mod === 'object' && mod !== null && 'default' in mod) {
    const inner: unknown = (mod as { default: unknown }).default;
    if (typeof inner === 'function') return inner as MarkdownItPlugin;
  }
  throw new Error(`${name} のプラグイン関数を解決できませんでした`);
};

const KATEX_PLUGIN = resolvePlugin(katexModule, '@vscode/markdown-it-katex');

/** mermaid はハイライトせず、クライアントが描画できる形で出す */
const MERMAID_LANGS = new Set(['mermaid']);

const renderMermaidBlock = (code: string): string =>
  `<pre class="mermaid">${escapeHtml(code)}</pre>`;

/** 指定属性がドキュメント相対なら rewrite を通す描画ルールを作る。 */
const withRewrite = (
  base: RendererRule,
  attr: string,
  rewrite: (value: string) => string,
): RendererRule =>
  (tokens, idx, options, env, self) => {
    // attrGet は string | number | null を返すため文字列に絞る
    const value = tokens[idx]?.attrGet(attr);
    const token = tokens[idx];
    if (token && typeof value === 'string' && isDocumentRelative(value)) {
      token.attrSet(attr, rewrite(value));
    }
    return base(tokens, idx, options, env, self);
  };

/**
 * Markdown → HTML の変換器を生成する。
 * 返される関数は I/O を持たない純関数であり、サーバと export コマンドで共有される。
 */
export const createRenderer = (options: RendererOptions = {}): Renderer => {
  const { allowHtml = false, rewriteHref, rewriteSrc, highlightFence } = options;

  const md = new MarkdownItFactory({
    html: allowHtml,
    linkify: true,
    breaks: false,
    highlight: (code, lang) => {
      if (MERMAID_LANGS.has(lang)) return renderMermaidBlock(code);
      return highlightFence?.(code, lang) ?? '';
    },
  });

  md.use(KATEX_PLUGIN, { throwOnError: false });

  // すべての見出しに id を振り、h2〜h3 だけ目次に載せる
  const baseHeadingOpen = md.renderer.rules.heading_open;
  md.renderer.rules.heading_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const renderEnv = asRenderEnv(env);
    if (token !== undefined && renderEnv !== null) {
      const text = headingText(tokens[idx + 1]);
      const slug = renderEnv.slug(text);
      token.attrSet('id', slug);

      const level = Number(token.tag.slice(1));
      if (isTocLevel(level)) {
        renderEnv.headings.push({ level, text, slug });
      }
    }
    return (baseHeadingOpen ?? ((t, i, o) => self.renderToken(t, i, o)))(
      tokens, idx, opts, env, self,
    );
  };

  const passthrough: RendererRule = (tokens, idx, opts, _env, self) =>
    self.renderToken(tokens, idx, opts);

  if (rewriteHref) {
    md.renderer.rules.link_open = withRewrite(
      md.renderer.rules.link_open ?? passthrough,
      'href',
      rewriteHref,
    );
  }

  if (rewriteSrc) {
    md.renderer.rules.image = withRewrite(
      md.renderer.rules.image ?? passthrough,
      'src',
      rewriteSrc,
    );
  }

  return (source) => {
    const { data, body, warnings } = extractFrontmatter(source);
    const title = readTitle(data);
    const env: RenderEnv = { headings: [], slug: createSlugger() };
    const rendered = md.render(body, env);

    // frontmatter に title があり、本文が h1 で始まらないときだけ見出しを補う
    const needsHeading = title !== null && !rendered.trimStart().startsWith('<h1');
    const html = needsHeading ? `<h1>${escapeHtml(title)}</h1>\n${rendered}` : rendered;

    return {
      html,
      toc: buildTocTree(env.headings),
      frontmatter: data,
      title,
      hasMath: html.includes('class="katex'),
      hasMermaid: html.includes('class="mermaid"'),
      warnings,
    };
  };
};
