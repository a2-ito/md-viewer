import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createBroadcaster } from "../src/server/broadcast.ts";
import { watchMarkdown, type ChangeEvent } from "../src/fs/watcher.ts";

const wait = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** 監視開始からイベントが落ち着くまで待つ */
const SETTLE_MS = 400;

describe("createBroadcaster", () => {
  const event: ChangeEvent = { kind: "change", relPath: "a.md" };

  it("購読者全員に配る", () => {
    const b = createBroadcaster();
    const seen: string[] = [];
    b.subscribe(() => seen.push("one"));
    b.subscribe(() => seen.push("two"));
    b.publish(event);
    assert.deepEqual(seen, ["one", "two"]);
  });

  it("解除すると届かなくなる", () => {
    const b = createBroadcaster();
    let count = 0;
    const off = b.subscribe(() => {
      count += 1;
    });
    b.publish(event);
    off();
    b.publish(event);
    assert.equal(count, 1);
    assert.equal(b.size(), 0);
  });

  it("購読者がいなくても publish は落ちない", () => {
    assert.doesNotThrow(() => createBroadcaster().publish(event));
  });
});

describe("watchMarkdown", () => {
  it("Markdown の変更を相対パスで通知する", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdv-watch-"));
    await mkdir(join(root, "guide"));
    await writeFile(join(root, "guide", "a.md"), "# a");

    const events: ChangeEvent[] = [];
    const watcher = watchMarkdown(root, (e) => events.push(e), 30);
    await wait(SETTLE_MS);

    await writeFile(join(root, "guide", "a.md"), "# a2");
    await wait(SETTLE_MS);
    await watcher.close();

    assert.deepEqual(events, [{ kind: "change", relPath: "guide/a.md" }]);
  });

  it("連続した保存を 1 回にまとめる", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdv-watch2-"));
    await writeFile(join(root, "a.md"), "1");

    const events: ChangeEvent[] = [];
    const watcher = watchMarkdown(root, (e) => events.push(e), 80);
    await wait(SETTLE_MS);

    for (const n of [2, 3, 4, 5]) {
      await writeFile(join(root, "a.md"), String(n));
      await wait(10);
    }
    await wait(SETTLE_MS);
    await watcher.close();

    assert.equal(events.length, 1);
  });

  it("Markdown 以外の変更は通知しない", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdv-watch3-"));
    await writeFile(join(root, "note.txt"), "x");

    const events: ChangeEvent[] = [];
    const watcher = watchMarkdown(root, (e) => events.push(e), 30);
    await wait(SETTLE_MS);

    await writeFile(join(root, "note.txt"), "y");
    await writeFile(join(root, "image.png"), "z");
    await wait(SETTLE_MS);
    await watcher.close();

    assert.deepEqual(events, []);
  });

  it("除外ディレクトリとドット始まりを無視する", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdv-watch4-"));
    await mkdir(join(root, "node_modules"));
    await mkdir(join(root, ".hidden"));

    const events: ChangeEvent[] = [];
    const watcher = watchMarkdown(root, (e) => events.push(e), 30);
    await wait(SETTLE_MS);

    await writeFile(join(root, "node_modules", "pkg.md"), "# x");
    await writeFile(join(root, ".hidden", "secret.md"), "# y");
    await wait(SETTLE_MS);
    await watcher.close();

    assert.deepEqual(events, []);
  });

  it("追加と削除も通知する", async () => {
    const root = await mkdtemp(join(tmpdir(), "mdv-watch5-"));

    const events: ChangeEvent[] = [];
    const watcher = watchMarkdown(root, (e) => events.push(e), 30);
    await wait(SETTLE_MS);

    await writeFile(join(root, "new.md"), "# new");
    await wait(SETTLE_MS);
    await rm(join(root, "new.md"));
    await wait(SETTLE_MS);
    await watcher.close();

    assert.deepEqual(
      events.map((e) => e.kind),
      ["add", "unlink"],
    );
  });
});
