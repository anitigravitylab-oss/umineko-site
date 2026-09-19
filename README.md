# うみねこ公式サイト

個人事業「うみねこ」の事業紹介・プロダクトポートフォリオ。公開先: https://umineko.dev

## 構成

HTML / CSS / 小さなJavaScriptによる静的サイトです。ビルド・ランタイム依存・外部フォント・外部JavaScriptはありません。既存のCloudflare Workers静的アセット配信を維持しています。

- `public/index.html`: 事業紹介、Zetter、あめ→はれ、ビジョン、開発姿勢、事業概要、お問い合わせ
- `public/operator/index.html`: 事業者情報。既存の `/operator/` を維持
- `public/404.html`: 共通デザインの404ページ
- `public/assets/style.css`: 配色・余白・レスポンシブ・動きを減らす設定
- `public/assets/site.js`: モバイルナビ、あめ／はれの紹介切替、メールアドレスのコピー、短いスクロール演出
- `public/assets/connection.svg`: このサイト用のオリジナル線画。外部素材の転載ではありません
- `public/_headers`, `public/robots.txt`, `public/sitemap.xml`: 配信ヘッダー・検索エンジン向け設定
- `wrangler.toml`: 既存の配信設定（変更なし）

## ローカル確認

```sh
python3 -m http.server 8799 --directory public
```

http://localhost:8799 を開きます。Cloudflareの配信仕様を含めて確認する場合は、既存のWrangler環境で `wrangler dev --port 8799` を実行してください。Pythonの簡易サーバーでは `_headers` および独自404の配信は再現されません。

## テスト

```sh
python3 tests/check_site.py
node --check public/assets/site.js
```

ブラウザー確認を追加する場合（テスト用の任意依存）:

```sh
python3 -m pip install playwright
python3 -m playwright install chromium
python3 tests/check_site.py --browser --screenshots /tmp/umineko-preview
```

ブラウザーテストはHTML/CSS/JSをそのままメモリ上でレンダリングします。320〜1920pxの7幅、3ページ、モバイルメニュー、キーボード操作、あめ／はれの切替、モーション軽減、JavaScriptなしの表示を確認します。クリップボードは成功・拒否を模擬して検証します。HTTP配信・OSのクリップボード・外部サイトへの到達性・本番デプロイは別途確認してください。

## 掲載内容を編集するとき

本文はHTMLで管理しています。Zetterは企画・開発・運営、あめ→はれは開発担当（運営: しゃち）として区別しています。投稿や会話は紹介用の架空サンプルで、ユーザーの実データではありません。利用者数・料金・モデル名など変動しやすい数値は掲載していません。

連絡先を変更する場合は、両ページ・404のフッターを含むメールリンクと、トップの `data-copy-email` を更新してください。色と余白はCSS先頭のカスタムプロパティで調整できます。JavaScriptが無効でも本文・ナビ・メールリンクは利用できます。

## 公開

GitHubへのコード反映とCloudflareへの本番デプロイは別です。Git連携が設定されている場合はその結果を確認し、未設定の場合は既存のCloudflare公開手順を使用してください。この更新ではアカウントID、ドメイン、既存ロゴPNG、配信ディレクトリは変更していません。

参考サイトと編集方針: `docs/design-notes.md`
