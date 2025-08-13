import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { Storage } from '@google-cloud/storage';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { createCanvas, loadImage } from 'canvas';
import Tesseract from 'tesseract.js';

const app = new Hono();
const storage = new Storage();
const BUCKET = process.env.BUCKET;

if (!BUCKET) {
  console.error('Missing BUCKET env');
  process.exit(1);
}

// 学マス内写真の検証設定
const GAKUMASU_PHOTO_CONFIG = {
  // 学マス内写真の特徴的なサイズ範囲（ピクセル）
  minWidth: 1920,
  minHeight: 1080,
  maxWidth: 4000,
  maxHeight: 3000,
  // 左下の著作権文章の検索範囲（画像の左下20%の領域）
  copyrightRegion: {
    x: 0,
    y: 0.8, // 画像の下20%から
    width: 0.3, // 画像の左30%
    height: 0.2 // 画像の下20%
  },
  // 期待される著作権文章のパターン
  copyrightPatterns: [
    /学マス/,
    /gakumasu/i,
    /©.*学マス/,
    /©.*gakumasu/i
  ]
};

// 画像のサイズを検証
async function validateImageSize(imageBuffer: Buffer): Promise<{ isValid: boolean; width: number; height: number; message: string }> {
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const { width = 0, height = 0 } = metadata;
    
    const isValid = width >= GAKUMASU_PHOTO_CONFIG.minWidth && 
                   height >= GAKUMASU_PHOTO_CONFIG.minHeight &&
                   width <= GAKUMASU_PHOTO_CONFIG.maxWidth && 
                   height <= GAKUMASU_PHOTO_CONFIG.maxHeight;
    
    return {
      isValid,
      width,
      height,
      message: isValid 
        ? `画像サイズ: ${width}x${height} - 適切なサイズです`
        : `画像サイズ: ${width}x${height} - 学マス内写真の特徴的なサイズではありません`
    };
  } catch (error) {
    return {
      isValid: false,
      width: 0,
      height: 0,
      message: `画像サイズの検証に失敗しました: ${error}`
    };
  }
}

// 左下の著作権文章を検証
async function validateCopyrightText(imageBuffer: Buffer): Promise<{ isValid: boolean; detectedText: string; message: string }> {
  try {
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // 画像を描画
    ctx.drawImage(image, 0, 0);
    
    // 左下の著作権検索領域を切り出し
    const regionX = Math.floor(image.width * GAKUMASU_PHOTO_CONFIG.copyrightRegion.x);
    const regionY = Math.floor(image.height * GAKUMASU_PHOTO_CONFIG.copyrightRegion.y);
    const regionWidth = Math.floor(image.width * GAKUMASU_PHOTO_CONFIG.copyrightRegion.width);
    const regionHeight = Math.floor(image.height * GAKUMASU_PHOTO_CONFIG.copyrightRegion.height);
    
    // 領域を切り出してOCRでテキスト認識
    const regionCanvas = createCanvas(regionWidth, regionHeight);
    const regionCtx = regionCanvas.getContext('2d');
    regionCtx.drawImage(canvas, regionX, regionY, regionWidth, regionHeight, 0, 0, regionWidth, regionHeight);
    
    // OCRでテキスト認識
    const { data: { text } } = await Tesseract.recognize(
      regionCanvas.toBuffer(),
      'jpn+eng', // 日本語と英語を認識
      { logger: (m: any) => console.log(m) }
    );
    
    const detectedText = text.trim();
    console.log(`検出されたテキスト: "${detectedText}"`);
    
    // 著作権パターンと照合
    const hasCopyright = GAKUMASU_PHOTO_CONFIG.copyrightPatterns.some(pattern => 
      pattern.test(detectedText)
    );
    
    return {
      isValid: hasCopyright,
      detectedText,
      message: hasCopyright 
        ? `著作権文章を検出しました: "${detectedText}"`
        : `著作権文章が検出されませんでした。検出テキスト: "${detectedText}"`
    };
  } catch (error) {
    return {
      isValid: false,
      detectedText: '',
      message: `著作権文章の検証に失敗しました: ${error}`
    };
  }
}

// 画像の総合検証
async function validateGakumasuPhoto(imageBuffer: Buffer): Promise<{
  isValid: boolean;
  sizeValidation: { isValid: boolean; width: number; height: number; message: string };
  copyrightValidation: { isValid: boolean; detectedText: string; message: string };
  message: string;
}> {
  const sizeValidation = await validateImageSize(imageBuffer);
  const copyrightValidation = await validateCopyrightText(imageBuffer);
  
  const isValid = sizeValidation.isValid && copyrightValidation.isValid;
  
  return {
    isValid,
    sizeValidation,
    copyrightValidation,
    message: isValid 
      ? '学マス内で撮影された写真として適切です'
      : '学マス内で撮影された写真ではありません'
  };
}

app.get('/healthz', (c) => c.text('ok'));

// 画像検証エンドポイント
app.post('/validate-photo', async (c: any) => {
  try {
    const formData = await c.req.formData();
    const imageFile = formData.get('image') as File;
    
    if (!imageFile) {
      return c.json({ error: '画像ファイルが提供されていません' }, 400);
    }
    
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const validationResult = await validateGakumasuPhoto(imageBuffer);
    
    return c.json({
      success: true,
      ...validationResult
    });
  } catch (error) {
    console.error('画像検証エラー:', error);
    return c.json({ 
      error: '画像検証中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

app.post('/upload-url', async (c: any) => {
  const body = await c.req.json().catch(() => ({}));
  const contentType: string = body?.contentType || 'image/jpeg';
  const id = uuid();
  const objectPath = `original/${id}.jpg`;
  const file = storage.bucket(BUCKET!).file(objectPath);

  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000, // 10分
    contentType
  });

  return c.json({ id, objectPath, url, contentType });
});

const port = Number(process.env.PORT || 8080);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Hono API listening on :${port}`);
});
