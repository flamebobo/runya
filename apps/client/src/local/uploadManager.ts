import Taro from '@tarojs/taro';

const API_BASE =
  typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
    ? process.env.TARO_APP_API_BASE
    : '/api/v1';

export interface UploadOptions {
  mediaType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE';
  mimeType: string;
  originalFilename?: string;
  babyId?: string;
  onProgress?: (percent: number) => void;
}

export async function uploadDurableMedia(
  durablePath: string,
  options: UploadOptions,
  authToken: string,
): Promise<string> {
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;

  // 1. Read file size
  let sizeBytes = 0;
  if (isWeapp) {
    const fs = Taro.getFileSystemManager();
    const stat = fs.statSync(durablePath) as Taro.Stats;
    sizeBytes = stat.size;
  }

  // 2. Init upload session
  const initRes = await Taro.request({
    url: `${API_BASE}/media/uploads`,
    method: 'POST',
    header: {
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`,
      'x-client-platform': isWeapp ? 'WEAPP' : 'H5',
    },
    data: {
      mediaType: options.mediaType,
      mimeType: options.mimeType,
      originalFilename: options.originalFilename,
      expectedSize: sizeBytes || 1024,
      babyId: options.babyId,
    },
  });

  if (initRes.statusCode !== 200 || !initRes.data?.data) {
    throw new Error(initRes.data?.error?.message || '初始化上传会话失败');
  }

  const { uploadId, mediaId, uploadToken, chunkSize } = initRes.data.data;

  // 3. Query Upload Session State (Resume Check)
  const stateRes = await Taro.request({
    url: `${API_BASE}/media/uploads/${uploadId}`,
    method: 'GET',
    header: {
      'x-client-platform': isWeapp ? 'WEAPP' : 'H5',
    },
  });

  const completedParts: number[] = stateRes.data?.data?.completedParts || [];

  // 4. Chunk & Upload Missing Parts
  const totalParts = Math.max(1, Math.ceil((sizeBytes || 1024) / chunkSize));

  for (let partNo = 1; partNo <= totalParts; partNo++) {
    if (completedParts.includes(partNo)) {
      if (options.onProgress) {
        options.onProgress(Math.round((partNo / totalParts) * 100));
      }
      continue;
    }

    if (isWeapp) {
      const fs = Taro.getFileSystemManager();
      const position = (partNo - 1) * chunkSize;
      const length = Math.min(chunkSize, sizeBytes - position);

      const buffer = fs.readFileSync(durablePath, 'binary', position, length);

      const partRes = await Taro.request({
        url: `${API_BASE}/media/uploads/${uploadId}/parts/${partNo}`,
        method: 'PUT',
        header: {
          'content-type': 'application/octet-stream',
          'x-upload-token': uploadToken,
          'x-client-platform': 'WEAPP',
        },
        data: buffer,
      });

      if (partRes.statusCode !== 200) {
        throw new Error(partRes.data?.error?.message || `分块 ${partNo} 上传失败`);
      }
    }

    if (options.onProgress) {
      options.onProgress(Math.round((partNo / totalParts) * 100));
    }
  }

  // 5. Complete Upload
  const completeRes = await Taro.request({
    url: `${API_BASE}/media/uploads/${uploadId}/complete`,
    method: 'POST',
    header: {
      'content-type': 'application/json',
      authorization: `Bearer ${authToken}`,
      'x-client-platform': isWeapp ? 'WEAPP' : 'H5',
    },
    data: {},
  });

  if (completeRes.statusCode !== 200) {
    throw new Error(completeRes.data?.error?.message || '完成上传合并失败');
  }

  return mediaId;
}
