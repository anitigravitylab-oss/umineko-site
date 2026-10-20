# うみねこ公式サイト

個人事業「うみねこ」のサイトです。ビジョンは「人類のコミュニケーションコストをゼロにする。」です。公開先は https://umineko.dev です。

## 構成

HTML、CSS、少量のJavaScriptだけで作った静的サイトです。ビルドの工程はありません。外部のスクリプトやライブラリー、CDNは使っていません。フォント（和文は Pretendard JP、数字は Instrument Serif）も、サイトで使う文字に絞ったものを同梱しています。配信はCloudflare Workersの静的アセットで、`wrangler.toml` は変更していません。

- `public/index.html`：トップページ。次の6章でできています。
  - 01 Why（なぜ）：タップで進む4ステップのストーリー
  - 02 Vision（ビジョン）
  - 03 Products（プロダクト）：Zetterとあめ→はれを縦に並べて紹介。特徴を選ぶとスマホ画面が切り替わる
  - 04 Future（これから）：構想の図解ステップ
  - 05 About（うみねこのこと）：つくり手の文章と、名前カード
  - 06 Try it（つかってみる）：サービスへのリンクと、お問い合わせ
- `public/operator/index.html`：事業者情報。URL `/operator/` はそのまま維持しています。
- `public/404.html`：見つからないページ用の404ページ
- `public/assets/main.css`：配色・余白・レイアウト・動き。色は先頭のカスタムプロパティで調整できます。
- `public/assets/main.js`：メニュー、ステップ表示、カード切り替え、名前カード、メールアドレスのコピー、スクロール演出
- `public/assets/og.png`：SNS共有用の画像（1200×630）
- `public/assets/fonts/`：Pretendard JP と Instrument Serif Italic を、サイトで使う文字だけに絞ったものと、それぞれのライセンス（`OFL-*.txt`）
- `tools/build_font.py`：上のフォントを作り直すスクリプト。本文の文字を変えたら実行してください（`pip install fonttools brotli` が必要）
- `public/assets/logo-*.png`, `*-mark-160.png`：ロゴとサービスマークの縮小版
- `public/_headers`, `robots.txt`, `sitemap.xml`：配信ヘッダーと検索エンジン向けの設定

カモメのシルエットは、既存ロゴの絵柄からベクターに起こしたものです。アイコンと一緒に、トップページの先頭に `<symbol>` として埋め込んであります。

## ローカル確認

```sh
python3 -m http.server 8799 --directory public
```

ブラウザで http://localhost:8799 を開いて確認します。

Pythonの簡易サーバーでは、`_headers` と独自の404ページは再現されません。Cloudflareの配信仕様まで含めて確認したい場合は、既存のWrangler環境で `wrangler dev --port 8799` を使ってください。

## テスト

```sh
python3 tests/check_site.py                              # 構造チェック（依存なし）
node --check public/assets/main.js
node tests/browser_check.cjs                             # ブラウザチェック（playwright パッケージが必要）
node tests/browser_check.cjs --screenshots /tmp/umineko  # 全幅のスクリーンショットも保存
```

構造チェックで確かめていること：

- ID・リンク・参照先の整合
- 画像の代替テキスト
- 新しいタブで開くリンクの `rel` 属性
- 表記（うみねこ／Zetter／あめ→はれ）
- フォントに、ページで使う文字がすべて含まれているか（fonttools がある場合）
- 連絡先の一致
- 配信設定

ブラウザチェックでは、ページを `public/` から配信して確かめます。Workersと同じように、ディレクトリのインデックスと404ページを返す形です。確かめていることは次のとおりです。

- 320〜1920pxの7つの幅で、横スクロールが出ないか、画像が欠けていないか
- 操作：ステップ表示（矢印キーを含む）、プロダクトの画面切り替え、スマホでのカード同期、名前カード、メニュー
- メールアドレスのコピー：成功した場合と拒否された場合
- Webフォントの読み込みと、波紋が「ゼロ」から広がっているか
- JavaScriptを切った状態と、モーションを減らす設定での表示

本番のHTTPヘッダー、iPhone実機のSafari、外部サイトへの実際の遷移は、このテストの範囲外です。

## 掲載内容を編集するとき

- 本文はHTMLに直接書いてあります。
- ビジョンと文章の根拠は `docs/vision.md`、デザインの決めごとは `docs/design-notes.md` にあります。
- 表記は「うみねこ」（ひらがな）、「Zetter」、「あめ→はれ」に統一しています。
- Zetter と あめ→はれ は、どちらもうみねこが企画・開発・運営しているサービスとして紹介しています。
- 画面イメージの投稿・会話・人物名はすべて架空のサンプルです。
- 利用者数・料金・モデル名など、変わりやすい数値は載せていません。
- 連絡先は、うみねこが contact@umineko.dev、Zetter が contact@z-etter.com です。変えるときは次の3か所を更新してください。
  - 全ページの `mailto:`
  - トップページの `data-copy` と JSON-LD
  - テストの `EMAIL`

## 公開

GitHubへの反映と、Cloudflareへの本番デプロイは別の作業です。GitHubとの自動連携はなく、これまでの公開はすべて `wrangler deploy` で行っています。

```sh
wrangler deploy --dry-run   # 公開されるファイルの確認
wrangler deploy             # 本番（umineko.dev）へ公開
wrangler rollback <バージョンID>   # 問題があったときに前のバージョンへ戻す
```

Cloudflareの認証情報（`CLOUDFLARE_API_TOKEN`）が必要です。アカウントIDとドメインは `wrangler.toml` にあります。

公開の記録：

- 2026-10-20：全面リニューアルを公開（バージョン `ad7e6941`）。戻す場合の直前のバージョンは `a07b6841`。
- 2026-10-20：読点を減らした文章を公開（バージョン `003ee301`）。戻す場合の直前のバージョンは `ad7e6941`。
- 2026-10-20：Zetterの紹介を「人ともAIとも話せるSNS」に変更して公開（バージョン `71eeda5c`）。戻す場合の直前のバージョンは `003ee301`。
