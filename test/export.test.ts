import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { assetsPrefix, staticHref, toHtmlPath } from "../src/export/page.ts";
import { exportSite } from "../src/export/site.ts";

describe("toHtmlPath", () => {
  it("Markdown の拡張子を .html にする", () => {
    assert.equal(toHtmlPath("a.md"), "a.html");
    assert.equal(toHtmlPath("guide/b.markdown"), "guide/b.html");
  });

  it("Markdown 以外はそのまま", () => {
    assert.equal(toHtmlPath("img/a.png"), "img/a.png");
  });
});

describe("assetsPrefix", () => {
  it("階層の深さに応じて遡る", () => {
    assert.equal(assetsPrefix("README.md"), "_assets");
    assert.equal(assetsPrefix("guide/intro.md"), "../_assets");
    assert.equal(assetsPrefix("a/b/c.md"), "../../_assets");
  });
});

describe("staticHref", () => {
  it("同階層は素のファイル名", () => {
    assert.equal(staticHref("README.md")("features.md"), "features.html");
  });

  it("下の階層へ降りる", () => {
    assert.equal(staticHref("README.md")("guide/intro.md"), "guide/intro.html");
  });

  it("上の階層へ遡る", () => {
    assert.equal(staticHref("guide/intro.md")("README.md"), "../README.html");
    assert.equal(staticHref("guide/intro.md")("guide/setup.md"), "setup.html");
  });
});

/** テスト用のドキュメントツリーを用意する */
const makeFixture = async (): Promise<{ root: string; outDir: string }> => {
  const base = await mkdtemp(join(tmpdir(), "mdv-export-"));
  const root = join(base, "docs");
  await mkdir(join(root, "guide"), { recursive: true });
  await mkdir(join(root, "img"), { recursive: true });

  await writeFile(
    join(root, "README.md"),
    "# 目次\n\n- [ガイド](guide/intro.md)\n- [外部](https://example.com)\n\n![図](img/logo.svg)\n",
  );
  await writeFile(
    join(root, "guide", "intro.md"),
    "# はじめに\n\n## 節\n\n[戻る](../README.md)\n\n![図](../img/logo.svg)\n\n![欠損](../img/missing.png)\n",
  );
  await writeFile(
    join(root, "img", "logo.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );

  return { root, outDir: join(base, "out") };
};

describe("exportSite", () => {
  it("全ページを .html として書き出す", async () => {
    const { root, outDir } = await makeFixture();
    const result = await exportSite({ root, outDir });

    assert.ok(result.pages.includes("README.html"));
    assert.ok(result.pages.includes("guide/intro.html"));
    assert.ok(existsSync(join(outDir, "guide", "intro.html")));
  });

  it("README を index.html としても置く", async () => {
    const { root, outDir } = await makeFixture();
    await exportSite({ root, outDir });

    const [index, readme] = await Promise.all([
      readFile(join(outDir, "index.html"), "utf8"),
      readFile(join(outDir, "README.html"), "utf8"),
    ]);
    assert.equal(index, readme);
  });

  it("リンクを相対パスのまま .html に差し替える", async () => {
    const { root, outDir } = await makeFixture();
    await exportSite({ root, outDir });

    const readme = await readFile(join(outDir, "README.html"), "utf8");
    assert.match(readme, /href="guide\/intro\.html"/);
    assert.match(readme, /href="https:\/\/example\.com"/);

    const intro = await readFile(join(outDir, "guide", "intro.html"), "utf8");
    assert.match(intro, /href="\.\.\/README\.html"/);
  });

  it("参照された画像を同じ相対位置に複製する", async () => {
    const { root, outDir } = await makeFixture();
    const result = await exportSite({ root, outDir });

    assert.ok(existsSync(join(outDir, "img", "logo.svg")));
    assert.ok(result.copiedAssets.includes("img/logo.svg"));
  });

  it("見つからない参照を missingAssets として返す", async () => {
    const { root, outDir } = await makeFixture();
    const result = await exportSite({ root, outDir });
    assert.deepEqual(result.missingAssets, ["img/missing.png"]);
  });

  it("CSS をインライン化しサーバ絶対パスを残さない", async () => {
    const { root, outDir } = await makeFixture();
    await exportSite({ root, outDir });

    const html = await readFile(join(outDir, "README.html"), "utf8");
    assert.match(html, /<style>/);
    assert.doesNotMatch(html, /\/__static\//);
  });

  it("数式も図も無ければ共有アセットを作らない", async () => {
    const { root, outDir } = await makeFixture();
    await exportSite({ root, outDir });
    assert.equal(existsSync(join(outDir, "_assets")), false);
  });

  it("数式があれば KaTeX の CSS と woff2 を置く", async () => {
    const { root, outDir } = await makeFixture();
    await writeFile(join(root, "math.md"), "# 数式\n\n$E = mc^2$\n");
    await exportSite({ root, outDir });

    assert.ok(existsSync(join(outDir, "_assets", "katex.css")));
    const fonts = await readdir(join(outDir, "_assets", "fonts"));
    assert.ok(fonts.length > 0);
    assert.ok(fonts.every((f) => f.endsWith(".woff2")));
    assert.match(
      await readFile(join(outDir, "math.html"), "utf8"),
      /href="_assets\/katex\.css"/,
    );
  });

  it("図があれば mermaid を置き、深い階層からは ../ で参照する", async () => {
    const { root, outDir } = await makeFixture();
    await writeFile(
      join(root, "guide", "flow.md"),
      "# 図\n\n```mermaid\nflowchart LR\n  A --> B\n```\n",
    );
    await exportSite({ root, outDir });

    assert.ok(existsSync(join(outDir, "_assets", "mermaid.js")));
    const html = await readFile(join(outDir, "guide", "flow.html"), "utf8");
    assert.match(html, /src="\.\.\/_assets\/mermaid\.js"/);
    // file:// でも動くよう classic script で読み込む
    assert.doesNotMatch(html, /<script type="module"/);
  });

  it("only 指定では 1 ページだけ出力しツリーを描画しない", async () => {
    const { root, outDir } = await makeFixture();
    const result = await exportSite({ root, outDir, only: "README.md" });

    assert.deepEqual(result.pages, ["README.html"]);
    assert.equal(existsSync(join(outDir, "guide", "intro.html")), false);
    assert.doesNotMatch(
      await readFile(join(outDir, "README.html"), "utf8"),
      /class="tree-pane"/,
    );
  });

  it("壊れた frontmatter をファイル名付きの警告として返す", async () => {
    const { root, outDir } = await makeFixture();
    await writeFile(join(root, "bad.md"), '---\ntitle: "閉じない\n---\n本文\n');
    const result = await exportSite({ root, outDir });

    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0] ?? "", /^bad\.md: /);
  });
});
