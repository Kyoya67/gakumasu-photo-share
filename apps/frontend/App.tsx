import React, { useState } from 'react';
import { Button, Image, View, Text, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// Hono（Cloud Run）のURLを入れてください
const API_BASE = process.env.EXPO_PUBLIC_API_BASE || '';

export default function App() {
  const [uri, setUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setMsg('写真へのアクセス許可が必要です'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (res.canceled) return;
    const a = res.assets[0];
    const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: 1600 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
    setUri(out.uri);
    setMsg('');
  };

  const shoot = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setMsg('カメラ許可が必要です'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (res.canceled) return;
    const a = res.assets[0];
    const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: 1600 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG });
    setUri(out.uri);
    setMsg('');
  };

  const upload = async () => {
    if (!uri) return;
    try {
      setUploading(true);
      setMsg('アップロード先を取得中…');

      // 1) 署名付きURLを取得（contentTypeはJPEG固定でOK）
      const res = await fetch(`${API_BASE}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg' })
      });
      if (!res.ok) throw new Error('upload-url取得失敗');
      const { url, objectPath } = await res.json();

      // 2) ファイルを読み込み → そのままPUT
      setMsg('アップロード中…');
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();

      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      if (!put.ok) throw new Error(`PUT失敗: ${put.status}`);

      setMsg(`アップロード受付OK（審査中）: ${objectPath}`);
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, gap: 12, padding: 16, justifyContent: 'center' }}>
      <Button title="写真を選ぶ" onPress={pick} />
      <Button title="写真を撮る" onPress={shoot} />
      {uri && <Image source={{ uri }} style={{ width: '100%', height: 240, resizeMode: 'contain' }} />}
      <Button title="アップロード" onPress={upload} disabled={!uri || uploading || !API_BASE} />
      {uploading && <ActivityIndicator />}
      <Text selectable>{API_BASE ? '' : 'EXPO_PUBLIC_API_BASE が未設定です'}</Text>
      <Text selectable>{msg}</Text>
    </View>
  );
}
