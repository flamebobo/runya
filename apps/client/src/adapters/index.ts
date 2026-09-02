import Taro from '@tarojs/taro';
import type {
  FileSystemAdapter,
  MediaPickerAdapter,
  NetworkAdapter,
  PermissionAdapter,
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

export const h5PermissionAdapter: PermissionAdapter = {
  async requestCamera() {
    return 'denied';
  },
  async requestAlbum() {
    return 'denied';
  },
  async requestMicrophone() {
    return 'denied';
  },
  async requestNotification() {
    return 'denied';
  },
};

export const h5FileSystemAdapter: FileSystemAdapter = {
  async persistTempFile(tempPath) {
    return tempPath;
  },
  async readFile(path) {
    const response = await fetch(path);
    return response.arrayBuffer();
  },
  async deleteFile() {
    return undefined;
  },
};

export const h5MediaPickerAdapter: MediaPickerAdapter = {
  async pickImage() {
    return null;
  },
  async pickVideo() {
    return null;
  },
  async capturePhoto() {
    return null;
  },
  async recordAudio() {
    return null;
  },
};

export const h5ShareAdapter: ShareAdapter = {
  async shareText(text) {
    if (navigator.share) {
      await navigator.share({ text });
    }
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

export const weappPermissionAdapter: PermissionAdapter = {
  async requestCamera() {
    const auth = await Taro.getSetting();
    if (auth.authSetting['scope.camera']) return 'granted';
    await Taro.authorize({ scope: 'scope.camera' }).catch(() => undefined);
    return 'denied';
  },
  async requestAlbum() {
    return 'denied';
  },
  async requestMicrophone() {
    return 'denied';
  },
  async requestNotification() {
    return 'denied';
  },
};

export const weappFileSystemAdapter: FileSystemAdapter = {
  async persistTempFile(tempPath, targetName) {
    const fs = Taro.getFileSystemManager();
    const targetPath = `${Taro.env.USER_DATA_PATH}/${targetName}`;
    await new Promise<void>((resolve, reject) => {
      fs.copyFile({ srcPath: tempPath, destPath: targetPath, success: () => resolve(), fail: reject });
    });
    return targetPath;
  },
  async readFile(path) {
    const fs = Taro.getFileSystemManager();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      fs.readFile({
        filePath: path,
        success: (res) => resolve(res.data as ArrayBuffer),
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

export const weappMediaPickerAdapter: MediaPickerAdapter = {
  async pickImage() {
    const result = await Taro.chooseImage({ count: 1 }).catch(() => null);
    const path = result?.tempFilePaths?.[0];
    return path ? { localPath: path } : null;
  },
  async pickVideo() {
    return null;
  },
  async capturePhoto() {
    const result = await Taro.chooseImage({ count: 1, sourceType: ['camera'] }).catch(() => null);
    const path = result?.tempFilePaths?.[0];
    return path ? { localPath: path } : null;
  },
  async recordAudio() {
    return null;
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
