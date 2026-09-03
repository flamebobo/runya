import Taro from '@tarojs/taro';
import type {
  AudioRecordingSession,
  FileSystemAdapter,
  MediaPickerAdapter,
  NetworkAdapter,
  PermissionAdapter,
  PickedMedia,
  SafeAreaAdapter,
  ShareAdapter,
  StorageAdapter,
} from './types';

const memoryStore = new Map<string, string>();

export const h5StorageAdapter: StorageAdapter = {
  async getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStore.set(key, value);
    }
  },
  async removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      memoryStore.delete(key);
    }
  },
};

export const h5NetworkAdapter: NetworkAdapter = {
  async isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  },
  onStatusChange(callback) {
    if (typeof window === 'undefined') return () => undefined;
    const onOnline = () => callback(true);
    const onOffline = () => callback(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },
};

export const h5SafeAreaAdapter: SafeAreaAdapter = {
  async getInsets() {
    const style = getComputedStyle(document.documentElement);
    return {
      top: Number.parseFloat(style.getPropertyValue('--safe-top')) || 0,
      bottom: Number.parseFloat(style.getPropertyValue('--safe-bottom')) || 0,
      left: 0,
      right: 0,
    };
  },
};

async function requestH5Device(kind: 'camera' | 'microphone') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === 'camera' ? { video: true } : { audio: true },
    );
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export const h5PermissionAdapter: PermissionAdapter = {
  requestCamera: () =>
    requestH5Device('camera').then((granted) => (granted ? 'granted' : 'denied')),
  async requestAlbum() {
    return typeof document !== 'undefined' ? 'granted' : 'denied';
  },
  requestMicrophone: () =>
    requestH5Device('microphone').then((granted) => (granted ? 'granted' : 'denied')),
  async requestNotification() {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
    return (await Notification.requestPermission()) === 'granted'
      ? 'granted'
      : 'denied';
  },
};

export const h5FileSystemAdapter: FileSystemAdapter = {
  async persistTempFile(tempPath) {
    const response = await fetch(tempPath);
    if (!response.ok) throw new Error('读取 H5 临时媒体失败');
    const { saveDurableLocalMedia } = await import('../local/mediaStorage');
    const record = await saveDurableLocalMedia(await response.blob());
    return record.durablePath;
  },
  async readFile(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('读取 H5 媒体失败');
    return response.arrayBuffer();
  },
  async deleteFile() {
    return undefined;
  },
};

function pickBrowserFile(
  accept: string,
  capture?: string,
): Promise<PickedMedia | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(
        file
          ? {
              file,
              mimeType: file.type,
              originalFilename: file.name,
            }
          : null,
      );
      input.remove();
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    input.click();
  });
}

function selectRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

async function startH5AudioRecording(): Promise<AudioRecordingSession> {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new Error('当前浏览器不支持录音');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = selectRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();
  let cancelled = false;
  let settled = false;

  const result = new Promise<PickedMedia>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      settled = true;
      stream.getTracks().forEach((track) => track.stop());
      reject(new Error('录音过程中断，请重试'));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (settled) return;
      settled = true;
      if (cancelled) {
        reject(new Error('录音已取消'));
        return;
      }
      const resolvedMimeType = recorder.mimeType || mimeType || 'audio/webm';
      resolve({
        file: new Blob(chunks, { type: resolvedMimeType }),
        mimeType: resolvedMimeType,
        originalFilename: `baby-voice-${Date.now()}.${resolvedMimeType.includes('ogg') ? 'ogg' : 'webm'}`,
        durationMs: Date.now() - startedAt,
      });
    };
  });
  recorder.start();

  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop();
      return result;
    },
    cancel: () => {
      cancelled = true;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}

export const h5MediaPickerAdapter: MediaPickerAdapter = {
  pickImage: () => pickBrowserFile('image/*'),
  pickVideo: () => pickBrowserFile('video/*'),
  capturePhoto: () => pickBrowserFile('image/*', 'environment'),
  startAudioRecording: startH5AudioRecording,
  async recordAudio() {
    const session = await startH5AudioRecording();
    return session.stop();
  },
};

export const h5ShareAdapter: ShareAdapter = {
  async shareText(text) {
    if (navigator.share) await navigator.share({ text });
  },
  async shareImage() {
    return undefined;
  },
};

export const weappStorageAdapter: StorageAdapter = {
  async getItem(key) {
    const result = await Taro.getStorage({ key }).catch(() => null);
    return result?.data != null ? String(result.data) : null;
  },
  async setItem(key, value) {
    await Taro.setStorage({ key, data: value });
  },
  async removeItem(key) {
    await Taro.removeStorage({ key });
  },
};

export const weappNetworkAdapter: NetworkAdapter = {
  async isOnline() {
    const network = await Taro.getNetworkType();
    return network.networkType !== 'none';
  },
  onStatusChange(callback) {
    const handler = (res: { isConnected: boolean }) => callback(res.isConnected);
    Taro.onNetworkStatusChange(handler);
    return () => Taro.offNetworkStatusChange(handler);
  },
};

export const weappSafeAreaAdapter: SafeAreaAdapter = {
  async getInsets() {
    const info = Taro.getSystemInfoSync();
    return {
      top: info.safeArea?.top ?? info.statusBarHeight ?? 0,
      bottom: info.screenHeight - (info.safeArea?.bottom ?? info.screenHeight),
      left: info.safeArea?.left ?? 0,
      right: info.screenWidth - (info.safeArea?.right ?? info.screenWidth),
    };
  },
};

async function hasWeappPermission(scope: 'scope.camera' | 'scope.record') {
  const setting = await Taro.getSetting();
  if (setting.authSetting[scope]) return true;
  try {
    await Taro.authorize({ scope });
    return true;
  } catch {
    return false;
  }
}

export const weappPermissionAdapter: PermissionAdapter = {
  async requestCamera() {
    return (await hasWeappPermission('scope.camera')) ? 'granted' : 'denied';
  },
  async requestAlbum() {
    return 'granted';
  },
  async requestMicrophone() {
    return (await hasWeappPermission('scope.record')) ? 'granted' : 'denied';
  },
  async requestNotification() {
    return 'denied';
  },
};

export const weappFileSystemAdapter: FileSystemAdapter = {
  async persistTempFile(tempPath, targetName) {
    const fs = Taro.getFileSystemManager();
    const mediaDir = `${Taro.env.USER_DATA_PATH}/media`;
    try {
      fs.accessSync(mediaDir);
    } catch {
      fs.mkdirSync(mediaDir, true);
    }
    const targetPath = `${mediaDir}/${targetName}`;
    const uploadingPath = `${targetPath}.uploading`;
    try {
      await new Promise<void>((resolve, reject) => {
        fs.copyFile({
          srcPath: tempPath,
          destPath: uploadingPath,
          success: () => resolve(),
          fail: reject,
        });
      });
      fs.renameSync(uploadingPath, targetPath);
    } catch (error) {
      try {
        fs.unlinkSync(uploadingPath);
      } catch {
        // The temporary copy may not have been created.
      }
      throw error;
    }
    return targetPath;
  },
  async readFile(path) {
    const fs = Taro.getFileSystemManager();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      fs.readFile({
        filePath: path,
        success: (result) => resolve(result.data as ArrayBuffer),
        fail: reject,
      });
    });
    return buffer;
  },
  async deleteFile(path) {
    const fs = Taro.getFileSystemManager();
    await new Promise<void>((resolve, reject) => {
      fs.unlink({ filePath: path, success: () => resolve(), fail: reject });
    });
  },
};

let weappRecorder: Taro.RecorderManager | null = null;
let activeWeappRecording: {
  resolve: (media: PickedMedia) => void;
  reject: (error: Error) => void;
  cancelled: boolean;
} | null = null;

function startWeappAudioRecording(): Promise<AudioRecordingSession> {
  weappRecorder ??= Taro.getRecorderManager();
  if (activeWeappRecording) throw new Error('已有录音正在进行');
  weappRecorder.onStop((result) => {
    const active = activeWeappRecording;
    activeWeappRecording = null;
    if (!active || active.cancelled) return;
    active.resolve({
      localPath: result.tempFilePath,
      mimeType: 'audio/aac',
      originalFilename: `baby-voice-${Date.now()}.aac`,
      durationMs: result.duration,
    });
  });
  weappRecorder.onError((result) => {
    const active = activeWeappRecording;
    activeWeappRecording = null;
    active?.reject(new Error(result.errMsg || '录音失败'));
  });

  let resolveSession: (session: AudioRecordingSession) => void;
  const sessionReady = new Promise<AudioRecordingSession>((resolve) => {
    resolveSession = resolve;
  });
  const result = new Promise<PickedMedia>((resolve, reject) => {
    activeWeappRecording = { resolve, reject, cancelled: false };
  });
  weappRecorder.start({
    format: 'aac',
    duration: 600000,
    sampleRate: 44100,
    numberOfChannels: 1,
  });
  resolveSession!({
    stop: async () => {
      weappRecorder?.stop();
      return result;
    },
    cancel: () => {
      if (activeWeappRecording) {
        const active = activeWeappRecording;
        activeWeappRecording = null;
        active.cancelled = true;
        active.reject(new Error('录音已取消'));
      }
      weappRecorder?.stop();
    },
  });
  return sessionReady;
}

export const weappMediaPickerAdapter: MediaPickerAdapter = {
  async pickImage() {
    const result = await Taro.chooseImage({ count: 1 }).catch(() => null);
    const localPath = result?.tempFilePaths?.[0];
    return localPath
      ? { localPath, mimeType: 'image/jpeg', originalFilename: `${Date.now()}.jpg` }
      : null;
  },
  async pickVideo() {
    const result = await Taro.chooseVideo({ sourceType: ['album', 'camera'] }).catch(
      () => null,
    );
    return result?.tempFilePath
      ? {
          localPath: result.tempFilePath,
          mimeType: 'video/mp4',
          originalFilename: `${Date.now()}.mp4`,
        }
      : null;
  },
  async capturePhoto() {
    const result = await Taro.chooseImage({ count: 1, sourceType: ['camera'] }).catch(
      () => null,
    );
    const localPath = result?.tempFilePaths?.[0];
    return localPath
      ? { localPath, mimeType: 'image/jpeg', originalFilename: `${Date.now()}.jpg` }
      : null;
  },
  startAudioRecording: startWeappAudioRecording,
  async recordAudio() {
    const session = await startWeappAudioRecording();
    return session.stop();
  },
};

export const weappShareAdapter: ShareAdapter = {
  async shareText() {
    return undefined;
  },
  async shareImage() {
    return undefined;
  },
};
