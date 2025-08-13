# Gakumasu Photo Share Frontend

写真共有アプリのフロントエンド（Expo + TypeScript）

## セットアップ

1. 依存関係のインストール
```bash
npm install
```

2. 環境変数の設定
`.env`ファイルを作成して、以下の内容を追加してください：
```
EXPO_PUBLIC_API_BASE=https://your-api-url.run.app
```

## 実行方法

### iOSシミュレーター
```bash
npm run ios
```

### Androidエミュレーター
```bash
npm run android
```

### Webブラウザ
```bash
npm run web
```

## 機能

- 📸 写真を撮影
- 🖼️ 写真ライブラリから選択
- 📤 写真のアップロード（Hono API経由）
- 🖼️ 画像のリサイズ・圧縮（1600px幅、JPEG、85%品質）

## 必要な権限

- カメラアクセス
- 写真ライブラリアクセス
- ストレージアクセス（Android）

## 技術スタック

- Expo SDK
- React Native
- TypeScript
- expo-image-picker
- expo-image-manipulator
