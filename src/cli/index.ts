#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { serve } from '@hono/node-server';
import { Command } from 'commander';
import { isMarkdownPath, findReadme } from '../fs/tree.ts';
import { watchMarkdown } from '../fs/watcher.ts';
import { createApp } from '../server/app.ts';
import { createBroadcaster } from '../server/broadcast.ts';
import { createFenceHighlighter } from '../server/highlight.ts';
import { exportSite } from '../export/site.ts';

/** 既定ポート。使用中なら順に +1 して空きを探す（DESIGN §11-1） */
const DEFAULT_PORT = 5711;
const PORT_SCAN_LIMIT = 20;
const BIND_HOST = '127.0.0.1';

const isPortFree = (port: number): Promise<boolean> =>
  new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.once('listening', () => probe.close(() => done(true)));
    probe.listen(port, BIND_HOST);
  });

/** start から順に空きポートを探す。見つからなければ null。 */
const findPort = async (start: number): Promise<number | null> => {
  for (let port = start; port < start + PORT_SCAN_LIMIT; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
};

const openBrowser = (url: string): void => {
  const [cmd, args] =
    process.platform === 'darwin'
      ? (['open', [url]] as const)
      : process.platform === 'win32'
        ? (['cmd', ['/c', 'start', '', url]] as const)
        : (['xdg-open', [url]] as const);
  spawn(cmd, [...args], { stdio: 'ignore', detached: true }).unref();
};

const die = (message: string): never => {
  process.stderr.write(`md-viewer: ${message}\n`);
  process.exit(1);
};

type Options = {
  readonly port?: string;
  readonly open: boolean;
  readonly watch: boolean;
  readonly allowHtml: boolean;
};

const main = async (target: string, options: Options): Promise<void> => {
  const absTarget = resolve(process.cwd(), target);

  const info = await stat(absTarget).catch(() =>
    die(`パスが見つかりません: ${target}`),
  );

  // フォルダ指定なら README を初期表示に、ファイル指定ならその親を公開ルートにする
  let root: string;
  let entryRelPath: string | null;

  if (info.isDirectory()) {
    root = absTarget;
    entryRelPath = await findReadme(absTarget);
  } else if (isMarkdownPath(absTarget)) {
    root = dirname(absTarget);
    entryRelPath = basename(absTarget);
  } else {
    return die(`Markdown ファイル（.md / .markdown）かフォルダを指定してください: ${target}`);
  }

  const requested = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
    return die(`ポート番号が不正です: ${options.port}`);
  }

  // --port を明示された場合は勝手にずらさず、埋まっていればエラーにする
  const port =
    options.port === undefined
      ? await findPort(requested)
      : (await isPortFree(requested))
        ? requested
        : null;

  if (port === null) {
    return die(
      options.port === undefined
        ? `空きポートが見つかりません（${requested}〜${requested + PORT_SCAN_LIMIT - 1} を確認しました）`
        : `ポート ${requested} は使用中です`,
    );
  }

  // ハイライタの構築は I/O を伴うため起動時に一度だけ行う
  const highlightFence = await createFenceHighlighter();

  const broadcaster = createBroadcaster();
  const watcher = options.watch
    ? watchMarkdown(root, (event) => broadcaster.publish(event))
    : null;

  const app = createApp({
    root,
    entryRelPath,
    allowHtml: options.allowHtml,
    highlightFence,
    ...(watcher === null ? {} : { broadcaster }),
  });

  // Ctrl+C で監視を畳んでから終了する
  const shutdown = (): void => {
    void (watcher?.close() ?? Promise.resolve()).finally(() => {
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  const url = `http://${BIND_HOST}:${port}`;

  serve({ fetch: app.fetch, hostname: BIND_HOST, port }, () => {
    process.stdout.write(`  ✓ serving ${entryRelPath ?? basename(root) + '/'} at ${url}\n`);
    if (watcher !== null) process.stdout.write(`    watching for changes\n`);
    process.stdout.write(`    press Ctrl+C to stop\n`);
    if (options.open) openBrowser(url);
  });
};

type ExportOptions = {
  readonly out: string;
  readonly allowHtml: boolean;
};

const runExport = async (target: string, options: ExportOptions): Promise<void> => {
  const absTarget = resolve(process.cwd(), target);
  const info = await stat(absTarget).catch(() => die(`パスが見つかりません: ${target}`));

  if (!info.isDirectory() && !isMarkdownPath(absTarget)) {
    return die(`Markdown ファイルかフォルダを指定してください: ${target}`);
  }

  const root = info.isDirectory() ? absTarget : dirname(absTarget);
  const only = info.isDirectory() ? undefined : basename(absTarget);
  const outDir = resolve(process.cwd(), options.out);

  // 出力先が対象の内側にあると、出力物を再び読み込んでしまう
  if (outDir === root || !relative(root, outDir).startsWith('..')) {
    return die(`出力先は対象フォルダの外を指定してください: ${options.out}`);
  }

  const highlightFence = await createFenceHighlighter();
  const result = await exportSite({
    root,
    outDir,
    allowHtml: options.allowHtml,
    highlightFence,
    ...(only === undefined ? {} : { only }),
  });

  process.stdout.write(`  ✓ ${result.pages.length} ページを書き出しました → ${outDir}\n`);
  if (result.copiedAssets.length > 0) {
    process.stdout.write(`    画像など ${result.copiedAssets.length} 件を複製しました\n`);
  }
  for (const missing of result.missingAssets) {
    process.stderr.write(`  ! 参照先が見つかりません: ${missing}\n`);
  }
  for (const warning of result.warnings) {
    process.stderr.write(`  ! ${warning}\n`);
  }
};

const program = new Command()
  .name('md-viewer')
  .description('ローカルの Markdown をブラウザで閲覧する')
  .argument('<path>', 'Markdown ファイル、またはフォルダのパス')
  .option('-p, --port <number>', `待ち受けポート（既定: ${DEFAULT_PORT} から空きを探索）`)
  .option('--no-open', 'ブラウザを自動で開かない')
  .option('--no-watch', 'ファイル変更を監視しない')
  .option('--allow-html', 'Markdown 内の生 HTML を許可する（信頼できるファイルのみ）', false)
  .action(main);

program
  .command('export')
  .description('Markdown を単体で開ける静的 HTML として書き出す')
  .argument('<path>', 'Markdown ファイル、またはフォルダのパス')
  .requiredOption('-o, --out <dir>', '出力先ディレクトリ')
  .option('--allow-html', 'Markdown 内の生 HTML を許可する（信頼できるファイルのみ）', false)
  .action(runExport);

await program.parseAsync(process.argv);
