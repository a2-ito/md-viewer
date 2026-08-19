import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRenderer } from '../src/core/renderer.ts';

describe('createRenderer', () => {
  const render = createRenderer();

  it('見出しを変換する', () => {
    assert.match(render('# タイトル').html, /<h1 id="タイトル">タイトル<\/h1>/);
  });

  it('表を変換する', () => {
    const html = render('| a | b |\n|---|---|\n| 1 | 2 |').html;
    assert.match(html, /<table>/);
    assert.match(html, /<th>a<\/th>/);
  });

  it('既定では生 HTML をエスケープする', () => {
    const html = render("<script>alert('xss')</script>").html;
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it('allowHtml で生 HTML を通す', () => {
    const html = createRenderer({ allowHtml: true })('<b>太字</b>').html;
    assert.match(html, /<b>太字<\/b>/);
  });

  it('同一入力に対し同一出力を返す（純関数）', () => {
    const src = '# a\n\ntext';
    assert.equal(render(src).html, render(src).html);
  });
});

describe('frontmatter との統合', () => {
  const render = createRenderer();

  it('title を h1 として補う', () => {
    const r = render('---\ntitle: 記事タイトル\n---\n\n本文');
    assert.match(r.html, /^<h1>記事タイトル<\/h1>/);
    assert.equal(r.title, '記事タイトル');
  });

  it('本文が h1 で始まるなら重複させない', () => {
    const r = render('---\ntitle: 記事タイトル\n---\n\n# 本文の見出し');
    assert.doesNotMatch(r.html, /記事タイトル/);
    assert.match(r.html, /<h1 id="本文の見出し">本文の見出し<\/h1>/);
  });

  it('frontmatter を本文に漏らさない', () => {
    const r = render('---\ntitle: t\nsecret: 見せない\n---\n\n本文');
    assert.doesNotMatch(r.html, /secret|見せない/);
  });

  it('警告をそのまま伝える', () => {
    const r = render('---\ntitle: "閉じない\n---\n本文');
    assert.equal(r.warnings.length, 1);
  });
});

describe('数式と図', () => {
  const render = createRenderer();

  it('インライン数式を KaTeX で描画し hasMath を立てる', () => {
    const r = render('式は $E = mc^2$ です。');
    assert.match(r.html, /class="katex/);
    assert.equal(r.hasMath, true);
  });

  it('ディスプレイ数式を描画する', () => {
    const r = render('$$\n\\frac{1}{2}\n$$');
    assert.match(r.html, /katex-display/);
    assert.equal(r.hasMath, true);
  });

  it('数式が無ければ hasMath は false', () => {
    assert.equal(render('ただの本文').hasMath, false);
  });

  it('mermaid ブロックを pre.mermaid として出しエスケープする', () => {
    const r = render('```mermaid\nflowchart LR\n  A --> B\n```');
    assert.match(r.html, /<pre class="mermaid">/);
    assert.match(r.html, /A --&gt; B/);
    assert.equal(r.hasMermaid, true);
  });

  it('mermaid はハイライタに渡さない', () => {
    let called = false;
    const r = createRenderer({
      highlightFence: () => {
        called = true;
        return '<pre>ハイライト結果</pre>';
      },
    })('```mermaid\nflowchart LR\n  A --> B\n```');
    assert.equal(called, false);
    assert.match(r.html, /<pre class="mermaid">/);
  });
});

describe('highlightFence の委譲', () => {
  it('言語付きフェンスをハイライタに渡す', () => {
    const seen: Array<[string, string]> = [];
    const html = createRenderer({
      highlightFence: (code, lang) => {
        seen.push([code.trim(), lang]);
        return `<pre class="shiki">${lang}</pre>`;
      },
    })('```ts\nconst a = 1;\n```').html;
    assert.deepEqual(seen, [['const a = 1;', 'ts']]);
    assert.match(html, /<pre class="shiki">ts<\/pre>/);
  });

  it('null を返したら既定のエスケープ描画になる', () => {
    const html = createRenderer({ highlightFence: () => null })('```unknownlang\n<b>x</b>\n```').html;
    assert.match(html, /<pre><code/);
    assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  });
});

describe('目次と見出し id', () => {
  const render = createRenderer();

  it('すべての見出しに id を付ける', () => {
    const html = render('# A\n\n## B\n\n#### D').html;
    assert.match(html, /<h1 id="a">/);
    assert.match(html, /<h2 id="b">/);
    assert.match(html, /<h4 id="d">/);
  });

  it('目次には h2 と h3 だけを載せる', () => {
    const { toc } = render('# H1\n\n## H2\n\n### H3\n\n#### H4\n\n## H2b');
    assert.deepEqual(toc.map((e) => e.text), ['H2', 'H2b']);
    assert.deepEqual(toc[0]?.children.map((e) => e.text), ['H3']);
  });

  it('見出しが無ければ目次は空', () => {
    assert.deepEqual(render('ただの本文').toc, []);
  });

  it('重複見出しの id と目次の slug が一致する', () => {
    const { html, toc } = render('## 概要\n\n## 概要');
    assert.match(html, /<h2 id="概要">/);
    assert.match(html, /<h2 id="概要-1">/);
    assert.deepEqual(toc.map((e) => e.slug), ['概要', '概要-1']);
  });

  it('見出し内の強調やリンクの記法を目次テキストから落とす', () => {
    const { toc } = render('## **太字**と`コード`と[リンク](http://a)');
    assert.equal(toc[0]?.text, '太字とコードとリンク');
  });

  it('render を繰り返しても slug の連番が持ち越されない', () => {
    const first = render('## 概要').toc[0]?.slug;
    const second = render('## 概要').toc[0]?.slug;
    assert.equal(first, '概要');
    assert.equal(second, '概要');
  });
});
