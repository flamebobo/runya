export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface FileSystemAdapter {
  persistTempFile(tempPath: string, targetName: string): Promise<string>;
  readFile(path: string): Promise<ArrayBuffer>;
  deleteFile(path: string): Promise<void>;
}

export interface PermissionAdapter {
  requestCamera(): Promise<'granted' | 'denied'>;
  requestAlbum(): Promise<'granted' | 'denied'>;
  requestMicrophone(): Promise<'granted' | 'denied'>;
  requestNotification(): Promise<'granted' | 'denied'>;
}

export interface NetworkAdapter {
  isOnline(): Promise<boolean>;
  onStatusChange(callback: (online: boolean) => void): () => void;
}

export interface MediaPickerAdapter {
  pickImage(): Promise<PickedMedia | null>;
  pickVideo(): Promise<PickedMedia | null>;
  capturePhoto(): Promise<PickedMedia | null>;
  startAudioRecording(): Promise<AudioRecordingSession>;
  recordAudio(): Promise<PickedMedia | null>;
}

export interface PickedMedia {
  localPath?: string;
  file?: File | Blob;
  mimeType?: string;
  originalFilename?: string;
  durationMs?: number;
}

export interface AudioRecordingSession {
  stop(): Promise<PickedMedia>;
  cancel(): void;
}

export interface ShareAdapter {
  shareText(text: string): Promise<void>;
  shareImage(path: string): Promise<void>;
}

export interface SafeAreaAdapter {
  getInsets(): Promise<{ top: number; bottom: number; left: number; right: number }>;
}

export interface PlatformAdapters {
  storage: StorageAdapter;
  fileSystem: FileSystemAdapter;
  permission: PermissionAdapter;
  network: NetworkAdapter;
  mediaPicker: MediaPickerAdapter;
  share: ShareAdapter;
  safeArea: SafeAreaAdapter;
}
