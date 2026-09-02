import Taro from '@tarojs/taro';
import {
  h5FileSystemAdapter,
  h5MediaPickerAdapter,
  h5NetworkAdapter,
  h5PermissionAdapter,
  h5SafeAreaAdapter,
  h5ShareAdapter,
  h5StorageAdapter,
  weappFileSystemAdapter,
  weappMediaPickerAdapter,
  weappNetworkAdapter,
  weappPermissionAdapter,
  weappSafeAreaAdapter,
  weappShareAdapter,
  weappStorageAdapter,
} from './index';
import type { PlatformAdapters } from './types';

export function createPlatformAdapters(): PlatformAdapters {
  if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP) {
    return {
      storage: weappStorageAdapter,
      fileSystem: weappFileSystemAdapter,
      permission: weappPermissionAdapter,
      network: weappNetworkAdapter,
      mediaPicker: weappMediaPickerAdapter,
      share: weappShareAdapter,
      safeArea: weappSafeAreaAdapter,
    };
  }

  return {
    storage: h5StorageAdapter,
    fileSystem: h5FileSystemAdapter,
    permission: h5PermissionAdapter,
    network: h5NetworkAdapter,
    mediaPicker: h5MediaPickerAdapter,
    share: h5ShareAdapter,
    safeArea: h5SafeAreaAdapter,
  };
}

export const platformAdapters = createPlatformAdapters();
