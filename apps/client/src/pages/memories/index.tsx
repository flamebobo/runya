import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type {
  AnnualReviewResponse,
  AudioCategory,
  AudioMemoryPublic,
  BabyQuotePublic,
  FirstMomentPublic,
  MemoriesFavorites,
  MemoriesHomeSummary,
  OnThisDayResponse,
  PhotoMemoryPublic,
  TimeCapsulePublic,
} from '@runew/contracts';
import styles from './index.module.scss';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  DEFAULT_DRAWER_ITEMS,
} from '@/components';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { AddMomentOverlay } from '@/components/overlay/AddMomentOverlay';
import { PageShell } from '@/components/foundation/PageShell';
import {
  IconActionButton,
  PrimaryActionButton,
  SecondaryGlassButton,
  TextAction,
} from '@/components/buttons';
import { Glyph } from '@/components/icons/Glyph';
import { BottomSheet, ConfirmDialog } from '@/components/overlay';
import {
  FilterChip,
  GlassDateField,
  GlassInput,
  GlassTextArea,
} from '@/components/forms';
import {
  InlineAudioPlayer,
  JitMicrophonePermissionSheet,
  MemoryMediaStrip,
  ProtectedMediaImage,
  TimeCapsuleCard,
} from '@/components/memories/MemoriesComponents';
import {
  createAudioMemory,
  createBabyQuote,
  createFirstMoment,
  createPhotoMemory,
  createTimeCapsule,
  deleteAudioMemory,
  deleteBabyQuote,
  deleteFirstMoment,
  deletePhotoMemory,
  deleteTimeCapsule,
  fetchAnnualReview,
  fetchAudioMemories,
  fetchBabyQuotes,
  fetchFavoriteMemories,
  fetchFirstMoments,
  fetchMemoriesSummary,
  fetchOnThisDay,
  fetchPhotoMemories,
  fetchTimeCapsules,
  favoriteTimeCapsule,
  openTimeCapsule,
  restoreAudioMemory,
  restoreBabyQuote,
  restoreFirstMoment,
  restorePhotoMemory,
  restoreTimeCapsule,
  retryMediaProcessing,
  sealTimeCapsule,
  updateBabyQuote,
  updateAudioMemory,
  updateFirstMoment,
  updatePhotoMemory,
  updateTimeCapsule,
} from '@/api/memories';
import { platformAdapters } from '@/adapters/platform';
import type { AudioRecordingSession, PickedMedia } from '@/adapters/types';
import {
  enqueueMediaUpload,
  createEphemeralPreviewUrl,
  getDurableMediaMetadata,
  getMediaUploadQueueEntry,
  saveDurableLocalMedia,
  type DurableLocalMedia,
} from '@/local/mediaStorage';
import { resumePendingMediaUploads, uploadDurableMedia } from '@/local/uploadManager';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useAutoDraft } from '@/hooks/useAutoDraft';
import { ApiError } from '@/api/client';
import {
  useAuthRuntimeStore,
  useFamilyRuntimeStore,
  useUiOverlayStore,
} from '@/stores/runtime';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import { rootTabUrl } from '@/utils/rootNavigation';

const AUDIO_CATEGORY_OPTIONS: Array<{ value: AudioCategory; label: string }> = [
  { value: 'FIRST_MOM', label: '第一次叫妈妈' },
  { value: 'FIRST_DAD', label: '第一次叫爸爸' },
  { value: 'LAUGH', label: '大笑' },
  { value: 'BABBLING', label: '咿咿呀呀' },
  { value: 'SINGING', label: '唱歌' },
  { value: 'DAD_STORY', label: '爸爸故事' },
  { value: 'MOM_LULLABY', label: '妈妈摇篮曲' },
  { value: 'OTHER', label: '其他' },
];

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputFromTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function timestampFromDateInput(value: string) {
  const [year = 1970, month = 1, day = 1] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day, 12);
}

type MemoriesTab =
  | 'summary'
  | 'photos'
  | 'quotes'
  | 'audios'
  | 'firsts'
  | 'capsules'
  | 'favorites'
  | 'onThisDay'
  | 'annual';

type MemoryQuickAction =
  | 'memory'
  | 'photo'
  | 'audio'
  | 'quote'
  | 'first'
  | 'capsule';

function memoryQuickAction(value: string | undefined): MemoryQuickAction | null {
  return value === 'memory' ||
    value === 'photo' ||
    value === 'audio' ||
    value === 'quote' ||
    value === 'first' ||
    value === 'capsule'
    ? value
    : null;
}

function memoryTab(value: string | undefined): MemoriesTab | null {
  return value === 'summary' ||
    value === 'photos' ||
    value === 'quotes' ||
    value === 'audios' ||
    value === 'firsts' ||
    value === 'capsules' ||
    value === 'favorites' ||
    value === 'onThisDay' ||
    value === 'annual'
    ? value
    : null;
}

type DeleteRequest = {
  kind: 'photo' | 'quote' | 'audio' | 'first' | 'capsule';
  id: string;
  label: string;
};

type DeletedMemory = DeleteRequest;

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getPickedInput(picked: PickedMedia) {
  const input = picked.file ?? picked.localPath;
  if (!input) throw new Error('没有拿到可保存的媒体文件');
  return input;
}

function memoryDraftKey(
  kind: 'quote' | 'capsule',
  babyId: string,
  userId = 'anonymous',
  familyId = 'none',
  entityId = 'new',
) {
  return `memories:${kind}:${userId}:${familyId}:${babyId}:${entityId}`;
}

type MemoryAttachmentType = 'IMAGE' | 'AUDIO' | 'VIDEO';

function toMemoryAttachmentType(value: string | undefined): MemoryAttachmentType {
  return value === 'AUDIO' || value === 'VIDEO' ? value : 'IMAGE';
}

export default function MemoriesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = <MemoriesBody embedded={embedded} />;
  return embedded ? body : <AppBootstrapGate>{body}</AppBootstrapGate>;
}

export function MemoriesBody({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const quickAction = memoryQuickAction(router.params.action);
  const requestedTab = memoryTab(router.params.tab);
  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const userId = useAuthRuntimeStore((state) => state.userId) ?? 'anonymous';
  const familyId = useFamilyRuntimeStore((state) => state.familyId) ?? 'none';
  const bootstrap = useBootstrapQuery(false);
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const babyAgeLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';
  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  const {
    drawerOpen,
    sheetOpen,
    setDrawerOpen,
    setBottomNavActive,
    setSheetOpen,
    showToast,
  } = useUiOverlayStore();
  const [activeTab, setActiveTab] = useState<MemoriesTab>(requestedTab ?? 'summary');
  const [summary, setSummary] = useState<MemoriesHomeSummary | null>(null);
  const [photos, setPhotos] = useState<PhotoMemoryPublic[]>([]);
  const [quotes, setQuotes] = useState<BabyQuotePublic[]>([]);
  const [audios, setAudios] = useState<AudioMemoryPublic[]>([]);
  const [firsts, setFirsts] = useState<FirstMomentPublic[]>([]);
  const [capsules, setCapsules] = useState<TimeCapsulePublic[]>([]);
  const [favorites, setFavorites] = useState<MemoriesFavorites | null>(null);
  const [onThisDay, setOnThisDay] = useState<OnThisDayResponse | null>(null);
  const [annualReview, setAnnualReview] = useState<AnnualReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab);
  }, [requestedTab]);

  const [composeSheetVisible, setComposeSheetVisible] = useState(false);
  const [micSheetVisible, setMicSheetVisible] = useState(false);
  const [recordingPurpose, setRecordingPurpose] = useState<
    'audio' | 'quote' | 'first' | 'capsule'
  >('audio');
  const [recordingSession, setRecordingSession] =
    useState<AudioRecordingSession | null>(null);
  const recordingStopInFlight = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordStartedAt, setRecordStartedAt] = useState(0);
  const [recordSec, setRecordSec] = useState(0);

  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoStory, setPhotoStory] = useState('');
  const [photoDate, setPhotoDate] = useState(todayDateInput());
  const [photoFavorite, setPhotoFavorite] = useState(false);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(null);
  const [photoPendingMedia, setPhotoPendingMedia] = useState<DurableLocalMedia | null>(
    null,
  );
  const [photoExistingMediaIds, setPhotoExistingMediaIds] = useState<string[]>([]);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [editingQuoteVersion, setEditingQuoteVersion] = useState<number | null>(null);
  const [quoteSaveConflict, setQuoteSaveConflict] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayDateInput());
  const [quoteFavorite, setQuoteFavorite] = useState(false);
  const [quoteAudioMediaId, setQuoteAudioMediaId] = useState<string | null>(null);
  const [quotePendingAudio, setQuotePendingAudio] = useState<DurableLocalMedia | null>(
    null,
  );

  const [audioModalVisible, setAudioModalVisible] = useState(false);
  const [editingAudioId, setEditingAudioId] = useState<string | null>(null);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioCategory, setAudioCategory] = useState<AudioCategory>('OTHER');
  const [audioDate, setAudioDate] = useState(todayDateInput());
  const [audioMediaId, setAudioMediaId] = useState<string | null>(null);
  const [audioPendingMedia, setAudioPendingMedia] = useState<DurableLocalMedia | null>(
    null,
  );
  const [audioFavorite, setAudioFavorite] = useState(false);

  const [firstModalVisible, setFirstModalVisible] = useState(false);
  const [editingFirstId, setEditingFirstId] = useState<string | null>(null);
  const [firstTitle, setFirstTitle] = useState('');
  const [firstDesc, setFirstDesc] = useState('');
  const [firstDate, setFirstDate] = useState(todayDateInput());
  const [firstFavorite, setFirstFavorite] = useState(false);
  const [firstMediaId, setFirstMediaId] = useState<string | null>(null);
  const [firstMediaType, setFirstMediaType] = useState<'IMAGE' | 'AUDIO' | 'VIDEO'>(
    'IMAGE',
  );
  const [firstPendingMedia, setFirstPendingMedia] = useState<DurableLocalMedia | null>(
    null,
  );
  const [firstPendingMediaType, setFirstPendingMediaType] = useState<
    'IMAGE' | 'AUDIO' | 'VIDEO'
  >('IMAGE');

  const [capsuleModalVisible, setCapsuleModalVisible] = useState(false);
  const [editingCapsuleId, setEditingCapsuleId] = useState<string | null>(null);
  const [editingCapsuleVersion, setEditingCapsuleVersion] = useState<number | null>(null);
  const [capsuleSaveConflict, setCapsuleSaveConflict] = useState(false);
  const [capsuleRecipient, setCapsuleRecipient] = useState('');
  const [capsuleTitle, setCapsuleTitle] = useState('');
  const [capsuleBody, setCapsuleBody] = useState('');
  const [capsuleOpenDate, setCapsuleOpenDate] = useState(todayDateInput());
  const [capsuleMediaId, setCapsuleMediaId] = useState<string | null>(null);
  const [capsulePendingMedia, setCapsulePendingMedia] =
    useState<DurableLocalMedia | null>(null);
  const [capsuleMediaType, setCapsuleMediaType] = useState<'IMAGE' | 'AUDIO' | 'VIDEO'>(
    'IMAGE',
  );
  const [capsulePendingMediaType, setCapsulePendingMediaType] = useState<
    'IMAGE' | 'AUDIO' | 'VIDEO'
  >('IMAGE');
  const [pendingCapsuleId, setPendingCapsuleId] = useState<string | null>(null);
  const [sealConfirmVisible, setSealConfirmVisible] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deletedMemory, setDeletedMemory] = useState<DeletedMemory | null>(null);
  const handledQuickAction = useRef<MemoryQuickAction | null>(null);
  const quoteDraftKey = babyId
    ? memoryDraftKey('quote', babyId, userId, familyId, editingQuoteId ?? 'new')
    : 'memories:quote:none';
  const capsuleDraftKey = babyId
    ? memoryDraftKey('capsule', babyId, userId, familyId, editingCapsuleId ?? 'new')
    : 'memories:capsule:none';
  const quoteDraftSession = useRef('');
  const capsuleDraftSession = useRef('');
  const quoteDraft = useAutoDraft({
    key: quoteDraftKey,
    values: {
      quoteText,
      quoteDate,
      quoteFavorite,
      quoteAudioMediaId,
      quotePendingAudioLocalId: quotePendingAudio?.localId ?? null,
    },
    paused: !quoteModalVisible || !babyId,
    serverVersion: editingQuoteVersion ?? undefined,
  });
  const capsuleDraft = useAutoDraft({
    key: capsuleDraftKey,
    values: {
      capsuleRecipient,
      capsuleTitle,
      capsuleBody,
      capsuleOpenDate,
      capsuleMediaId,
      capsuleMediaType,
      capsulePendingMediaLocalId: capsulePendingMedia?.localId ?? null,
      capsulePendingMediaType,
    },
    paused: !capsuleModalVisible || !babyId,
    serverVersion: editingCapsuleVersion ?? undefined,
  });

  const loadData = useCallback(async () => {
    if (!babyId) {
      setSummary(null);
      setErrorMessage('还没有选中的宝宝，请先完成家庭设置');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const [
        nextSummary,
        nextPhotos,
        nextQuotes,
        nextAudios,
        nextFirsts,
        nextCapsules,
      ] = await Promise.all([
        fetchMemoriesSummary(babyId),
        fetchPhotoMemories(babyId),
        fetchBabyQuotes(babyId),
        fetchAudioMemories(babyId),
        fetchFirstMoments(babyId),
        fetchTimeCapsules(babyId),
      ]);
      setSummary(nextSummary);
      setPhotos(nextPhotos);
      setQuotes(nextQuotes);
      setAudios(nextAudios);
      setFirsts(nextFirsts);
      setCapsules(nextCapsules);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '回忆暂时加载失败');
    } finally {
      setLoading(false);
    }
  }, [babyId]);

  const loadOnThisDay = useCallback(async () => {
    if (!babyId) return;
    try {
      setOnThisDay(await fetchOnThisDay(babyId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '那年今日暂时打不开');
    }
  }, [babyId]);

  const loadFavorites = useCallback(async () => {
    if (!babyId) return;
    try {
      setFavorites(await fetchFavoriteMemories(babyId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '珍藏暂时加载失败');
    }
  }, [babyId]);

  const loadAnnualReview = useCallback(async () => {
    if (!babyId) return;
    try {
      setAnnualReview(await fetchAnnualReview(babyId, new Date().getUTCFullYear()));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '年度回顾暂时加载失败');
    }
  }, [babyId]);

  useEffect(() => {
    void loadData();
    void resumePendingMediaUploads().catch(() => {
      setUploadNotice('本机媒体仍会保留，上传队列将在网络恢复后继续');
    });
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = platformAdapters.network.onStatusChange((online) => {
      if (!online) {
        setUploadNotice('网络暂时离开了，本机媒体会留在上传队列里');
        return;
      }
      void resumePendingMediaUploads().catch(() => {
        setUploadNotice('本机媒体仍会保留，上传队列将在网络恢复后继续');
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (activeTab === 'onThisDay') void loadOnThisDay();
    if (activeTab === 'favorites') void loadFavorites();
    if (activeTab === 'annual') void loadAnnualReview();
  }, [activeTab, loadAnnualReview, loadFavorites, loadOnThisDay]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const update = () =>
      setRecordSec(Math.floor((Date.now() - recordStartedAt) / 1000));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [isRecording, recordStartedAt]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  Taro.useDidHide(() => {
    if (isRecording) void handleStopRecord();
  });

  const stats = useMemo(
    () => ({
      photos: summary?.photosCount ?? photos.length,
      quotes: summary?.quotesCount ?? quotes.length,
      audios: summary?.audiosCount ?? audios.length,
      capsules: summary?.capsulesCount ?? capsules.length,
    }),
    [audios.length, capsules.length, photos.length, quotes.length, summary],
  );

  const saveAndUploadPicked = useCallback(
    async (picked: PickedMedia, mediaType: 'IMAGE' | 'AUDIO' | 'VIDEO') => {
      if (!babyId) throw new Error('请先选择宝宝');
      const mimeType =
        picked.mimeType ||
        {
          IMAGE: 'image/jpeg',
          AUDIO: 'audio/aac',
          VIDEO: 'video/mp4',
        }[mediaType];
      const durable = await saveDurableLocalMedia(getPickedInput(picked), mimeType);
      await enqueueMediaUpload(durable, {
        mediaType,
        babyId,
      });
      setUploadNotice('已经安全保存在本机，正在继续上传…');
      try {
        const mediaId = await uploadDurableMedia(durable, {
          mediaType,
          mimeType,
          originalFilename: picked.originalFilename || durable.originalFilename,
          babyId,
        });
        setUploadNotice('媒体已保存并上传完成');
        return { durable, mediaId };
      } catch {
        const queue = await getMediaUploadQueueEntry(durable.localId);
        if (queue?.mediaId) {
          setUploadNotice('本机原件已保存，网络恢复后会自动续传');
          return { durable, mediaId: queue.mediaId };
        }
        setUploadNotice('本机原件已保存，上传会在网络恢复后重试');
        return { durable, mediaId: null };
      }
    },
    [babyId],
  );

  async function retryLocalMedia(
    durable: DurableLocalMedia,
    mediaType: 'IMAGE' | 'AUDIO' | 'VIDEO',
    onUploaded: (mediaId: string) => void,
  ) {
    if (!babyId) return;
    try {
      const mediaId = await uploadDurableMedia(durable, {
        mediaType,
        mimeType: durable.mimeType,
        originalFilename: durable.originalFilename,
        babyId,
      });
      onUploaded(mediaId);
      setUploadNotice('本机原件已上传完成，可以继续保存这份回忆');
    } catch (error) {
      setUploadNotice('本机原件仍然保留，网络恢复后会继续上传');
      Taro.showToast({
        title: error instanceof Error ? error.message : '上传仍在等待重试',
        icon: 'none',
      });
    }
  }

  async function pickMediaFor(
    target: 'photo' | 'first' | 'capsule',
    mediaType: 'IMAGE' | 'VIDEO',
    capture = false,
  ) {
    const permission = capture
      ? await platformAdapters.permission.requestCamera()
      : await platformAdapters.permission.requestAlbum();
    if (permission !== 'granted') {
      Taro.showToast({
        title: capture
          ? mediaType === 'VIDEO'
            ? '需要相机权限才能录视频'
            : '需要相机权限才能拍照'
          : mediaType === 'VIDEO'
            ? '需要相册权限才能选视频'
            : '需要相册权限才能选照片',
        icon: 'none',
      });
      return;
    }
    const picked =
      mediaType === 'VIDEO'
        ? await platformAdapters.mediaPicker.pickVideo()
        : capture
          ? await platformAdapters.mediaPicker.capturePhoto()
          : await platformAdapters.mediaPicker.pickImage();
    if (!picked) return;
    try {
      const saved = await saveAndUploadPicked(picked, mediaType);
      if (target === 'photo') {
        setPhotoMediaId(saved.mediaId);
        setPhotoPendingMedia(saved.mediaId ? null : saved.durable);
        const preview = await createEphemeralPreviewUrl(saved.durable);
        setPhotoPreviewUrl(preview);
      } else if (target === 'first') {
        setFirstMediaId(saved.mediaId);
        setFirstMediaType(mediaType);
        setFirstPendingMedia(saved.mediaId ? null : saved.durable);
        setFirstPendingMediaType(mediaType);
      } else {
        setCapsuleMediaId(saved.mediaId);
        setCapsuleMediaType(mediaType);
        setCapsulePendingMedia(saved.mediaId ? null : saved.durable);
        setCapsulePendingMediaType(mediaType);
      }
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '媒体保存失败',
        icon: 'none',
      });
    }
  }

  function pickImageFor(target: 'photo' | 'first' | 'capsule', capture = false) {
    return pickMediaFor(target, 'IMAGE', capture);
  }

  async function handleStartRecord() {
    setMicSheetVisible(false);
    const permission = await platformAdapters.permission.requestMicrophone();
    if (permission !== 'granted') {
      Taro.showToast({ title: '需要麦克风权限才能记录声音', icon: 'none' });
      return;
    }
    try {
      const session = await platformAdapters.mediaPicker.startAudioRecording();
      setRecordingSession(session);
      setRecordStartedAt(Date.now());
      setRecordSec(0);
      setIsRecording(true);
      setAudioModalVisible(true);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '录音启动失败',
        icon: 'none',
      });
    }
  }

  const handleStopRecord = useCallback(async () => {
    if (!recordingSession || recordingStopInFlight.current) return;
    recordingStopInFlight.current = true;
    setIsRecording(false);
    try {
      const picked = await recordingSession.stop();
      const saved = await saveAndUploadPicked(picked, 'AUDIO');
      setRecordingSession(null);
      if (recordingPurpose === 'quote') {
        setQuoteAudioMediaId(saved.mediaId);
        setQuotePendingAudio(saved.mediaId ? null : saved.durable);
        setAudioModalVisible(false);
        setQuoteModalVisible(true);
      } else if (recordingPurpose === 'first') {
        setFirstMediaId(saved.mediaId);
        setFirstMediaType('AUDIO');
        setFirstPendingMedia(saved.mediaId ? null : saved.durable);
        setFirstPendingMediaType('AUDIO');
        setAudioModalVisible(false);
        setFirstModalVisible(true);
      } else if (recordingPurpose === 'capsule') {
        setCapsuleMediaId(saved.mediaId);
        setCapsuleMediaType('AUDIO');
        setCapsulePendingMedia(saved.mediaId ? null : saved.durable);
        setCapsulePendingMediaType('AUDIO');
        setAudioModalVisible(false);
        setCapsuleModalVisible(true);
      } else {
        setAudioMediaId(saved.mediaId);
        setAudioPendingMedia(saved.mediaId ? null : saved.durable);
      }
    } catch (error) {
      setRecordingSession(null);
      Taro.showToast({
        title: error instanceof Error ? error.message : '录音保存失败',
        icon: 'none',
      });
    } finally {
      recordingStopInFlight.current = false;
    }
  }, [recordingPurpose, recordingSession, saveAndUploadPicked]);

  useEffect(() => {
    if (!isRecording || typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => {
      if (document.hidden) void handleStopRecord();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleStopRecord, isRecording]);

  const openPhotoCreate = useCallback(() => {
    setEditingPhotoId(null);
    setPhotoTitle('');
    setPhotoStory('');
    setPhotoDate(todayDateInput());
    setPhotoFavorite(false);
    setPhotoMediaId(null);
    setPhotoPendingMedia(null);
    setPhotoExistingMediaIds([]);
    setPhotoPreviewUrl(null);
    setPhotoModalVisible(true);
  }, []);

  function openPhotoEdit(photo: PhotoMemoryPublic) {
    setEditingPhotoId(photo.id);
    setPhotoTitle(photo.title);
    setPhotoStory(photo.story ?? '');
    setPhotoDate(dateInputFromTimestamp(photo.happenedAt));
    setPhotoFavorite(photo.favorite);
    setPhotoMediaId(photo.media[0]?.id ?? null);
    setPhotoPendingMedia(null);
    setPhotoExistingMediaIds(photo.media.map((media) => media.id));
    setPhotoPreviewUrl(null);
    setPhotoModalVisible(true);
  }

  async function handleSavePhoto() {
    if (!babyId || !photoTitle.trim()) {
      Taro.showToast({ title: '请给这段回忆写一个标题', icon: 'none' });
      return;
    }
    if (photoPendingMedia && !photoMediaId) {
      Taro.showToast({ title: '原件已安全保存在本机，请先重试上传', icon: 'none' });
      return;
    }
    if (!editingPhotoId && !photoMediaId) {
      Taro.showToast({ title: '先选一张照片，原件会先安全保存', icon: 'none' });
      return;
    }
    try {
      if (editingPhotoId) {
        await updatePhotoMemory(editingPhotoId, {
          title: photoTitle,
          story: photoStory || null,
          happenedAt: timestampFromDateInput(photoDate),
          favorite: photoFavorite,
          ...(photoMediaId || photoExistingMediaIds.length > 0
            ? { mediaIds: photoMediaId ? [photoMediaId] : photoExistingMediaIds }
            : {}),
        });
      } else {
        await createPhotoMemory(babyId, {
          title: photoTitle,
          story: photoStory || undefined,
          happenedAt: timestampFromDateInput(photoDate),
          mediaIds: photoMediaId ? [photoMediaId] : undefined,
          favorite: photoFavorite,
        });
      }
      setPhotoModalVisible(false);
      await loadData();
      Taro.showToast({
        title: editingPhotoId ? '照片回忆已更新' : '照片回忆已珍藏',
        icon: 'success',
      });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '照片回忆保存失败',
        icon: 'none',
      });
    }
  }

  const openQuoteDraft = useCallback(() => {
    setEditingQuoteId(null);
    setEditingQuoteVersion(null);
    setQuoteSaveConflict(false);
    quoteDraftSession.current = '';
    setQuoteText('');
    setQuoteDate(todayDateInput());
    setQuoteFavorite(false);
    setQuoteAudioMediaId(null);
    setQuotePendingAudio(null);
    setQuoteModalVisible(true);
  }, []);

  const openQuoteCreate = useCallback(() => {
    void openQuoteDraft();
  }, [openQuoteDraft]);

  function openQuoteEdit(quote: BabyQuotePublic) {
    setEditingQuoteId(quote.id);
    setEditingQuoteVersion(quote.version);
    setQuoteSaveConflict(false);
    quoteDraftSession.current = '';
    setQuoteText(quote.quoteText);
    setQuoteDate(dateInputFromTimestamp(quote.happenedAt));
    setQuoteFavorite(quote.favorite);
    setQuoteAudioMediaId(quote.audioMedia?.id ?? null);
    setQuotePendingAudio(null);
    setQuoteModalVisible(true);
  }

  async function handleSaveQuote() {
    if (quoteDraft.conflict || quoteSaveConflict) return;
    if (!babyId || !quoteText.trim()) {
      Taro.showToast({ title: '写下宝宝说的这句话吧', icon: 'none' });
      return;
    }
    if (quotePendingAudio && !quoteAudioMediaId) {
      Taro.showToast({ title: '语音原件已安全保存在本机，请先重试上传', icon: 'none' });
      return;
    }
    if (editingQuoteId && editingQuoteVersion === null) {
      Taro.showToast({ title: '语录版本读取失败，请重新打开后保存', icon: 'none' });
      return;
    }
    try {
      const body = {
        quoteText,
        happenedAt: timestampFromDateInput(quoteDate),
        audioMediaId: quoteAudioMediaId ?? undefined,
        favorite: quoteFavorite,
      };
      if (editingQuoteId) {
        await updateBabyQuote(editingQuoteId, body, editingQuoteVersion!);
      } else await createBabyQuote(babyId, body);
      setQuoteModalVisible(false);
      await loadData();
      await quoteDraft.clear();
      Taro.showToast({
        title: editingQuoteId ? '宝宝语录已更新' : '宝宝语录已收藏',
        icon: 'success',
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ENTITY_VERSION_CONFLICT') {
        setQuoteSaveConflict(true);
        return;
      }
      Taro.showToast({
        title: error instanceof Error ? error.message : '宝宝语录保存失败',
        icon: 'none',
      });
    }
  }

  async function handleSaveAudio() {
    if (!babyId || !audioTitle.trim()) {
      Taro.showToast({ title: '请给这段声音起个名字', icon: 'none' });
      return;
    }
    if (!editingAudioId && !audioMediaId) {
      Taro.showToast({
        title: audioPendingMedia ? '原件正在等待上传，请先重试上传' : '请先录好声音',
        icon: 'none',
      });
      return;
    }
    try {
      if (editingAudioId) {
        await updateAudioMemory(editingAudioId, {
          title: audioTitle,
          category: audioCategory,
          happenedAt: timestampFromDateInput(audioDate),
          favorite: audioFavorite,
        });
      } else {
        await createAudioMemory(babyId, {
          mediaId: audioMediaId!,
          title: audioTitle,
          category: audioCategory,
          happenedAt: timestampFromDateInput(audioDate),
          favorite: audioFavorite,
        });
      }
      setAudioModalVisible(false);
      setEditingAudioId(null);
      setAudioTitle('');
      setAudioCategory('OTHER');
      setAudioDate(todayDateInput());
      setAudioMediaId(null);
      setAudioPendingMedia(null);
      await loadData();
      Taro.showToast({
        title: editingAudioId ? '声音信息已更新' : '声音原件已安全珍藏',
        icon: 'success',
      });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '声音记录保存失败',
        icon: 'none',
      });
    }
  }

  const openFirstCreate = useCallback(() => {
    setEditingFirstId(null);
    setFirstTitle('');
    setFirstDesc('');
    setFirstDate(todayDateInput());
    setFirstFavorite(false);
    setFirstMediaId(null);
    setFirstMediaType('IMAGE');
    setFirstPendingMedia(null);
    setFirstPendingMediaType('IMAGE');
    setFirstModalVisible(true);
  }, []);

  function openFirstEdit(first: FirstMomentPublic) {
    setEditingFirstId(first.id);
    setFirstTitle(first.title);
    setFirstDesc(first.description ?? '');
    setFirstDate(dateInputFromTimestamp(first.happenedAt));
    setFirstFavorite(first.favorite);
    setFirstMediaId(first.media[0]?.id ?? null);
    setFirstMediaType(toMemoryAttachmentType(first.media[0]?.mediaType));
    setFirstPendingMedia(null);
    setFirstPendingMediaType(toMemoryAttachmentType(first.media[0]?.mediaType));
    setFirstModalVisible(true);
  }

  async function handleSaveFirst() {
    if (!babyId || !firstTitle.trim()) {
      Taro.showToast({ title: '写下这个难忘的第一次吧', icon: 'none' });
      return;
    }
    if (firstPendingMedia && !firstMediaId) {
      Taro.showToast({ title: '附件原件已安全保存在本机，请先重试上传', icon: 'none' });
      return;
    }
    try {
      const body = {
        title: firstTitle,
        description: firstDesc || undefined,
        happenedAt: timestampFromDateInput(firstDate),
        mediaIds: firstMediaId ? [firstMediaId] : undefined,
        favorite: firstFavorite,
      };
      if (editingFirstId) await updateFirstMoment(editingFirstId, body);
      else await createFirstMoment(babyId, body);
      setFirstModalVisible(false);
      await loadData();
      Taro.showToast({
        title: editingFirstId ? '第一次记录已更新' : '第一次已珍藏',
        icon: 'success',
      });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '第一次记录保存失败',
        icon: 'none',
      });
    }
  }

  const openCapsuleDraft = useCallback(() => {
    setEditingCapsuleId(null);
    setEditingCapsuleVersion(null);
    setCapsuleSaveConflict(false);
    capsuleDraftSession.current = '';
    setCapsuleRecipient('');
    setCapsuleTitle('');
    setCapsuleBody('');
    setCapsuleOpenDate(todayDateInput());
    setCapsuleMediaId(null);
    setCapsuleMediaType('IMAGE');
    setCapsulePendingMedia(null);
    setCapsulePendingMediaType('IMAGE');
    setCapsuleModalVisible(true);
  }, []);

  const openCapsuleCreate = useCallback(() => {
    void openCapsuleDraft();
  }, [openCapsuleDraft]);

  function openCapsuleEdit(capsule: TimeCapsulePublic) {
    if (capsule.state !== 'DRAFT') return;
    setEditingCapsuleId(capsule.id);
    setEditingCapsuleVersion(capsule.version);
    setCapsuleSaveConflict(false);
    capsuleDraftSession.current = '';
    setCapsuleRecipient(capsule.recipientText ?? '');
    setCapsuleTitle(capsule.title);
    setCapsuleBody(capsule.body);
    setCapsuleOpenDate(dateInputFromTimestamp(capsule.openAt));
    setCapsuleMediaId(capsule.media[0]?.id ?? null);
    setCapsuleMediaType(toMemoryAttachmentType(capsule.media[0]?.mediaType));
    setCapsulePendingMedia(null);
    setCapsulePendingMediaType(toMemoryAttachmentType(capsule.media[0]?.mediaType));
    setCapsuleModalVisible(true);
  }

  async function handleSaveCapsule(sealNow = false) {
    if (capsuleDraft.conflict || capsuleSaveConflict) return;
    if (!babyId || !capsuleTitle.trim() || !capsuleBody.trim()) {
      Taro.showToast({ title: '请填写胶囊标题和想说的话', icon: 'none' });
      return;
    }
    if (capsulePendingMedia && !capsuleMediaId) {
      Taro.showToast({ title: '附件原件已安全保存在本机，请先重试上传', icon: 'none' });
      return;
    }
    if (editingCapsuleId && editingCapsuleVersion === null) {
      Taro.showToast({ title: '胶囊版本读取失败，请重新打开后保存', icon: 'none' });
      return;
    }
    try {
      if (editingCapsuleId) {
        await updateTimeCapsule(
          editingCapsuleId,
          {
            title: capsuleTitle,
            body: capsuleBody,
            openAt: timestampFromDateInput(capsuleOpenDate),
            recipientText: capsuleRecipient || null,
            mediaIds: capsuleMediaId ? [capsuleMediaId] : undefined,
          },
          editingCapsuleVersion!,
        );
      } else {
        await createTimeCapsule(babyId, {
          title: capsuleTitle,
          body: capsuleBody,
          recipientText: capsuleRecipient || undefined,
          openAt: timestampFromDateInput(capsuleOpenDate),
          mediaIds: capsuleMediaId ? [capsuleMediaId] : undefined,
          sealNow,
        });
      }
      setCapsuleModalVisible(false);
      await loadData();
      await capsuleDraft.clear();
      Taro.showToast({
        title: sealNow ? '时光胶囊已封存' : '时光胶囊草稿已保存',
        icon: 'success',
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ENTITY_VERSION_CONFLICT') {
        setCapsuleSaveConflict(true);
        return;
      }
      Taro.showToast({
        title: error instanceof Error ? error.message : '时光胶囊保存失败',
        icon: 'none',
      });
    }
  }

  async function handleSealConfirm() {
    if (!pendingCapsuleId) return;
    try {
      await sealTimeCapsule(pendingCapsuleId);
      setSealConfirmVisible(false);
      setPendingCapsuleId(null);
      await loadData();
      Taro.showToast({ title: '时光胶囊已封存', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '封存失败',
        icon: 'none',
      });
    }
  }

  async function handleOpenCapsule(id: string) {
    try {
      await openTimeCapsule(id);
      await loadData();
      Taro.showToast({ title: '时光胶囊已开启', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '还没到开启时间',
        icon: 'none',
      });
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteRequest) return;
    const request = deleteRequest;
    try {
      if (request.kind === 'photo') await deletePhotoMemory(request.id);
      if (request.kind === 'quote') await deleteBabyQuote(request.id);
      if (request.kind === 'audio') await deleteAudioMemory(request.id);
      if (request.kind === 'first') await deleteFirstMoment(request.id);
      if (request.kind === 'capsule') await deleteTimeCapsule(request.id);
      setDeletedMemory(request);
      setDeleteRequest(null);
      await loadData();
      Taro.showToast({ title: '已移入最近删除', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '删除失败',
        icon: 'none',
      });
    }
  }

  async function handleRestore() {
    if (!deletedMemory) return;
    try {
      if (deletedMemory.kind === 'photo') await restorePhotoMemory(deletedMemory.id);
      if (deletedMemory.kind === 'quote') await restoreBabyQuote(deletedMemory.id);
      if (deletedMemory.kind === 'audio') await restoreAudioMemory(deletedMemory.id);
      if (deletedMemory.kind === 'first') await restoreFirstMoment(deletedMemory.id);
      if (deletedMemory.kind === 'capsule') await restoreTimeCapsule(deletedMemory.id);
      setDeletedMemory(null);
      await loadData();
      Taro.showToast({ title: '回忆已恢复', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '恢复失败',
        icon: 'none',
      });
    }
  }

  const openAudioRecord = useCallback(
    (purpose: 'audio' | 'quote' | 'first' | 'capsule') => {
      setRecordingPurpose(purpose);
      if (purpose === 'audio') {
        setEditingAudioId(null);
        setAudioTitle('');
        setAudioCategory('OTHER');
        setAudioDate(todayDateInput());
        setAudioMediaId(null);
        setAudioPendingMedia(null);
        setAudioFavorite(false);
      }
      setAudioModalVisible(false);
      setQuoteModalVisible(false);
      setFirstModalVisible(false);
      setCapsuleModalVisible(false);
      setMicSheetVisible(true);
    },
    [],
  );

  function openAudioEdit(audio: AudioMemoryPublic) {
    setRecordingPurpose('audio');
    setEditingAudioId(audio.id);
    setAudioTitle(audio.title);
    setAudioCategory(audio.category);
    setAudioDate(dateInputFromTimestamp(audio.happenedAt));
    setAudioMediaId(audio.media?.id ?? null);
    setAudioPendingMedia(null);
    setAudioFavorite(audio.favorite);
    setAudioModalVisible(true);
  }

  function handleAudioSheetClose() {
    if (isRecording) {
      void handleStopRecord();
      return;
    }
    setAudioModalVisible(false);
  }

  async function handleRetryMedia(mediaId: string) {
    try {
      await retryMediaProcessing(mediaId);
      await loadData();
      Taro.showToast({ title: '已重新开始处理媒体', icon: 'success' });
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '媒体处理仍未完成',
        icon: 'none',
      });
    }
  }

  async function toggleMemoryFavorite(action: () => Promise<unknown>) {
    try {
      await action();
      await loadData();
      if (activeTab === 'favorites') await loadFavorites();
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : '珍藏状态更新失败',
        icon: 'none',
      });
    }
  }

  function openRootTab(tab: 'today' | 'records' | 'memories' | 'family') {
    setDrawerOpen(false);
    setBottomNavActive(tab);
    if (embedded || tab === 'memories') return;
    void Taro.reLaunch({ url: rootTabUrl(tab) });
  }

  const handleMemoryQuickAction = useCallback(
    (action: MemoryQuickAction) => {
      setSheetOpen(false);
      if (action === 'memory') {
        setComposeSheetVisible(true);
        return;
      }
      if (action === 'photo') {
        openPhotoCreate();
        return;
      }
      if (action === 'audio') {
        openAudioRecord('audio');
        return;
      }
      if (action === 'quote') {
        openQuoteCreate();
        return;
      }
      if (action === 'first') {
        openFirstCreate();
        return;
      }
      openCapsuleCreate();
    },
    [
      openAudioRecord,
      openCapsuleCreate,
      openFirstCreate,
      openPhotoCreate,
      openQuoteCreate,
      setSheetOpen,
    ],
  );

  const handleMomentSelect = useCallback(
    (actionId: string) => {
      const memoryAction = memoryQuickAction(actionId);
      if (memoryAction) {
        handleMemoryQuickAction(memoryAction);
        return;
      }
      setSheetOpen(false);
      if (actionId === 'sleep' || actionId === 'diaper' || actionId === 'food') {
        void Taro.navigateTo({ url: `/pages/records/compose/index?type=${actionId}` });
        return;
      }
      if (actionId === 'growth') {
        void Taro.navigateTo({ url: '/pages/growth/index?view=record' });
        return;
      }
      const labels: Record<string, string> = {
        feeding: '喂奶',
        mood: '心情',
        diary: '日记',
      };
      showToast(`${labels[actionId] ?? '这一刻'}请从对应模块记录`);
    },
    [handleMemoryQuickAction, setSheetOpen, showToast],
  );

  useEffect(() => {
    if (!quickAction || handledQuickAction.current === quickAction) return;
    handledQuickAction.current = quickAction;
    handleMemoryQuickAction(quickAction);
  }, [handleMemoryQuickAction, quickAction]);

  useEffect(() => {
    if (!babyId || !quoteModalVisible || !quoteDraft.ready) return;
    if (quoteDraftSession.current === quoteDraftKey) return;
    quoteDraftSession.current = quoteDraftKey;
    if (quoteDraft.conflict) return;
    const restored = quoteDraft.recover();
    if (!restored) return;
    setQuoteText(typeof restored.quoteText === 'string' ? restored.quoteText : '');
    setQuoteDate(typeof restored.quoteDate === 'string' ? restored.quoteDate : todayDateInput());
    setQuoteFavorite(restored.quoteFavorite === true);
    setQuoteAudioMediaId(
      typeof restored.quoteAudioMediaId === 'string' ? restored.quoteAudioMediaId : null,
    );
    const pendingLocalId =
      typeof restored.quotePendingAudioLocalId === 'string'
        ? restored.quotePendingAudioLocalId
        : null;
    if (pendingLocalId) {
      void getDurableMediaMetadata(pendingLocalId)
        .then((media) => setQuotePendingAudio(media ?? null))
        .catch(() => setQuotePendingAudio(null));
    }
  }, [babyId, quoteDraft, quoteDraftKey, quoteModalVisible]);

  useEffect(() => {
    if (!babyId || !capsuleModalVisible || !capsuleDraft.ready) return;
    if (capsuleDraftSession.current === capsuleDraftKey) return;
    capsuleDraftSession.current = capsuleDraftKey;
    if (capsuleDraft.conflict) return;
    const restored = capsuleDraft.recover();
    if (!restored) return;
    setCapsuleRecipient(typeof restored.capsuleRecipient === 'string' ? restored.capsuleRecipient : '');
    setCapsuleTitle(typeof restored.capsuleTitle === 'string' ? restored.capsuleTitle : '');
    setCapsuleBody(typeof restored.capsuleBody === 'string' ? restored.capsuleBody : '');
    setCapsuleOpenDate(
      typeof restored.capsuleOpenDate === 'string' ? restored.capsuleOpenDate : todayDateInput(),
    );
    setCapsuleMediaId(typeof restored.capsuleMediaId === 'string' ? restored.capsuleMediaId : null);
    setCapsuleMediaType(toMemoryAttachmentType(
      typeof restored.capsuleMediaType === 'string' ? restored.capsuleMediaType : undefined,
    ));
    setCapsulePendingMediaType(toMemoryAttachmentType(
      typeof restored.capsulePendingMediaType === 'string'
        ? restored.capsulePendingMediaType
        : undefined,
    ));
    const pendingLocalId =
      typeof restored.capsulePendingMediaLocalId === 'string'
        ? restored.capsulePendingMediaLocalId
        : null;
    if (pendingLocalId) {
      void getDurableMediaMetadata(pendingLocalId)
        .then((media) => setCapsulePendingMedia(media ?? null))
        .catch(() => setCapsulePendingMedia(null));
    }
  }, [babyId, capsuleDraft, capsuleDraftKey, capsuleModalVisible]);

  const renderPhotoCard = (photo: PhotoMemoryPublic) => {
    const media = photo.media[0];
    return (
      <View key={photo.id} className={styles.photoCard}>
        <View className={styles.photoVisual}>
          {media?.status === 'READY' ? (
            <ProtectedMediaImage
              className={styles.photoImage}
              mediaId={media.id}
              alt={photo.title}
            />
          ) : media?.status === 'FAILED' ? (
            <View className={styles.photoPlaceholder}>
              <Glyph name="shield" size="lg" />
              <Text>原件已保留，处理失败</Text>
              <TextAction
                label="重新处理"
                onClick={() => void handleRetryMedia(media.id)}
              />
            </View>
          ) : (
            <View className={styles.photoPlaceholder}>
              <Glyph name="photo" size="lg" />
              <Text>等待媒体上传</Text>
            </View>
          )}
          <View className={styles.photoFavorite}>
            <IconActionButton
              label={photo.favorite ? '取消珍藏' : '珍藏照片'}
              icon={<Glyph name="heart" size="sm" />}
              onClick={() =>
                void toggleMemoryFavorite(() =>
                  updatePhotoMemory(photo.id, { favorite: !photo.favorite }),
                )
              }
            />
          </View>
        </View>
        <View className={styles.info}>
          <Text className={styles.title}>{photo.title}</Text>
          <Text className={styles.date}>{formatDate(photo.happenedAt)}</Text>
          <View className={styles.inlineActions}>
            <TextAction label="编辑" onClick={() => openPhotoEdit(photo)} />
            <TextAction
              label="删除"
              onClick={() =>
                setDeleteRequest({ kind: 'photo', id: photo.id, label: photo.title })
              }
            />
          </View>
        </View>
      </View>
    );
  };

  const renderQuoteCard = (quote: BabyQuotePublic) => (
    <View key={quote.id} className={styles.quoteCard}>
      <Text className={styles.quoteText}>“{quote.quoteText}”</Text>
      {quote.audioMedia?.status === 'READY' ? (
        <InlineAudioPlayer
          mediaId={quote.audioMedia.id}
          title="这句话的声音"
          durationMs={quote.audioMedia.durationMs ?? undefined}
        />
      ) : quote.audioMedia?.status === 'FAILED' ? (
        <View className={styles.audioPending}>
          <Text>语音原件已保留，处理失败</Text>
          <TextAction
            label="重新处理"
            onClick={() => void handleRetryMedia(quote.audioMedia!.id)}
          />
        </View>
      ) : quote.audioMedia ? (
        <Text className={styles.audioPending}>语音原件正在准备中…</Text>
      ) : null}
      <View className={styles.cardFooter}>
        <Text className={styles.date}>{formatDate(quote.happenedAt)}</Text>
        <View className={styles.inlineActions}>
          <IconActionButton
            label={quote.favorite ? '取消珍藏' : '珍藏语录'}
            icon={<Glyph name="heart" size="sm" />}
            onClick={() =>
              void toggleMemoryFavorite(() =>
                updateBabyQuote(quote.id, { favorite: !quote.favorite }, quote.version),
              )
            }
          />
          <TextAction label="编辑" onClick={() => openQuoteEdit(quote)} />
          <TextAction
            label="删除"
            onClick={() =>
              setDeleteRequest({ kind: 'quote', id: quote.id, label: quote.quoteText })
            }
          />
        </View>
      </View>
    </View>
  );

  const renderAudioCard = (audio: AudioMemoryPublic) => (
    <View key={audio.id} className={styles.memoryBlock}>
      {audio.media?.status === 'READY' ? (
        <InlineAudioPlayer
          mediaId={audio.media.id}
          title={audio.title}
          category={audio.category}
          durationMs={audio.media.durationMs ?? undefined}
          favorite={audio.favorite}
          onFavorite={() =>
            void toggleMemoryFavorite(() =>
              updateAudioMemory(audio.id, { favorite: !audio.favorite }),
            )
          }
        />
      ) : audio.media?.status === 'FAILED' ? (
        <View className={styles.audioPending}>
          <Text>声音原件已保留，处理失败</Text>
          <TextAction
            label="重新处理"
            onClick={() => void handleRetryMedia(audio.media!.id)}
          />
        </View>
      ) : (
        <Text className={styles.emptyText}>声音原件正在准备中，完成后即可播放。</Text>
      )}
      <View className={styles.inlineActions}>
        <TextAction label="编辑" onClick={() => openAudioEdit(audio)} />
        <TextAction
          label="删除"
          onClick={() =>
            setDeleteRequest({ kind: 'audio', id: audio.id, label: audio.title })
          }
        />
      </View>
    </View>
  );

  const renderFirstCard = (first: FirstMomentPublic) => (
    <View key={first.id} className={styles.firstMomentCard}>
      <View className={styles.firstIcon}>
        <Glyph name="sparkle" size="md" />
      </View>
      <View className={styles.firstContent}>
        <Text className={styles.title}>{first.title}</Text>
        {first.description ? (
          <Text className={styles.desc}>{first.description}</Text>
        ) : null}
        <MemoryMediaStrip media={first.media} />
        <Text className={styles.date}>{formatDate(first.happenedAt)}</Text>
        <View className={styles.inlineActions}>
          <IconActionButton
            label={first.favorite ? '取消珍藏' : '珍藏第一次'}
            icon={<Glyph name="heart" size="sm" />}
            onClick={() =>
              void toggleMemoryFavorite(() =>
                updateFirstMoment(first.id, { favorite: !first.favorite }),
              )
            }
          />
          <TextAction label="编辑" onClick={() => openFirstEdit(first)} />
          <TextAction
            label="删除"
            onClick={() =>
              setDeleteRequest({ kind: 'first', id: first.id, label: first.title })
            }
          />
        </View>
      </View>
    </View>
  );

  const renderCapsuleCard = (capsule: TimeCapsulePublic) => (
    <TimeCapsuleCard
      key={capsule.id}
      id={capsule.id}
      title={capsule.title}
      body={capsule.body}
      recipientText={capsule.recipientText}
      state={capsule.state}
      openAt={capsule.openAt}
      favorite={capsule.favorite}
      media={capsule.media}
      onFavorite={() =>
        void toggleMemoryFavorite(() =>
          favoriteTimeCapsule(capsule.id, !capsule.favorite),
        )
      }
      onEditDraft={() => openCapsuleEdit(capsule)}
      onSeal={() => {
        setPendingCapsuleId(capsule.id);
        setSealConfirmVisible(true);
      }}
      onOpen={() => void handleOpenCapsule(capsule.id)}
      onDelete={() =>
        setDeleteRequest({ kind: 'capsule', id: capsule.id, label: capsule.title })
      }
    />
  );

  const renderMemorySection = (
    title: string,
    icon: 'photo' | 'quote' | 'mic' | 'sparkle',
    children: React.ReactNode,
  ) => (
    <View className={styles.section}>
      <View className={styles.sectionHeading}>
        <View className={styles.sectionIcon}>
          <Glyph name={icon} size="md" />
        </View>
        <Text>{title}</Text>
      </View>
      {children}
    </View>
  );

  const tabItems: Array<{ id: MemoriesTab; label: string }> = [
    { id: 'summary', label: '全部回忆' },
    { id: 'photos', label: `照片 ${stats.photos}` },
    { id: 'quotes', label: `语录 ${stats.quotes}` },
    { id: 'audios', label: `声音 ${stats.audios}` },
    { id: 'firsts', label: `第一次 ${firsts.length}` },
    { id: 'capsules', label: `胶囊 ${stats.capsules}` },
    { id: 'favorites', label: '我的珍藏' },
    { id: 'onThisDay', label: '那年今日' },
    { id: 'annual', label: '年度回顾' },
  ];

  const onThisDayCount = summary?.onThisDayCount ?? 0;

  return (
    <PageShell bottomNav={!sheetOpen}>
      <AppTopBar
        title="宝宝回忆"
        subtitle={`${babyName} · 记忆博物馆`}
        gemAmount={gemAmount}
        onMenuClick={() => setDrawerOpen(true)}
      />
      <View className={styles.memoriesPage}>
        <View className={styles.topSummaryBanner}>
          <View className={styles.eyebrow}>
            <Glyph name="grid" size="sm" />
            <Text>RUNEW · MEMORY MUSEUM</Text>
          </View>
          <Text className={styles.museumTitle}>润润的家庭记忆博物馆</Text>
          <Text className={styles.museumSubtitle}>
            把润润长大的每一天，认真收藏起来。
          </Text>
          <View className={styles.statsGrid}>
            <View className={styles.statBox}>
              <Text className={styles.num}>{stats.photos}</Text>
              <Text className={styles.label}>照片回忆</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{stats.quotes}</Text>
              <Text className={styles.label}>宝宝语录</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{stats.audios}</Text>
              <Text className={styles.label}>声音记录</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{stats.capsules}</Text>
              <Text className={styles.label}>时光胶囊</Text>
            </View>
          </View>
          <View className={styles.memoryGuide}>
            <View className={styles.memoryGuideIcon}>
              <Glyph name="sparkle" size="sm" />
            </View>
            <View className={styles.memoryGuideCopy}>
              <Text className={styles.memoryGuideTitle}>想留下一点什么？</Text>
              <Text className={styles.memoryGuideText}>
                点击底部中央 +，照片、声音和语录都会收进同一间回忆馆。
              </Text>
            </View>
          </View>
        </View>

        <ScrollView scrollX className={styles.tabsBar} enhanced showScrollbar={false}>
          {tabItems.map((tab) => (
            <View
              key={tab.id}
              className={`${styles.tabChip} ${activeTab === tab.id ? styles.active : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <Text>{tab.label}</Text>
            </View>
          ))}
        </ScrollView>

        <View className={styles.contentArea}>
          {uploadNotice ? (
            <View className={styles.uploadNotice}>
              <Glyph name="shield" size="sm" />
              <Text>{uploadNotice}</Text>
            </View>
          ) : null}
          {errorMessage ? (
            <View className={styles.errorState}>
              <Text>{errorMessage}</Text>
              <TextAction label="重新加载" onClick={() => void loadData()} />
            </View>
          ) : null}
          {loading ? (
            <View className={styles.loadingState}>
              <Text>正在把回忆轻轻放回展柜…</Text>
            </View>
          ) : null}
          {deletedMemory ? (
            <View className={styles.undoNotice}>
              <Text>“{deletedMemory.label}”已移入最近删除</Text>
              <TextAction label="撤销删除" onClick={() => void handleRestore()} />
            </View>
          ) : null}

          {activeTab === 'summary' ? (
            <>
              <View
                className={styles.onThisDayBanner}
                onClick={() => setActiveTab('onThisDay')}
                role="button"
              >
                <View className={styles.bannerIcon}>
                  <Glyph name="calendar" size="md" />
                </View>
                <View className={styles.bannerCopy}>
                  <Text className={styles.title}>那年今日</Text>
                  <Text className={styles.sub}>
                    {onThisDayCount
                      ? `去年今天留下了 ${onThisDayCount} 份回忆`
                      : '重温去年的今天，看看那时的小小闪光'}
                  </Text>
                </View>
                <Glyph name="chevron" size="sm" />
              </View>
              {renderMemorySection(
                '照片回忆',
                'photo',
                photos.length ? (
                  <View className={styles.photoGrid}>
                    {photos.slice(0, 6).map(renderPhotoCard)}
                  </View>
                ) : (
                  <Text className={styles.emptyText}>还没有照片，给今天留一张吧。</Text>
                ),
              )}
              {renderMemorySection(
                '宝宝语录',
                'quote',
                quotes.length ? (
                  quotes.slice(0, 3).map(renderQuoteCard)
                ) : (
                  <Text className={styles.emptyText}>把那句让你笑起来的话记下来。</Text>
                ),
              )}
              {renderMemorySection(
                '宝宝声音',
                'mic',
                audios.length ? (
                  audios.slice(0, 3).map(renderAudioCard)
                ) : (
                  <Text className={styles.emptyText}>
                    第一声笑、第一句咿呀，都值得好好保存。
                  </Text>
                ),
              )}
              {renderMemorySection(
                '第一次',
                'sparkle',
                firsts.length ? (
                  firsts.slice(0, 3).map(renderFirstCard)
                ) : (
                  <Text className={styles.emptyText}>
                    每一个第一次，都是成长的小星星。
                  </Text>
                ),
              )}
              {renderMemorySection(
                '时光胶囊',
                'quote',
                capsules.length ? (
                  capsules.slice(0, 3).map(renderCapsuleCard)
                ) : (
                  <Text className={styles.emptyText}>写一封信给未来的润润。</Text>
                ),
              )}
            </>
          ) : null}

          {activeTab === 'photos'
            ? renderMemorySection(
                '照片回忆',
                'photo',
                photos.length ? (
                  <View className={styles.photoGrid}>
                    {photos.map(renderPhotoCard)}
                  </View>
                ) : (
                  <Text className={styles.emptyText}>还没有照片回忆。</Text>
                ),
              )
            : null}
          {activeTab === 'quotes'
            ? renderMemorySection(
                '宝宝语录',
                'quote',
                quotes.length ? (
                  quotes.map(renderQuoteCard)
                ) : (
                  <Text className={styles.emptyText}>还没有宝宝语录。</Text>
                ),
              )
            : null}
          {activeTab === 'audios'
            ? renderMemorySection(
                '宝宝声音',
                'mic',
                audios.length ? (
                  audios.map(renderAudioCard)
                ) : (
                  <Text className={styles.emptyText}>还没有声音回忆。</Text>
                ),
              )
            : null}
          {activeTab === 'firsts'
            ? renderMemorySection(
                '第一次',
                'sparkle',
                firsts.length ? (
                  firsts.map(renderFirstCard)
                ) : (
                  <Text className={styles.emptyText}>还没有第一次记录。</Text>
                ),
              )
            : null}
          {activeTab === 'capsules'
            ? renderMemorySection(
                '时光胶囊',
                'quote',
                capsules.length ? (
                  capsules.map(renderCapsuleCard)
                ) : (
                  <Text className={styles.emptyText}>还没有时光胶囊。</Text>
                ),
              )
            : null}

          {activeTab === 'favorites' && favorites ? (
            <View className={styles.reviewCard}>
              <Text className={styles.reviewTitle}>我的珍藏</Text>
              <Text className={styles.reviewSubtitle}>
                把最想反复打开的瞬间，放在一起。
              </Text>
              <Text className={styles.reviewNumber}>{favorites.totalCount}</Text>
              <Text className={styles.reviewLabel}>份珍藏</Text>
              {favorites.photos.map(renderPhotoCard)}
              {favorites.quotes.map(renderQuoteCard)}
              {favorites.audios.map(renderAudioCard)}
              {favorites.firsts.map(renderFirstCard)}
              {favorites.capsules.map(renderCapsuleCard)}
            </View>
          ) : null}

          {activeTab === 'onThisDay' && onThisDay ? (
            <View className={styles.reviewCard}>
              <Text className={styles.reviewTitle}>那年今日</Text>
              <Text className={styles.reviewSubtitle}>
                把去年的今天，再温柔地看一遍。
              </Text>
              {onThisDay.photos.map(renderPhotoCard)}
              {onThisDay.quotes.map(renderQuoteCard)}
              {onThisDay.audios.map(renderAudioCard)}
              {onThisDay.firsts.map(renderFirstCard)}
              {onThisDay.capsules.map(renderCapsuleCard)}
              {!onThisDay.photos.length &&
              !onThisDay.quotes.length &&
              !onThisDay.audios.length &&
              !onThisDay.firsts.length &&
              !onThisDay.capsules.length ? (
                <Text className={styles.emptyText}>今天还没有找到去年的回忆。</Text>
              ) : null}
            </View>
          ) : null}

          {activeTab === 'annual' && annualReview ? (
            <View className={styles.reviewCard}>
              <Text className={styles.reviewTitle}>{annualReview.year} 年度回顾</Text>
              <Text className={styles.reviewSubtitle}>
                这一年，你们一起收藏了 {annualReview.totalCount} 个小小瞬间。
              </Text>
              <View className={styles.reviewStats}>
                <Text>{annualReview.photosCount} 张照片</Text>
                <Text>{annualReview.quotesCount} 句语录</Text>
                <Text>{annualReview.audiosCount} 段声音</Text>
                <Text>{annualReview.firstsCount} 个第一次</Text>
                <Text>{annualReview.capsulesCount} 个时光胶囊</Text>
              </View>
              {annualReview.photos.slice(0, 3).map(renderPhotoCard)}
              {annualReview.quotes.slice(0, 3).map(renderQuoteCard)}
              {annualReview.audios.slice(0, 3).map(renderAudioCard)}
              {annualReview.firsts.slice(0, 3).map(renderFirstCard)}
              {annualReview.capsules.slice(0, 3).map(renderCapsuleCard)}
            </View>
          ) : null}
        </View>

        <BottomSheet
          open={composeSheetVisible}
          onClose={() => setComposeSheetVisible(false)}
          title="珍藏一份新回忆"
        >
          <View className={styles.composeChoices}>
            <SecondaryGlassButton
              label="记录照片回忆"
              onClick={() => {
                setComposeSheetVisible(false);
                openPhotoCreate();
              }}
            />
            <SecondaryGlassButton
              label="记录宝宝语录"
              onClick={() => {
                setComposeSheetVisible(false);
                openQuoteCreate();
              }}
            />
            <SecondaryGlassButton
              label="录制宝宝声音"
              onClick={() => {
                setComposeSheetVisible(false);
                openAudioRecord('audio');
              }}
            />
            <SecondaryGlassButton
              label="记录第一次"
              onClick={() => {
                setComposeSheetVisible(false);
                openFirstCreate();
              }}
            />
            <SecondaryGlassButton
              label="写一封时光胶囊"
              onClick={() => {
                setComposeSheetVisible(false);
                openCapsuleCreate();
              }}
            />
          </View>
        </BottomSheet>

        <JitMicrophonePermissionSheet
          visible={micSheetVisible}
          onConfirm={() => void handleStartRecord()}
          onCancel={() => setMicSheetVisible(false)}
        />

        <BottomSheet
          open={photoModalVisible}
          onClose={() => setPhotoModalVisible(false)}
          title={editingPhotoId ? '编辑照片回忆' : '新增照片回忆'}
        >
          <View className={styles.formStack}>
            <View className={styles.mediaPickRow}>
              <SecondaryGlassButton
                label="从相册选择"
                onClick={() => void pickImageFor('photo')}
                fullWidth={false}
              />
              <SecondaryGlassButton
                label="拍一张"
                onClick={() => void pickImageFor('photo', true)}
                fullWidth={false}
              />
            </View>
            {photoPreviewUrl ? (
              <Image
                className={styles.selectedPreview}
                src={photoPreviewUrl}
                mode="aspectFill"
                aria-label="已选择的照片"
              />
            ) : null}
            {photoPendingMedia ? (
              <View className={styles.uploadPendingRow}>
                <Text>附件原件已安全保存在本机，等待上传。</Text>
                <TextAction
                  label="重试上传"
                  onClick={() =>
                    void retryLocalMedia(photoPendingMedia, 'IMAGE', (mediaId) => {
                      setPhotoMediaId(mediaId);
                      setPhotoPendingMedia(null);
                    })
                  }
                />
              </View>
            ) : null}
            <GlassInput
              value={photoTitle}
              onInput={setPhotoTitle}
              placeholder="回忆标题，例如：午后的第一束阳光"
            />
            <GlassDateField
              label="发生日期"
              value={photoDate}
              onChange={setPhotoDate}
            />
            <GlassTextArea
              value={photoStory}
              onInput={setPhotoStory}
              placeholder="写下当时的故事或心情…"
            />
            <SecondaryGlassButton
              label={photoFavorite ? '已加入珍藏' : '加入我的珍藏'}
              onClick={() => setPhotoFavorite((value) => !value)}
            />
            <PrimaryActionButton
              label={editingPhotoId ? '保存修改' : '保存照片回忆'}
              onClick={() => void handleSavePhoto()}
            />
          </View>
        </BottomSheet>

        <BottomSheet
          open={quoteModalVisible}
          onClose={() => setQuoteModalVisible(false)}
          title={editingQuoteId ? '编辑宝宝语录' : '记录宝宝语录'}
        >
          <View className={styles.formStack}>
            <GlassTextArea
              value={quoteText}
              onInput={setQuoteText}
              placeholder="宝宝说了什么有趣又治愈的话？"
            />
            <GlassDateField
              label="发生日期"
              value={quoteDate}
              onChange={setQuoteDate}
            />
            <SecondaryGlassButton
              label={quoteAudioMediaId ? '声音已附加 · 重新录制' : '为这句话添加声音'}
              onClick={() => openAudioRecord('quote')}
            />
            {quoteAudioMediaId ? (
              <TextAction
                label="移除声音"
                onClick={() => {
                  setQuoteAudioMediaId(null);
                  setQuotePendingAudio(null);
                }}
              />
            ) : null}
            {quotePendingAudio ? (
              <View className={styles.uploadPendingRow}>
                <Text>语音原件已安全保存在本机，等待上传。</Text>
                <TextAction
                  label="重试上传"
                  onClick={() =>
                    void retryLocalMedia(quotePendingAudio, 'AUDIO', (mediaId) => {
                      setQuoteAudioMediaId(mediaId);
                      setQuotePendingAudio(null);
                    })
                  }
                />
              </View>
            ) : null}
            {quoteDraft.conflict || quoteSaveConflict ? (
              <View className={styles.uploadPendingRow}>
                <Text>
                  {quoteSaveConflict
                    ? '这条语录刚在别处更新，为避免覆盖，当前修改没有保存。'
                    : '这份草稿基于旧版本，已停止自动恢复。'}
                </Text>
                <TextAction
                  label="丢弃草稿并查看最新版本"
                  onClick={() =>
                    void quoteDraft.discard().then(async () => {
                      setQuoteSaveConflict(false);
                      setQuoteModalVisible(false);
                      await loadData();
                    })
                  }
                />
              </View>
            ) : null}
            <SecondaryGlassButton
              label={quoteFavorite ? '已加入珍藏' : '加入我的珍藏'}
              onClick={() => setQuoteFavorite((value) => !value)}
            />
            <PrimaryActionButton
              label={editingQuoteId ? '保存修改' : '保存宝宝语录'}
              state={quoteDraft.conflict || quoteSaveConflict ? 'disabled' : 'default'}
              onClick={() => void handleSaveQuote()}
            />
          </View>
        </BottomSheet>

        <BottomSheet
          open={audioModalVisible}
          onClose={handleAudioSheetClose}
          title={editingAudioId ? '编辑声音信息' : '录制宝宝的声音'}
        >
          <View className={styles.audioRecordPanel}>
            {isRecording ? (
              <>
                <View className={styles.recordPulse}>
                  <Glyph name="mic" size="lg" />
                </View>
                <Text className={styles.recordingTime}>录音中 {recordSec} 秒</Text>
                <Text className={styles.recordingHint}>
                  可以放心停留，离开页面前会先保存到本机。
                </Text>
                <SecondaryGlassButton
                  label="停止并安全保存"
                  onClick={() => void handleStopRecord()}
                />
              </>
            ) : recordingPurpose === 'quote' && quoteAudioMediaId ? (
              <>
                <Text className={styles.savedHint}>
                  这句话的声音已安全保存，回到语录继续编辑。
                </Text>
                <PrimaryActionButton
                  label="返回宝宝语录"
                  onClick={() => {
                    setAudioModalVisible(false);
                    setQuoteModalVisible(true);
                  }}
                />
              </>
            ) : (
              <>
                <Text className={styles.savedHint}>
                  {audioMediaId
                    ? '声音原件已保存，可以给它起个名字了。'
                    : audioPendingMedia
                      ? '声音原件已安全保存在本机，等待上传。'
                      : '录音会先保存到本机，再加入上传队列。'}
                </Text>
                {audioPendingMedia ? (
                  <TextAction
                    label="重试上传"
                    onClick={() =>
                      void retryLocalMedia(audioPendingMedia, 'AUDIO', (mediaId) => {
                        setAudioMediaId(mediaId);
                        setAudioPendingMedia(null);
                      })
                    }
                  />
                ) : null}
                <GlassInput
                  value={audioTitle}
                  onInput={setAudioTitle}
                  placeholder="声音标题，例如：咯咯大笑声"
                />
                <GlassDateField
                  label="发生日期"
                  value={audioDate}
                  onChange={setAudioDate}
                />
                <View className={styles.categoryGroup}>
                  <Text className={styles.fieldLabel}>声音分类</Text>
                  <View className={styles.categoryGrid}>
                    {AUDIO_CATEGORY_OPTIONS.map((option) => (
                      <FilterChip
                        key={option.value}
                        label={option.label}
                        selected={audioCategory === option.value}
                        onClick={() => setAudioCategory(option.value)}
                      />
                    ))}
                  </View>
                </View>
                <SecondaryGlassButton
                  label={audioFavorite ? '已加入珍藏' : '加入我的珍藏'}
                  onClick={() => setAudioFavorite((value) => !value)}
                />
                <PrimaryActionButton
                  label={editingAudioId ? '保存声音修改' : '保存声音记录'}
                  onClick={() => void handleSaveAudio()}
                />
              </>
            )}
          </View>
        </BottomSheet>

        <BottomSheet
          open={firstModalVisible}
          onClose={() => setFirstModalVisible(false)}
          title={editingFirstId ? '编辑第一次' : '记录第一次'}
        >
          <View className={styles.formStack}>
            <View className={styles.mediaPickRow}>
              <SecondaryGlassButton
                label={
                  firstMediaId && firstMediaType === 'IMAGE'
                    ? '照片已附加'
                    : '附加一张照片'
                }
                onClick={() => void pickImageFor('first')}
                fullWidth={false}
              />
              <SecondaryGlassButton
                label={
                  firstMediaId && firstMediaType === 'AUDIO' ? '声音已附加' : '附加声音'
                }
                onClick={() => openAudioRecord('first')}
                fullWidth={false}
              />
              <SecondaryGlassButton
                label={
                  firstMediaId && firstMediaType === 'VIDEO' ? '视频已附加' : '附加视频'
                }
                onClick={() => void pickMediaFor('first', 'VIDEO')}
                fullWidth={false}
              />
            </View>
            <GlassInput
              value={firstTitle}
              onInput={setFirstTitle}
              placeholder="第一次做什么，例如：第一次会坐"
            />
            <GlassDateField
              label="发生日期"
              value={firstDate}
              onChange={setFirstDate}
            />
            <GlassTextArea
              value={firstDesc}
              onInput={setFirstDesc}
              placeholder="记下这个难忘瞬间的细节…"
            />
            {firstPendingMedia ? (
              <View className={styles.uploadPendingRow}>
                <Text>附件原件已安全保存在本机，等待上传。</Text>
                <TextAction
                  label="重试上传"
                  onClick={() =>
                    void retryLocalMedia(
                      firstPendingMedia,
                      firstPendingMediaType,
                      (mediaId) => {
                        setFirstMediaId(mediaId);
                        setFirstPendingMedia(null);
                      },
                    )
                  }
                />
              </View>
            ) : null}
            <SecondaryGlassButton
              label={firstFavorite ? '已加入珍藏' : '加入我的珍藏'}
              onClick={() => setFirstFavorite((value) => !value)}
            />
            <PrimaryActionButton
              label={editingFirstId ? '保存修改' : '珍藏第一次'}
              onClick={() => void handleSaveFirst()}
            />
          </View>
        </BottomSheet>

        <BottomSheet
          open={capsuleModalVisible}
          onClose={() => setCapsuleModalVisible(false)}
          title={editingCapsuleId ? '编辑胶囊草稿' : '写一封时光胶囊'}
        >
          <View className={styles.formStack}>
            <View className={styles.mediaPickRow}>
              <SecondaryGlassButton
                label={
                  capsuleMediaId && capsuleMediaType === 'IMAGE'
                    ? '照片已附加'
                    : '附加一张照片'
                }
                onClick={() => void pickImageFor('capsule')}
                fullWidth={false}
              />
              <SecondaryGlassButton
                label={
                  capsuleMediaId && capsuleMediaType === 'AUDIO'
                    ? '声音已附加'
                    : '附加声音'
                }
                onClick={() => openAudioRecord('capsule')}
                fullWidth={false}
              />
              <SecondaryGlassButton
                label={
                  capsuleMediaId && capsuleMediaType === 'VIDEO'
                    ? '视频已附加'
                    : '附加视频'
                }
                onClick={() => void pickMediaFor('capsule', 'VIDEO')}
                fullWidth={false}
              />
            </View>
            <GlassInput
              value={capsuleRecipient}
              onInput={setCapsuleRecipient}
              placeholder="收件人，例如：十八岁的润润"
            />
            <GlassInput
              value={capsuleTitle}
              onInput={setCapsuleTitle}
              placeholder="胶囊标题"
            />
            <GlassDateField
              label="开启日期"
              value={capsuleOpenDate}
              end="2100-12-31"
              onChange={setCapsuleOpenDate}
            />
            <GlassTextArea
              value={capsuleBody}
              onInput={setCapsuleBody}
              placeholder="写给未来的一封信…"
            />
            {capsulePendingMedia ? (
              <View className={styles.uploadPendingRow}>
                <Text>附件原件已安全保存在本机，等待上传。</Text>
                <TextAction
                  label="重试上传"
                  onClick={() =>
                    void retryLocalMedia(
                      capsulePendingMedia,
                      capsulePendingMediaType,
                      (mediaId) => {
                        setCapsuleMediaId(mediaId);
                        setCapsulePendingMedia(null);
                      },
                    )
                  }
                />
              </View>
            ) : null}
            {capsuleDraft.conflict || capsuleSaveConflict ? (
              <View className={styles.uploadPendingRow}>
                <Text>
                  {capsuleSaveConflict
                    ? '这封胶囊刚在别处更新，为避免覆盖，当前修改没有保存。'
                    : '这份草稿基于旧版本，已停止自动恢复。'}
                </Text>
                <TextAction
                  label="丢弃草稿并查看最新版本"
                  onClick={() =>
                    void capsuleDraft.discard().then(async () => {
                      setCapsuleSaveConflict(false);
                      setCapsuleModalVisible(false);
                      await loadData();
                    })
                  }
                />
              </View>
            ) : null}
            {editingCapsuleId ? (
              <PrimaryActionButton
                label="保存草稿修改"
                state={capsuleDraft.conflict || capsuleSaveConflict ? 'disabled' : 'default'}
                onClick={() => void handleSaveCapsule(false)}
              />
            ) : (
              <View className={styles.mediaPickRow}>
                <SecondaryGlassButton
                  label="存为草稿"
                  onClick={() => void handleSaveCapsule(false)}
                  fullWidth={false}
                />
                <PrimaryActionButton
                  label="立即封存"
                  onClick={() => void handleSaveCapsule(true)}
                  fullWidth={false}
                />
              </View>
            )}
          </View>
        </BottomSheet>

        <ConfirmDialog
          open={sealConfirmVisible}
          title="确认封存这封信？"
          message="封存后将无法直接修改正文，直到到达指定的开启日期。"
          confirmLabel="确认封存"
          cancelLabel="稍后再说"
          onConfirm={() => void handleSealConfirm()}
          onCancel={() => setSealConfirmVisible(false)}
        />
        <ConfirmDialog
          open={Boolean(deleteRequest)}
          title="移入最近删除？"
          message={`“${deleteRequest?.label ?? ''}”会从当前展柜移出，但可以在本次操作后立即撤销。`}
          confirmLabel="移入最近删除"
          cancelLabel="保留这份回忆"
          danger
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleteRequest(null)}
        />
      </View>
      {!sheetOpen ? (
        <BottomNav
          active="memories"
          onSelect={(key) => {
            if (key === 'today' || key === 'records' || key === 'family') {
              openRootTab(key);
            }
          }}
          onAddClick={() => setSheetOpen(true)}
        />
      ) : null}
      <AppDrawer
        open={drawerOpen}
        babyName={babyName}
        babyAgeLabel={babyAgeLabel}
        gemAmount={gemAmount}
        items={DEFAULT_DRAWER_ITEMS.map((item) => ({
          ...item,
          active: item.id === 'memories',
          onClick: () => {
            if (item.id === 'memories') {
              setDrawerOpen(false);
              return;
            }
            if (
              item.id === 'today' ||
              item.id === 'records' ||
              item.id === 'family'
            ) {
              openRootTab(item.id);
              return;
            }
            setDrawerOpen(false);
            if (item.id === 'growth') {
              void Taro.navigateTo({ url: '/pages/growth/index' });
            } else if (item.id === 'knowledge') {
              void Taro.navigateTo({ url: '/pages/knowledge/index' });
            } else if (item.id === 'health') {
              void Taro.navigateTo({ url: '/pages/health/index' });
            } else if (item.id === 'settings') {
              void Taro.navigateTo({ url: '/pages/settings/index' });
            } else if (item.id === 'baby') {
              void Taro.navigateTo({ url: '/pages/baby/index' });
            } else {
              showToast(`${item.title}正在布置，先逛逛回忆馆`);
            }
          },
        }))}
        onClose={() => setDrawerOpen(false)}
        onSearchClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/search/index' });
        }}
        onNotificationClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/notifications/index' });
        }}
        onAdminClick={() => {
          setDrawerOpen(false);
          void Taro.navigateTo({ url: '/pages/admin/index' });
        }}
      />
      <AddMomentOverlay
        open={sheetOpen}
        gemAmount={gemAmount}
        onClose={() => setSheetOpen(false)}
        onSelect={handleMomentSelect}
      />
    </PageShell>
  );
}
