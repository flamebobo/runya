import React, { useState, useEffect, useRef } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './MemoriesComponents.module.scss';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PrimaryActionButton, SecondaryGlassButton } from '@/components/buttons';
import { BottomSheet } from '@/components/overlay';

// --- Inline Audio Player Component ---
export interface AudioPlayerProps {
  mediaId: string;
  title: string;
  category?: 'LAUGH' | 'FIRST_WORDS' | 'SINGING' | 'SLEEP_TALK' | 'OTHER';
  durationMs?: number;
  authToken?: string;
}

export const InlineAudioPlayer: React.FC<AudioPlayerProps> = ({
  mediaId,
  title,
  category = 'OTHER',
  durationMs = 0,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(durationMs ? Math.round(durationMs / 1000) : 0);
  const innerAudioContextRef = useRef<Taro.InnerAudioContext | null>(null);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'LAUGH':
        return '清脆笑声 😂';
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
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    ctx.src = `${API_BASE}/media/${mediaId}/content`;

    ctx.onPlay(() => setIsPlaying(true));
    ctx.onPause(() => setIsPlaying(false));
    ctx.onEnded(() => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    ctx.onTimeUpdate(() => {
      setCurrentTime(Math.round(ctx.currentTime || 0));
      if (ctx.duration && !totalTime) {
        setTotalTime(Math.round(ctx.duration));
      }
    });

    innerAudioContextRef.current = ctx;

    return () => {
      ctx.destroy();
    };
  }, [mediaId, totalTime]);

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

  const progressPercent = totalTime > 0 ? Math.min(100, Math.round((currentTime / totalTime) * 100)) : 0;

  return (
    <View className={styles.audioPlayerCard}>
      <View className={styles.headerRow}>
        <Text className={styles.title}>{title}</Text>
        <Text className={styles.badge}>{getCategoryLabel(category)}</Text>
      </View>
      <View className={styles.playerControls}>
        <View className={styles.playBtn} onClick={togglePlay}>
          {isPlaying ? '❚❚' : '▶'}
        </View>
        <View className={styles.trackArea}>
          <View className={styles.progressBarBg}>
            <View className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
          </View>
          <View className={styles.timeLabel}>
            <Text>{formatSec(currentTime)}</Text>
            <Text>{formatSec(totalTime)}</Text>
          </View>
        </View>
      </View>
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
  onEditDraft?: () => void;
  onSeal?: () => void;
  onOpen?: () => void;
}

export const TimeCapsuleCard: React.FC<TimeCapsuleProps> = ({
  title,
  body,
  recipientText,
  state,
  openAt,
  onEditDraft,
  onSeal,
  onOpen,
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
        state === 'DRAFT' ? styles.draft : state === 'SEALED' ? styles.sealed : styles.opened
      }`}
    >
      <View className={styles.capsuleHeader}>
        <Text className={styles.title}>{title}</Text>
        {state === 'DRAFT' && <Text className={`${styles.stateBadge} ${styles.draftBadge}`}>📝 草稿中</Text>}
        {state === 'SEALED' && (
          <Text className={`${styles.stateBadge} ${styles.sealedBadge}`}>
            {canOpenNow ? '🔑 可开启' : '🔒 封存中'}
          </Text>
        )}
        {state === 'OPENED' && <Text className={`${styles.stateBadge} ${styles.openedBadge}`}>✨ 已开启</Text>}
      </View>

      {recipientText && <Text className={styles.recipient}>寄给：{recipientText}</Text>}

      {state === 'OPENED' ? (
        <Text className={styles.bodyPreview}>{body}</Text>
      ) : state === 'SEALED' ? (
        <View className={styles.sealedLockNotice}>
          <Text>🔒 封存中 · 开启日期：{openDateStr}</Text>
        </View>
      ) : (
        <Text className={styles.bodyPreview}>{body.length > 60 ? `${body.substring(0, 60)}...` : body}</Text>
      )}

      <View className={styles.actionRow}>
        {state === 'DRAFT' && (
          <>
            <SecondaryGlassButton label="编辑草稿" onClick={onEditDraft} fullWidth={false} />
            <PrimaryActionButton label="封存胶囊" onClick={onSeal} fullWidth={false} />
          </>
        )}
        {state === 'SEALED' && canOpenNow && (
          <PrimaryActionButton label="开启时光胶囊 ✨" onClick={onOpen} fullWidth={false} />
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
        <Text style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }}>🎙️</Text>
        <Text style={{ fontSize: '16px', fontWeight: '600', color: '#4a382c', marginBottom: '8px', display: 'block' }}>
          润芽想要记录宝宝清脆治愈的声音
        </Text>
        <Text style={{ fontSize: '14px', color: '#7a6859', lineHeight: '1.5', marginBottom: '24px', display: 'block' }}>
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
