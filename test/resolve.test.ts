import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { resolveWithinRoot } from '../src/fs/resolve.ts';

describe('resolveWithinRoot', () => {
  let root = '';
  let outside = '';

  before(async () => {
    const base = await mkdtemp(join(tmpdir(), 'mdv-test-'));
    root = join(base, 'root');
    outside = join(base, 'outside');
    await mkdir(root);
    await mkdir(outside);
    await mkdir(join(root, 'sub'));
    await writeFile(join(root, 'a.md'), '# a');
    await writeFile(join(root, 'sub', 'b.md'), '# b');
    await writeFile(join(outside, 'secret.md'), '# secret');
    await symlink(join(outside, 'secret.md'), join(root, 'link.md'));
  });

  it('root 直下のファイルを解決できる', async () => {
    const r = await resolveWithinRoot(root, 'a.md');
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.value.sizeBytes, 3);
  });

  it('サブディレクトリのファイルを解決できる', async () => {
    const r = await resolveWithinRoot(root, 'sub/b.md');
    assert.equal(r.ok, true);
  });

  it('.. による root 外への脱出を拒否する', async () => {
    const r = await resolveWithinRoot(root, '../outside/secret.md');
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'outside-root');
  });

  it('深い .. の連鎖も拒否する', async () => {
    // tmpdir の階層数に依存しないよう、確実に / まで戻る回数を指定する
    const escape = `sub/${'../'.repeat(20)}etc/passwd`;
    const r = await resolveWithinRoot(root, escape);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'outside-root');
  });

  it('絶対パス指定を拒否する', async () => {
    const r = await resolveWithinRoot(root, '/etc/passwd');
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'outside-root');
  });

  it('root 外を指すシンボリックリンクを拒否する', async () => {
    const r = await resolveWithinRoot(root, 'link.md');
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'outside-root');
  });

  it('存在しないパスは not-found', async () => {
    const r = await resolveWithinRoot(root, 'nope.md');
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'not-found');
  });

  it('ディレクトリは not-a-file', async () => {
    const r = await resolveWithinRoot(root, 'sub');
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error.type, 'not-a-file');
  });
});
