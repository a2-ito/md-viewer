# md-viewer

ローカルの Markdown をブラウザで快適に**閲覧**するための CLI ビューワでっしゅ。

```bash
$ md-viewer ./docs
  ✓ serving README.md at http://127.0.0.1:5711
    watching for changes
    press Ctrl+C to stop
```

## 特徴

- **3カラム表示** — ファイルツリー / 本文 / 目次
- **Mermaid 図・数式 (KaTeX)・シンタックスハイライト (Shiki)** に対応
- **ライブリロード** — 保存すると即反映。**スクロール位置はそのまま**
- **静的 HTML 出力** — 単体で開けるページ群を書き出せる
- **PDF 出力** — 印刷用スタイル付き（ブラウザの印刷機能を利用）
- **ダークモード追従** — OS の設定に合わせて切り替わる
- **閲覧専用** — ファイルを書き換えないので、サーバは read-only で完結する

フロントエンドフレームワークは使ってまっしゅん。ツリーの開閉は `<details>` に委ね、
クライアント JS は目次追従・図の描画・ライブリロード・開閉の記憶だけを担いまっしゅ。

## 必要環境

- Node.js 20 以上

## セットアップ

```bash
git clone https://github.com/a2-ito/md-viewer.git
cd md-viewer
npm install
npm run build
```

グローバルコマンドとして使う場合:

```bash
npm link
md-viewer ./docs
```

## 使い方

```bash
md-viewer ./docs        # フォルダ（README.md があれば自動で開く）
md-viewer DESIGN.md     # 単一ファイル
```

ブラウザが自動で開きまっしゅ。ポートは 5711 から順に空きを探しまっしゅ。

### オプション

| オプション | 説明 |
|---|---|
| `-p, --port <number>` | 待ち受けポート（既定: 5711 から探索）。明示した場合は使用中ならエラー |
| `--no-open` | ブラウザを自動で開かない |
| `--no-watch` | ファイル変更を監視しない |
| `--allow-html` | Markdown 内の生 HTML を許可する（信頼できるファイルのみ） |

### frontmatter

YAML frontmatter は本文に表示されまっしゅん。`title` があれば見出しとタブ名に使われまっしゅ。

```markdown
---
title: 設計メモ
tags: [design]
---

本文はここから。
```

解釈できない YAML があっても本文の表示は止まらず、画面上部に警告が出まっしゅ。

## 静的 HTML として書き出す

```bash
md-viewer export ./docs -o ./site
```

```
site/
├── index.html          # README.md の複製（入口）
├── README.html
├── guide/intro.html
├── img/logo.svg        # 参照された画像だけ複製
└── _assets/
    ├── katex.css
    ├── mermaid.js
    └── fonts/*.woff2
```

- CSS は各ページにインライン化されまっしゅ
- ファイル間リンク（`./setup.md`）は `./setup.html` に書き換わりまっしゅ
- mermaid と KaTeX は `_assets/` を相対参照しまっしゅ（サイズが大きいため 1 部だけ置きまっしゅ）
- `file://` でも動くよう、埋め込むスクリプトは classic script に限ってまっしゅ

## セキュリティ

閲覧専用のローカルツールでっしゅが、以下は入れてまっしゅ。

| リスク | 対策 |
|---|---|
| 外部からのアクセス | `127.0.0.1` のみに bind |
| パストラバーサル | `realpath` 解決後にルート配下か検証（シンボリックリンクも追跡して再検証） |
| Markdown 内の生 HTML による XSS | 既定でエスケープ（`--allow-html` で明示的に解除） |
| DNS rebinding | `Host` ヘッダを localhost 系に限定 |
| 巨大ファイル | 10MB 超は生テキスト表示にフォールバック |
| SVG 内のスクリプト | `Content-Security-Policy` と `nosniff` を付与 |

## 開発

```bash
npm run build      # tsc でビルド
npm test           # node:test（100 ケース）
npm run typecheck  # 型チェックのみ
```

### 構成

```
src/
├── core/      Markdown → HTML の変換（I/O を持たない純関数）
├── fs/        ツリー走査・パス解決・ファイル監視
├── view/      シェル HTML・ツリー・目次の描画
├── server/    hono ルーティング・SSE・ハイライタ
├── export/    静的サイト出力
├── client/    ブラウザ側スクリプト
└── cli/       エントリポイント
```

変換ロジックを `core/` の純関数に閉じ込めているため、I/O なしで全機能をテストでき、
表示サーバと `export` コマンドが同じコードを共有しまっしゅ。

設計の詳細と選定理由は [DESIGN.md](./DESIGN.md) を見てくださいっしゅ。

## ライセンス

MIT
