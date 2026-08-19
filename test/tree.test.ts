import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { buildTree, findReadme, isMarkdownPath, type FileNode } from '../src/fs/tree.ts';

const names = (nodes: readonly FileNode[]): string[] => nodes.map((n) => n.name);

describe('buildTree', () => {
  let root = '';

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'mdv-tree-'));
    await writeFile(join(root, 'README.md'), '# readme');
    await writeFile(join(root, 'b.md'), '# b');
    await writeFile(join(root, 'a.markdown'), '# a');
    await writeFile(join(root, 'ignored.txt'), 'text');

    await mkdir(join(root, 'guide'));
    await writeFile(join(root, 'guide', 'intro.md'), '# intro');
    await mkdir(join(root, 'guide', 'deep'));
    await writeFile(join(root, 'guide', 'deep', 'x.md'), '# x');

    // Markdown を含まないディレクトリ
    await mkdir(join(root, 'images'));
    await writeFile(join(root, 'images', 'logo.png'), '');

    // 除外対象
    await mkdir(join(root, 'node_modules'));
    await writeFile(join(root, 'node_modules', 'pkg.md'), '# pkg');
    await mkdir(join(root, '.hidden'));
    await writeFile(join(root, '.hidden', 'secret.md'), '# secret');
    await writeFile(join(root, '.dotfile.md'), '# dot');

    await symlink(join(root, 'b.md'), join(root, 'link.md'));
  });

  it('Markdown 以外のファイルを含めない', async () => {
    const tree = await buildTree(root);
    assert.ok(!names(tree).includes('ignored.txt'));
  });

  it('.md と .markdown の両方を含める', async () => {
    const tree = await buildTree(root);
    assert.ok(names(tree).includes('b.md'));
    assert.ok(names(tree).includes('a.markdown'));
  });

  it('ディレクトリを先に、その中は名前順で並べる', async () => {
    const tree = await buildTree(root);
    assert.deepEqual(names(tree), ['guide', 'a.markdown', 'b.md', 'README.md']);
  });

  it('node_modules とドット始まりを除外する', async () => {
    const tree = await buildTree(root);
    const flat = JSON.stringify(tree);
    assert.ok(!flat.includes('node_modules'));
    assert.ok(!flat.includes('.hidden'));
    assert.ok(!flat.includes('.dotfile.md'));
  });

  it('Markdown を含まないディレクトリを表示しない', async () => {
    const tree = await buildTree(root);
    assert.ok(!names(tree).includes('images'));
  });

  it('シンボリックリンクを追わない', async () => {
    const tree = await buildTree(root);
    assert.ok(!names(tree).includes('link.md'));
  });

  it('ネストしたディレクトリを再帰的に辿る', async () => {
    const tree = await buildTree(root);
    const guide = tree.find((n) => n.name === 'guide');
    assert.equal(guide?.kind, 'dir');
    assert.deepEqual(
      guide?.kind === 'dir' ? names(guide.children) : [],
      ['deep', 'intro.md'],
    );
    const deep = guide?.kind === 'dir' ? guide.children.find((n) => n.name === 'deep') : undefined;
    assert.equal(deep?.kind === 'dir' ? deep.children[0]?.relPath : '', 'guide/deep/x.md');
  });
});

describe('findReadme', () => {
  it('README.md を見つける', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mdv-rm-'));
    await writeFile(join(root, 'README.md'), '');
    await writeFile(join(root, 'other.md'), '');
    assert.equal(await findReadme(root), 'README.md');
  });

  it('大文字小文字を問わない', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mdv-rm2-'));
    await writeFile(join(root, 'readme.markdown'), '');
    assert.equal(await findReadme(root), 'readme.markdown');
  });

  it('README が無ければ index.md を使う', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mdv-rm3-'));
    await writeFile(join(root, 'index.md'), '');
    assert.equal(await findReadme(root), 'index.md');
  });

  it('どちらも無ければ null', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mdv-rm4-'));
    await writeFile(join(root, 'a.md'), '');
    assert.equal(await findReadme(root), null);
  });
});

describe('isMarkdownPath', () => {
  it('拡張子で判定する', () => {
    assert.equal(isMarkdownPath('a.md'), true);
    assert.equal(isMarkdownPath('a.MARKDOWN'), true);
    assert.equal(isMarkdownPath('a.txt'), false);
    assert.equal(isMarkdownPath('md'), false);
  });
});
