# md-viewer 動作確認

これは **M1** の表示確認用ファイルでっしゅ。

## リストと引用

- 箇条書き1
- 箇条書き2
  - ネスト

> 引用ブロック。

## 表

| 項目 | 値 |
|---|---|
| ポート | 5711 |
| バインド | 127.0.0.1 |

## コード

```typescript
const render = createRenderer({ allowHtml: false });
```

## リンクと生HTML

[Anthropic](https://www.anthropic.com) へのリンク。

<script>alert('xss')</script>

<b>この生HTMLはエスケープされるべき</b>
