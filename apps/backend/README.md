# Hono API サーバー

この API サーバーは **Hono** を使って構築されています。Hono は軽量・高速な JavaScript/TypeScript 向け Web フレームワークで、Express よりも小さい構成で動作します。
今回の役割は、**GCP（Google Cloud Platform）の Cloud Run 上で動き、GCS（Google Cloud Storage）に直接画像をアップロードできる「署名付きURL」を発行すること**です。

## 1. 必要な環境変数

* `BUCKET`
  → GCSバケット名（例: `gakumasu-photos`）
  この値を使ってアップロード先のオブジェクトを作成します。

## 2. API エンドポイント

* `GET /healthz`
  → 動作確認用。`ok` を返すだけ。

* `POST /validate-photo`
  → **学マス内写真の検証用エンドポイント**
  
  * リクエスト: `multipart/form-data` で画像ファイルを送信
  * 処理内容:
    1. 画像サイズの検証（1920x1080〜4000x3000ピクセル）
    2. 左下の著作権文章の検証（OCRで「学マス」関連のテキストを検出）
  * レスポンス例:
    ```json
    {
      "success": true,
      "isValid": true,
      "sizeValidation": {
        "isValid": true,
        "width": 1920,
        "height": 1080,
        "message": "画像サイズ: 1920x1080 - 適切なサイズです"
      },
      "copyrightValidation": {
        "isValid": true,
        "detectedText": "© 学マス",
        "message": "著作権文章を検出しました: \"© 学マス\""
      },
      "message": "学マス内で撮影された写真として適切です"
    }
    ```

* `POST /upload-url`
  → 署名付きURL発行（従来通り）

  * リクエストボディ：

    ```json
    { "contentType": "image/jpeg" }
    ```
  * 処理内容：

    1. バケット内に保存するパスを生成（`original/ランダムID.jpg`）
    2. GCSの署名付きURL（有効期限10分）を作成
    3. 署名付きURLとファイルパスをJSONで返す
  * レスポンス例：

    ```json
    {
      "id": "uuid",
      "objectPath": "original/uuid.jpg",
      "url": "https://storage.googleapis.com/...",
      "contentType": "image/jpeg"
    }
    ```

## 3. 学マス内写真の検証仕様

### 画像サイズ検証
- 最小サイズ: 1920x1080ピクセル
- 最大サイズ: 4000x3000ピクセル
- 学マス内で撮影された写真の特徴的なサイズ範囲をチェック

### 著作権文章検証
- 検索領域: 画像の左下20%の領域
- 期待されるパターン:
  - `学マス`
  - `gakumasu`（大文字小文字不問）
  - `©.*学マス`
  - `©.*gakumasu`
- OCR（Tesseract.js）を使用して日本語・英語のテキストを認識

## 4. ローカル開発の起動方法

```bash
cd apps/hono-api
npm install
BUCKET=gakumasu-photos npm run dev
```

* `BUCKET` は自分のバケット名に変更
* 実行後、`http://localhost:8080/healthz` で疎通確認

## 5. Cloud Run へのデプロイ

```bash
gcloud builds submit --tag asia-northeast1-docker.pkg.dev/$(gcloud config get-value project)/app/hono-api

gcloud run deploy hono-api \
  --image=asia-northeast1-docker.pkg.dev/$(gcloud config get-value project)/app/hono-api \
  --region=asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars BUCKET=gakumasu-photos
```

* Cloud Run の実行サービスアカウントに
  **`roles/storage.objectAdmin`** を付与する

## 6. Expo 側との接続

Expo アプリでは、この `/upload-url` を叩いて返ってきた `url` に画像を `PUT` するだけで、GCS に直接保存できます。
CORSはネイティブ環境なので基本不要です。

### 画像検証の流れ
1. ユーザーが画像を選択
2. `/validate-photo` で学マス内写真かどうかを検証
3. 検証OKの場合のみ `/upload-url` で署名付きURLを取得
4. 署名付きURLに画像をアップロード
