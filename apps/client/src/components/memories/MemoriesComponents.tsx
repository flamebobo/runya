import React, { useState, useEffect, useRef } from 'react';
import { Image, View, Text, Slider, Video } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { AudioCategory, MediaPublic } from '@runew/contracts';
import styles from './MemoriesComponents.module.scss';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PrimaryActionButton, SecondaryGlassButton } from '@/components/buttons';
import { BottomSheet } from '@/components/overlay';
import { Glyph } from '@/components/icons/Glyph';
import { IconActionButton } from '@/components/buttons';
import { getMediaContentUrl, getMediaThumbnailUrl } from '@/api/memories';

export interface ProtectedMediaImageProps {
  mediaId: string;
  kind?: 'content' | 'thumbnail';
  alt: string;
  className?: string;
  authToken?: string;
}

/**
 * WeChat image requests do not inherit the bearer header from apiRequest.
 * Downloading an authenticated temporary preview keeps the server media route
 * private without turning that temporary path into durable storage.
 */
export const ProtectedMediaImage: React.FC<ProtectedMediaImageProps> = ({
  mediaId,
  kind = 'thumbnail',
  alt,
  className,
  authToken,
}) => {
  const mediaUrl =
    kind === 'content' ? getMediaContentUrl(mediaId) : getMediaThumbnailUrl(mediaId);
  const [src, setSrc] = useState<string | null>(
    Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? null : mediaUrl,
  );

  useEffect(() => {
    let disposed = false;
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
      setSrc(mediaUrl);
      return () => {
        disposed = true;
      };
    }

    const token =
      authToken || (Taro.getStorageSync('runew_session_token') as string | undefined);
    if (!token) return undefined;
    void Taro.downloadFile({
      url: mediaUrl,
      header: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'WEAPP' },
    })
      .then((response) => {
        if (
          !disposed &&
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          response.tempFilePath
        ) {
          setSrc(response.tempFilePath);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [authToken, mediaUrl]);

  return src ? (
    <Image className={className} src={src} mode="aspectFill" aria-label={alt} />
  ) : (
    <View className={styles.mediaLoading} aria-label="媒体正在加载" />
  );
};

export interface ProtectedMediaVideoProps {
  mediaId: string;
  className?: string;
  authToken?: string;
  ariaLabel?: string;
}

export const ProtectedMediaVideo: React.FC<ProtectedMediaVideoProps> = ({
  mediaId,
  className,
  authToken,
  ariaLabel = '回忆视频',
}) => {
  const mediaUrl = getMediaContentUrl(mediaId);
  const [src, setSrc] = useState<string | null>(
    Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? null : mediaUrl,
  );

  useEffect(() => {
    let disposed = false;
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
      setSrc(mediaUrl);
      return () => {
        disposed = true;
      };
    }

    const token =
      authToken || (Taro.getStorageSync('runew_session_token') as string | undefined);
    if (!token) return undefined;
    void Taro.downloadFile({
      url: mediaUrl,
      header: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'WEAPP' },
    })
      .then((response) => {
        if (
          !disposed &&
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          response.tempFilePath
        ) {
          setSrc(response.tempFilePath);
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [authToken, mediaUrl]);

  return src ? (
    <Video className={className} src={src} controls aria-label={ariaLabel} />
  ) : (
    <View className={styles.mediaLoading} aria-label="视频正在加载" />
  );
};

// --- Inline Audio Player Component ---
export interface AudioPlayerProps {
  mediaId: string;
  title: string;
  category?: AudioCategory;
  durationMs?: number;
  authToken?: string;
  favorite?: boolean;
  onFavorite?: () => void;
}

export const InlineAudioPlayer: React.FC<AudioPlayerProps> = ({
  mediaId,
  title,
  category = 'OTHER',
  durationMs = 0,
  authToken,
  favorite = false,
  onFavorite,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(
    durationMs ? Math.round(durationMs / 1000) : 0,
  );
  const innerAudioContextRef = useRef<Taro.InnerAudioContext | null>(null);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'LAUGH':
        return '清脆笑声 😂';
      case 'FIRST_MOM':
        return '第一次叫妈妈 💗';
      case 'FIRST_DAD':
        return '第一次叫爸爸 💙';
      case 'BABBLING':
        return '咿咿呀呀 🌱';
      case 'DAD_STORY':
        return '爸爸故事 📖';
      case 'MOM_LULLABY':
        return '妈妈摇篮曲 🌙';
      case 'FIRST_WORDS':
        return '第一句话 💬';
      case 'SINGING':
        return '可爱哼唱 🎵';
      case 'SLEEP_TALK':
        return '梦呓喃喃 🌙';
      default:
        return '声音记忆 🎙️';
    }
  };

  useEffect(() => {
    const ctx = Taro.createInnerAudioContext();
    let disposed = false;
    const apiBase = process.env.TARO_APP_API_BASE || '/api/v1';
    const token =
      authToken || (Taro.getStorageSync('runew_session_token') as string | undefined);
    const setSource = async () => {
      if (Taro.getEnv() === Taro.ENV_TYPE.WEAPP && token) {
        const response = await Taro.downloadFile({
          url: `${apiBase}/media/${mediaId}/content`,
          header: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'WEAPP' },
        });
        if (!disposed && response.tempFilePath) ctx.src = response.tempFilePath;
      } else if (!disposed) {
        ctx.src = `${apiBase}/media/${mediaId}/content`;
      }
    };
    void setSource().catch(() => undefined);

    ctx.onPlay(() => setIsPlaying(true));
    ctx.onPause(() => setIsPlaying(false));
    ctx.onEnded(() => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    ctx.onTimeUpdate(() => {
      setCurrentTime(Math.round(ctx.currentTime || 0));
      if (ctx.duration) setTotalTime((current) => current || Math.round(ctx.duration));
    });

    innerAudioContextRef.current = ctx;

    return () => {
      disposed = true;
      ctx.destroy();
    };
  }, [authToken, mediaId]);

  const togglePlay = () => {
    const ctx = innerAudioContextRef.current;
    if (!ctx) return;

    if (isPlaying) {
      ctx.pause();
    } else {
      ctx.play();
    }
  };

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const progressPercent =
    totalTime > 0 ? Math.min(100, Math.round((currentTime / totalTime) * 100)) : 0;
  const seek = (event: { detail: { value: number } }) => {
    const nextPercent = Number(event.detail.value);
    const nextTime = totalTime > 0 ? (nextPercent / 100) * totalTime : 0;
    innerAudioContextRef.current?.seek(nextTime);
    setCurrentTime(Math.round(nextTime));
  };

  return (
    <View className={styles.audioPlayerCard}>
      <View className={styles.headerRow}>
        <Text className={styles.title}>{title}</Text>
        <Text className={styles.badge}>{getCategoryLabel(category)}</Text>
      </View>
      <View className={styles.playerControls}>
        <View
          className={styles.playBtn}
          onClick={togglePlay}
          role="button"
          aria-label={isPlaying ? '暂停播放' : '播放声音'}
        >
          <Glyph name={isPlaying ? 'pause' : 'play'} size="sm" />
        </View>
        <View className={styles.trackArea}>
          <Slider
            className={styles.progressSlider}
            value={progressPercent}
            max={100}
            step={1}
            onChange={seek}
            aria-label="调整播放进度"
          />
          <View className={styles.timeLabel}>
            <Text>{formatSec(currentTime)}</Text>
            <Text>{formatSec(totalTime)}</Text>
          </View>
        </View>
        {onFavorite ? (
          <IconActionButton
            label={favorite ? '取消珍藏' : '珍藏声音'}
            icon={<Glyph name="heart" size="sm" />}
            onClick={onFavorite}
          />
        ) : null}
      </View>
    </View>
  );
};

export interface MemoryMediaStripProps {
  media: MediaPublic[];
  authToken?: string;
}

export const MemoryMediaStrip: React.FC<MemoryMediaStripProps> = ({
  media,
  authToken,
}) => {
  if (!media.length) return null;
  return (
    <View className={styles.mediaStrip}>
      {media.map((item) => {
        if (item.status !== 'READY') {
          return (
            <View key={item.id} className={styles.mediaPending}>
              <Glyph name={item.status === 'FAILED' ? 'shield' : 'dash'} size="sm" />
              <Text>
                {item.status === 'FAILED' ? '原件已保留，处理失败' : '媒体正在准备中'}
              </Text>
            </View>
          );
        }
        if (item.mediaType === 'IMAGE') {
          return (
            <ProtectedMediaImage
              key={item.id}
              mediaId={item.id}
              alt={item.originalFilename || '回忆照片'}
              authToken={authToken}
              className={styles.mediaThumb}
            />
          );
        }
        if (item.mediaType === 'AUDIO') {
          return (
            <InlineAudioPlayer
              key={item.id}
              mediaId={item.id}
              title={item.originalFilename || '回忆声音'}
              durationMs={item.durationMs ?? undefined}
              authToken={authToken}
            />
          );
        }
        if (item.mediaType === 'VIDEO') {
          return (
            <ProtectedMediaVideo
              key={item.id}
              mediaId={item.id}
              authToken={authToken}
              className={styles.mediaVideo}
            />
          );
        }
        return (
          <View key={item.id} className={styles.mediaPending}>
            <Glyph name="file" size="sm" />
            <Text>附件已保存</Text>
          </View>
        );
      })}
    </View>
  );
};

// --- Time Capsule Card Component ---
export interface TimeCapsuleProps {
  id: string;
  title: string;
  body: string;
  recipientText?: string | null;
  state: 'DRAFT' | 'SEALED' | 'OPENED';
  openAt: number;
  sealedAt?: number | null;
  openedAt?: number | null;
  favorite?: boolean;
  media?: MediaPublic[];
  authToken?: string;
  onFavorite?: () => void;
  onEditDraft?: () => void;
  onSeal?: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
}

export const TimeCapsuleCard: React.FC<TimeCapsuleProps> = ({
  title,
  body,
  recipientText,
  state,
  openAt,
  favorite = false,
  media = [],
  authToken,
  onFavorite,
  onEditDraft,
  onSeal,
  onOpen,
  onDelete,
}) => {
  const now = Date.now();
  const canOpenNow = state === 'SEALED' && now >= openAt;
  const openDateStr = new Date(openAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <GlassSurface
      className={`${styles.capsuleCard} ${
        state === 'DRAFT'
          ? styles.draft
          : state === 'SEALED'
            ? styles.sealed
            : styles.opened
      }`}
    >
      <View className={styles.capsuleHeader}>
        <Text className={styles.title}>{title}</Text>
        {state === 'DRAFT' && (
          <Text className={`${styles.stateBadge} ${styles.draftBadge}`}>草稿中</Text>
        )}
        {state === 'SEALED' && (
          <View className={`${styles.stateBadge} ${styles.sealedBadge}`}>
            <Glyph name="lock" size="sm" />
            <Text>{canOpenNow ? '可开启' : '封存中'}</Text>
          </View>
        )}
        {state === 'OPENED' && (
          <Text className={`${styles.stateBadge} ${styles.openedBadge}`}>已开启</Text>
        )}
      </View>

      {recipientText && <Text className={styles.recipient}>寄给：{recipientText}</Text>}

      {state === 'OPENED' ? (
        <Text className={styles.bodyPreview}>{body}</Text>
      ) : state === 'SEALED' ? (
        <View className={styles.sealedLockNotice}>
          <Glyph name="lock" size="sm" />
          <Text>封存中 · 开启日期：{openDateStr}</Text>
        </View>
      ) : (
        <Text className={styles.bodyPreview}>
          {body.length > 60 ? `${body.substring(0, 60)}...` : body}
        </Text>
      )}

      {state !== 'SEALED' ? (
        <MemoryMediaStrip media={media} authToken={authToken} />
      ) : null}

      <View className={styles.actionRow}>
        {onFavorite && (
          <IconActionButton
            label={favorite ? '取消珍藏胶囊' : '珍藏胶囊'}
            icon={<Glyph name="heart" size="sm" />}
            onClick={onFavorite}
          />
        )}
        {state === 'DRAFT' && (
          <>
            <SecondaryGlassButton
              label="编辑草稿"
              onClick={onEditDraft}
              fullWidth={false}
            />
            <PrimaryActionButton label="封存胶囊" onClick={onSeal} fullWidth={false} />
          </>
        )}
        {state === 'SEALED' && canOpenNow && (
          <PrimaryActionButton
            label="开启时光胶囊"
            onClick={onOpen}
            fullWidth={false}
          />
        )}
        {onDelete && (
          <SecondaryGlassButton
            label="移入最近删除"
            onClick={onDelete}
            fullWidth={false}
          />
        )}
      </View>
    </GlassSurface>
  );
};

// --- JIT Microphone Permission Sheet ---
export interface MicrophonePermissionSheetProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const JitMicrophonePermissionSheet: React.FC<MicrophonePermissionSheetProps> = ({
  visible,
  onConfirm,
  onCancel,
}) => {
  return (
    <BottomSheet open={visible} onClose={onCancel} title="使用麦克风权限说明 🌱">
      <View style={{ padding: '16px 20px', textAlign: 'center' }}>
        <View
          style={{
            marginBottom: '12px',
            display: 'flex',
            justifyContent: 'center',
            color: '#c87847',
          }}
        >
          <Glyph name="mic" size="lg" />
        </View>
        <Text
          style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#4a382c',
            marginBottom: '8px',
            display: 'block',
          }}
        >
          润芽想要记录宝宝清脆治愈的声音
        </Text>
        <Text
          style={{
            fontSize: '14px',
            color: '#7a6859',
            lineHeight: '1.5',
            marginBottom: '24px',
            display: 'block',
          }}
        >
          我们需要使用手机麦克风录制宝宝的第一声笑声、第一句咿呀学语。录音数据将安全保存在您的私有成长工作台。
        </Text>
        <View style={{ display: 'flex', gap: '12px' }}>
          <SecondaryGlassButton label="暂不授权" onClick={onCancel} fullWidth={false} />
          <PrimaryActionButton label="允许录音" onClick={onConfirm} fullWidth={false} />
        </View>
      </View>
    </BottomSheet>
  );
};
