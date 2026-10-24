import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTocTree,
  createSlugger,
  slugify,
  type FlatHeading,
} from "../src/core/toc.ts";

describe("slugify", () => {
  it("英語見出しを小文字ハイフン区切りにする", () => {
    assert.equal(slugify("Getting Started"), "getting-started");
  });

  it("日本語をそのまま残す", () => {
    assert.equal(slugify("目的とスコープ"), "目的とスコープ");
  });

  it("日本語と英数字の混在を扱う", () => {
    assert.equal(slugify("2. 方式選定 (CLI)"), "2-方式選定-cli");
  });

  it("記号を除去しハイフンとアンダースコアは残す", () => {
    assert.equal(slugify("a.b/c:d!e"), "abcde");
    assert.equal(slugify("foo_bar-baz"), "foo_bar-baz");
  });

  it("連続する空白や記号でハイフンが増えない", () => {
    assert.equal(slugify("a   --   b"), "a-b");
  });

  it("記号だけの見出しは section にする", () => {
    assert.equal(slugify("!!!"), "section");
    assert.equal(slugify(""), "section");
  });
});

describe("createSlugger", () => {
  it("重複する見出しに連番を付ける", () => {
    const slug = createSlugger();
    assert.equal(slug("概要"), "概要");
    assert.equal(slug("概要"), "概要-1");
    assert.equal(slug("概要"), "概要-2");
  });

  it("別の見出しは影響を受けない", () => {
    const slug = createSlugger();
    assert.equal(slug("A"), "a");
    assert.equal(slug("B"), "b");
    assert.equal(slug("A"), "a-1");
  });
});

describe("buildTocTree", () => {
  const h = (level: 2 | 3, text: string): FlatHeading => ({
    level,
    text,
    slug: text,
  });

  it("h3 を直前の h2 の子にする", () => {
    const tree = buildTocTree([h(2, "A"), h(3, "A-1"), h(3, "A-2"), h(2, "B")]);
    assert.equal(tree.length, 2);
    assert.deepEqual(
      tree[0]?.children.map((c) => c.text),
      ["A-1", "A-2"],
    );
    assert.deepEqual(tree[1]?.children, []);
  });

  it("h3 から始まる文書でも落ちない", () => {
    const tree = buildTocTree([h(3, "X"), h(2, "Y")]);
    assert.deepEqual(
      tree.map((e) => e.text),
      ["X", "Y"],
    );
  });

  it("見出しが無ければ空配列", () => {
    assert.deepEqual(buildTocTree([]), []);
  });
});
