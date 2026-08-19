import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDocumentRelative, splitHash } from '../src/core/links.ts';
import { createLinkRewriters } from '../src/server/app.ts';
import { createRenderer } from '../src/core/renderer.ts';

describe('isDocumentRelative', () => {
  it('相対パスは対象', () => {
    assert.equal(isDocumentRelative('setup.md'), true);
    assert.equal(isDocumentRelative('../img/a.png'), true);
  });

  it('外部 URL・アンカー・絶対パスは対象外', () => {
    for (const href of ['https://example.com', 'http://a', '//cdn/x', 'mailto:a@b', '#sec', '/abs.md', '']) {
      assert.equal(isDocumentRelative(href), false, href);
    }
  });
});

describe('splitHash', () => {
  it('パスとハッシュを分ける', () => {
    assert.deepEqual(splitHash('a.md#sec'), ['a.md', '#sec']);
    assert.deepEqual(splitHash('a.md'), ['a.md', '']);
    assert.deepEqual(splitHash('#sec'), ['', '#sec']);
  });
});

describe('createLinkRewriters', () => {
  it('同階層の Markdown を /view/ に向ける', () => {
    const { rewriteHref } = createLinkRewriters('README.md');
    assert.equal(rewriteHref('guide/intro.md'), '/view/guide/intro.md');
  });

  it('サブディレクトリからの相対リンクを解決する', () => {
    const { rewriteHref } = createLinkRewriters('guide/intro.md');
    assert.equal(rewriteHref('setup.md'), '/view/guide/setup.md');
    assert.equal(rewriteHref('../README.md'), '/view/README.md');
  });

  it('ハッシュを保持する', () => {
    const { rewriteHref } = createLinkRewriters('a.md');
    assert.equal(rewriteHref('b.md#section'), '/view/b.md#section');
  });

  it('Markdown 以外は /assets/ に向ける', () => {
    const { rewriteHref } = createLinkRewriters('docs/a.md');
    assert.equal(rewriteHref('data.csv'), '/assets/docs/data.csv');
  });

  it('root 外へ出る相対リンクは書き換えない', () => {
    const { rewriteHref } = createLinkRewriters('a.md');
    assert.equal(rewriteHref('../outside.md'), '../outside.md');
  });

  it('画像は常に /assets/ に向ける', () => {
    const { rewriteSrc } = createLinkRewriters('guide/intro.md');
    assert.equal(rewriteSrc('./img/logo.png'), '/assets/guide/img/logo.png');
  });
});

describe('renderer とリンク書き換えの結合', () => {
  const { rewriteHref, rewriteSrc } = createLinkRewriters('guide/intro.md');
  const render = createRenderer({ rewriteHref, rewriteSrc });

  it('本文中のリンクが書き換わる', () => {
    assert.match(render('[次](setup.md)').html, /href="\/view\/guide\/setup\.md"/);
  });

  it('外部リンクは触らない', () => {
    assert.match(render('[外部](https://example.com)').html, /href="https:\/\/example\.com"/);
  });

  it('画像が書き換わる', () => {
    assert.match(render('![図](img/a.png)').html, /src="\/assets\/guide\/img\/a\.png"/);
  });
});
