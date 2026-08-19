import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractFrontmatter, readTitle } from '../src/core/frontmatter.ts';

describe('extractFrontmatter', () => {
  it('frontmatter が無ければ本文をそのまま返す', () => {
    const r = extractFrontmatter('# 見出し\n\n本文');
    assert.deepEqual(r.data, {});
    assert.equal(r.body, '# 見出し\n\n本文');
    assert.deepEqual(r.warnings, []);
  });

  it('YAML を解釈して本文から除去する', () => {
    const r = extractFrontmatter('---\ntitle: 記事\ntags:\n  - a\n  - b\n---\n\n本文');
    assert.equal(r.data['title'], '記事');
    assert.deepEqual(r.data['tags'], ['a', 'b']);
    assert.equal(r.body, '\n本文');
  });

  it('CRLF 改行でも解釈できる', () => {
    const r = extractFrontmatter('---\r\ntitle: 記事\r\n---\r\n本文');
    assert.equal(r.data['title'], '記事');
    assert.equal(r.body, '本文');
  });

  it('... で閉じる形式も受け付ける', () => {
    const r = extractFrontmatter('---\ntitle: 記事\n...\n本文');
    assert.equal(r.data['title'], '記事');
  });

  it('空の frontmatter は空オブジェクトになる', () => {
    const r = extractFrontmatter('---\n\n---\n本文');
    assert.deepEqual(r.data, {});
    assert.deepEqual(r.warnings, []);
  });

  it('閉じ区切りが無ければ frontmatter とみなさない', () => {
    const source = '---\n\n# 水平線で始まる文書';
    const r = extractFrontmatter(source);
    assert.equal(r.body, source);
  });

  it('壊れた YAML は警告を返し本文表示を止めない', () => {
    const r = extractFrontmatter('---\ntitle: "閉じない\n---\n本文');
    assert.deepEqual(r.data, {});
    assert.equal(r.body, '本文');
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0] ?? '', /YAML/);
  });

  it('マッピング以外の YAML は警告して無視する', () => {
    const r = extractFrontmatter('---\n- a\n- b\n---\n本文');
    assert.deepEqual(r.data, {});
    assert.equal(r.warnings.length, 1);
  });
});

describe('readTitle', () => {
  it('文字列の title を取り出す', () => {
    assert.equal(readTitle({ title: '  記事  ' }), '記事');
  });

  it('文字列以外や空文字は null', () => {
    assert.equal(readTitle({ title: 42 }), null);
    assert.equal(readTitle({ title: '   ' }), null);
    assert.equal(readTitle({}), null);
  });
});
