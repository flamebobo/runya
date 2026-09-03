import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import styles from './index.module.scss';
import { PageShell } from '@/components/foundation/PageShell';
import { PrimaryActionButton, SecondaryGlassButton } from '@/components/buttons';
import { BottomSheet, ConfirmDialog } from '@/components/overlay';
import { GlassInput, GlassTextArea } from '@/components/forms';
import {
  InlineAudioPlayer,
  TimeCapsuleCard,
  JitMicrophonePermissionSheet,
} from '@/components/memories/MemoriesComponents';
import {
  fetchMemoriesSummary,
  fetchPhotoMemories,
  createPhotoMemory,
  fetchBabyQuotes,
  createBabyQuote,
  fetchAudioMemories,
  createAudioMemory,
  fetchFirstMoments,
  createFirstMoment,
  fetchTimeCapsules,
  createTimeCapsule,
  sealTimeCapsule,
  openTimeCapsule,
} from '@/api/memories';
import { saveDurableLocalMedia } from '@/local/mediaStorage';

export default function MemoriesPage() {
  const babyId = '01JDEFAULTBABYID000000000'; // Active baby ID fallback
  const [activeTab, setActiveTab] = useState<'summary' | 'photos' | 'quotes' | 'audios' | 'firsts' | 'capsules'>(
    'summary',
  );

  const [summary, setSummary] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [audios, setAudios] = useState<any[]>([]);
  const [firsts, setFirsts] = useState<any[]>([]);
  const [capsules, setCapsules] = useState<any[]>([]);

  const [composeSheetVisible, setComposeSheetVisible] = useState(false);
  const [micSheetVisible, setMicSheetVisible] = useState(false);

  // Modal forms
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoStory, setPhotoStory] = useState('');

  const [quoteModalVisible, setQuoteModalVisible] = useState(false);
  const [quoteText, setQuoteText] = useState('');

  const [audioModalVisible, setAudioModalVisible] = useState(false);
  const [audioTitle, setAudioTitle] = useState('');
  const [audioCategory] = useState<'LAUGH' | 'FIRST_WORDS' | 'SINGING' | 'SLEEP_TALK' | 'OTHER'>(
    'OTHER',
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const [firstModalVisible, setFirstModalVisible] = useState(false);
  const [firstTitle, setFirstTitle] = useState('');
  const [firstDesc, setFirstDesc] = useState('');

  const [capsuleModalVisible, setCapsuleModalVisible] = useState(false);
  const [capsuleTitle, setCapsuleTitle] = useState('');
  const [capsuleBody, setCapsuleBody] = useState('');
  const [capsuleRecipient, setCapsuleRecipient] = useState('');
  const [sealConfirmVisible, setSealConfirmVisible] = useState(false);
  const [pendingCapsuleId, setPendingCapsuleId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const s = await fetchMemoriesSummary(babyId);
      if (s) setSummary(s);

      const p = await fetchPhotoMemories(babyId);
      setPhotos(p);

      const q = await fetchBabyQuotes(babyId);
      setQuotes(q);

      const a = await fetchAudioMemories(babyId);
      setAudios(a);

      const f = await fetchFirstMoments(babyId);
      setFirsts(f);

      const c = await fetchTimeCapsules(babyId);
      setCapsules(c);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadData();
  }, [babyId]);

  // Audio recording timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const handleCreatePhoto = async () => {
    if (!photoTitle.trim()) {
      Taro.showToast({ title: '请输入回忆标题', icon: 'none' });
      return;
    }
    await createPhotoMemory(babyId, {
      title: photoTitle,
      story: photoStory,
      happenedAt: Date.now(),
      mediaIds: [],
    });
    setPhotoModalVisible(false);
    setPhotoTitle('');
    setPhotoStory('');
    loadData();
    Taro.showToast({ title: '照片回忆已保存 🌱', icon: 'success' });
  };

  const handleCreateQuote = async () => {
    if (!quoteText.trim()) {
      Taro.showToast({ title: '请写下宝宝说的话', icon: 'none' });
      return;
    }
    await createBabyQuote(babyId, {
      quoteText,
      happenedAt: Date.now(),
    });
    setQuoteModalVisible(false);
    setQuoteText('');
    loadData();
    Taro.showToast({ title: '宝宝语录已保存 💬', icon: 'success' });
  };

  const handleStartRecord = () => {
    setMicSheetVisible(false);
    setAudioModalVisible(true);
    setIsRecording(true);
    setRecordSec(0);
  };

  const handleStopRecord = async () => {
    setIsRecording(false);
    if (!audioTitle.trim()) {
      setAudioTitle(`宝宝的声音记录 (${recordSec}秒)`);
    }
  };

  const handleSaveAudio = async () => {
    if (!audioTitle.trim()) {
      Taro.showToast({ title: '请输入声音标题', icon: 'none' });
      return;
    }
    const durable = await saveDurableLocalMedia('tmp_audio_recording.m4a', 'audio/m4a');
    await createAudioMemory(babyId, {
      mediaId: durable.localId,
      title: audioTitle,
      category: audioCategory,
      happenedAt: Date.now(),
    });
    setAudioModalVisible(false);
    setAudioTitle('');
    loadData();
    Taro.showToast({ title: '声音记忆已安全保存 🎙️', icon: 'success' });
  };

  const handleCreateFirst = async () => {
    if (!firstTitle.trim()) {
      Taro.showToast({ title: '请输入第一次发生的事', icon: 'none' });
      return;
    }
    await createFirstMoment(babyId, {
      title: firstTitle,
      description: firstDesc,
      happenedAt: Date.now(),
    });
    setFirstModalVisible(false);
    setFirstTitle('');
    setFirstDesc('');
    loadData();
    Taro.showToast({ title: '第一次已成功珍藏 ✨', icon: 'success' });
  };

  const handleCreateCapsule = async (sealNow = false) => {
    if (!capsuleTitle.trim() || !capsuleBody.trim()) {
      Taro.showToast({ title: '请填写标题与主要内容', icon: 'none' });
      return;
    }
    const openAt = Date.now() + 365 * 24 * 3600 * 1000;
    await createTimeCapsule(babyId, {
      title: capsuleTitle,
      body: capsuleBody,
      recipientText: capsuleRecipient,
      openAt,
      sealNow,
    });
    setCapsuleModalVisible(false);
    setCapsuleTitle('');
    setCapsuleBody('');
    setCapsuleRecipient('');
    loadData();
    Taro.showToast({ title: sealNow ? '时光胶囊已正式封存 🔒' : '胶囊草稿已保存 📝', icon: 'success' });
  };

  const handleSealConfirm = async () => {
    if (pendingCapsuleId) {
      await sealTimeCapsule(pendingCapsuleId);
      setSealConfirmVisible(false);
      setPendingCapsuleId(null);
      loadData();
      Taro.showToast({ title: '时光胶囊已封存 🔒', icon: 'success' });
    }
  };

  const handleOpenCapsule = async (id: string) => {
    try {
      await openTimeCapsule(id);
      loadData();
      Taro.showToast({ title: '时光胶囊已成功开启！✨', icon: 'success' });
    } catch {
      Taro.showToast({ title: '未能开启，请检查时间', icon: 'none' });
    }
  };

  return (
    <PageShell bottomNav>
      <View className={styles.memoriesPage}>
        {/* Header Summary Banner */}
        <View className={styles.topSummaryBanner}>
          <Text className={styles.museumTitle}>润润的家庭记忆博物馆 🏛️</Text>
          <Text className={styles.museumSubtitle}>把润润长大的每一天，认真收藏起来。</Text>
          <View className={styles.statsGrid}>
            <View className={styles.statBox}>
              <Text className={styles.num}>{summary?.photosCount ?? photos.length}</Text>
              <Text className={styles.label}>照片回忆</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{summary?.quotesCount ?? quotes.length}</Text>
              <Text className={styles.label}>宝宝语录</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{summary?.audiosCount ?? audios.length}</Text>
              <Text className={styles.label}>声音记录</Text>
            </View>
            <View className={styles.statBox}>
              <Text className={styles.num}>{summary?.capsulesCount ?? capsules.length}</Text>
              <Text className={styles.label}>时光胶囊</Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher */}
        <ScrollView scrollX className={styles.tabsBar}>
          <View
            className={`${styles.tabChip} ${activeTab === 'summary' ? styles.active : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            全部 Memory
          </View>
          <View
            className={`${styles.tabChip} ${activeTab === 'photos' ? styles.active : ''}`}
            onClick={() => setActiveTab('photos')}
          >
            照片回忆 ({photos.length})
          </View>
          <View
            className={`${styles.tabChip} ${activeTab === 'quotes' ? styles.active : ''}`}
            onClick={() => setActiveTab('quotes')}
          >
            宝宝语录 ({quotes.length})
          </View>
          <View
            className={`${styles.tabChip} ${activeTab === 'audios' ? styles.active : ''}`}
            onClick={() => setActiveTab('audios')}
          >
            宝宝声音 ({audios.length})
          </View>
          <View
            className={`${styles.tabChip} ${activeTab === 'firsts' ? styles.active : ''}`}
            onClick={() => setActiveTab('firsts')}
          >
            第一次 ({firsts.length})
          </View>
          <View
            className={`${styles.tabChip} ${activeTab === 'capsules' ? styles.active : ''}`}
            onClick={() => setActiveTab('capsules')}
          >
            时光胶囊 ({capsules.length})
          </View>
        </ScrollView>

        <View className={styles.contentArea}>
          {/* On-This-Day Banner (06.23) */}
          <View className={styles.onThisDayBanner}>
            <View className={styles.left}>
              <Text className={styles.title}>那年今日 🗓️</Text>
              <Text className={styles.sub}>重温去年的今天，润润的点滴美好回忆</Text>
            </View>
            <View className={styles.viewBtn}>查看回顾</View>
          </View>

          {/* Photo Memories Grid (06.02 - 06.05) */}
          {(activeTab === 'summary' || activeTab === 'photos') && (
            <View>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#3d2b1f', marginBottom: '10px', display: 'block' }}>
                📸 照片回忆
              </Text>
              <View className={styles.photoGrid}>
                {photos.length > 0 ? (
                  photos.map((p) => (
                    <View key={p.id} className={styles.photoCard}>
                      <View className={styles.photoPlaceholder}>📷</View>
                      <View className={styles.info}>
                        <Text className={styles.title}>{p.title}</Text>
                        <Text className={styles.date}>{new Date(p.happenedAt).toLocaleDateString()}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: '#9c8a7c', fontSize: '13px' }}>暂无照片回忆，点击右下角添加</Text>
                )}
              </View>
            </View>
          )}

          {/* Baby Quotes (06.06 - 06.08) */}
          {(activeTab === 'summary' || activeTab === 'quotes') && (
            <View style={{ marginTop: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#3d2b1f', marginBottom: '10px', display: 'block' }}>
                💬 宝宝语录
              </Text>
              {quotes.map((q) => (
                <View key={q.id} className={styles.quoteCard}>
                  <Text className={styles.text}>“{q.quoteText}”</Text>
                  <Text className={styles.meta}>{new Date(q.happenedAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Baby Audio Player (06.09 - 06.13) */}
          {(activeTab === 'summary' || activeTab === 'audios') && (
            <View style={{ marginTop: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#3d2b1f', marginBottom: '10px', display: 'block' }}>
                🎙️ 宝宝声音
              </Text>
              {audios.map((a) => (
                <InlineAudioPlayer
                  key={a.id}
                  mediaId={a.mediaId}
                  title={a.title}
                  category={a.category}
                  durationMs={a.media?.durationMs}
                />
              ))}
            </View>
          )}

          {/* First Moments (06.14 - 06.15) */}
          {(activeTab === 'summary' || activeTab === 'firsts') && (
            <View style={{ marginTop: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#3d2b1f', marginBottom: '10px', display: 'block' }}>
                ✨ 第一次
              </Text>
              {firsts.map((f) => (
                <View key={f.id} className={styles.firstMomentCard}>
                  <Text className={styles.title}>🎉 {f.title}</Text>
                  {f.description && <Text className={styles.desc}>{f.description}</Text>}
                  <Text className={styles.date}>{new Date(f.happenedAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Time Capsules (06.19 - 06.21) */}
          {(activeTab === 'summary' || activeTab === 'capsules') && (
            <View style={{ marginTop: '16px' }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: '#3d2b1f', marginBottom: '10px', display: 'block' }}>
                ✉️ 时光胶囊
              </Text>
              {capsules.map((c) => (
                <TimeCapsuleCard
                  key={c.id}
                  id={c.id}
                  title={c.title}
                  body={c.body}
                  recipientText={c.recipientText}
                  state={c.state}
                  openAt={c.openAt}
                  onSeal={() => {
                    setPendingCapsuleId(c.id);
                    setSealConfirmVisible(true);
                  }}
                  onOpen={() => handleOpenCapsule(c.id)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Floating Add Action Button */}
        <View className={styles.fabBtn} onClick={() => setComposeSheetVisible(true)}>
          <Text>+</Text>
          <Text>新增回忆</Text>
        </View>

        {/* Compose Choice Sheet */}
        <BottomSheet open={composeSheetVisible} onClose={() => setComposeSheetVisible(false)} title="珍藏一份新回忆 🌱">
          <View style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <SecondaryGlassButton
              label="📸 记录照片回忆"
              onClick={() => {
                setComposeSheetVisible(false);
                setPhotoModalVisible(true);
              }}
            />
            <SecondaryGlassButton
              label="💬 记录宝宝语录"
              onClick={() => {
                setComposeSheetVisible(false);
                setQuoteModalVisible(true);
              }}
            />
            <SecondaryGlassButton
              label="🎙️ 录制宝宝声音"
              onClick={() => {
                setComposeSheetVisible(false);
                setMicSheetVisible(true);
              }}
            />
            <SecondaryGlassButton
              label="✨ 记录第一次"
              onClick={() => {
                setComposeSheetVisible(false);
                setFirstModalVisible(true);
              }}
            />
            <SecondaryGlassButton
              label="✉️ 封存时光胶囊"
              onClick={() => {
                setComposeSheetVisible(false);
                setCapsuleModalVisible(true);
              }}
            />
          </View>
        </BottomSheet>

        {/* JIT Permission Sheet for Mic */}
        <JitMicrophonePermissionSheet
          visible={micSheetVisible}
          onConfirm={handleStartRecord}
          onCancel={() => setMicSheetVisible(false)}
        />

        {/* Photo Compose Modal */}
        <BottomSheet open={photoModalVisible} onClose={() => setPhotoModalVisible(false)} title="📸 新增照片回忆">
          <View style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <GlassInput value={photoTitle} onInput={(val) => setPhotoTitle(val)} placeholder="回忆标题（例如：宝宝第一次晒太阳）" />
            <GlassTextArea value={photoStory} onInput={(val) => setPhotoStory(val)} placeholder="写下当时的故事或心情..." />
            <PrimaryActionButton label="保存照片回忆" onClick={handleCreatePhoto} />
          </View>
        </BottomSheet>

        {/* Quote Compose Modal */}
        <BottomSheet open={quoteModalVisible} onClose={() => setQuoteModalVisible(false)} title="💬 记录宝宝语录">
          <View style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <GlassTextArea value={quoteText} onInput={(val) => setQuoteText(val)} placeholder="宝宝说了什么有趣的、治愈的话？..." />
            <PrimaryActionButton label="保存宝宝语录" onClick={handleCreateQuote} />
          </View>
        </BottomSheet>

        {/* Audio Record Modal */}
        <BottomSheet open={audioModalVisible} onClose={() => setAudioModalVisible(false)} title="🎙️ 录制宝宝的声音">
          <View style={{ padding: '20px', textAlign: 'center' }}>
            {isRecording ? (
              <View style={{ marginBottom: '20px' }}>
                <Text style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>🔴</Text>
                <Text style={{ fontSize: '20px', fontWeight: 700, color: '#f27c38' }}>录音中 {recordSec} 秒</Text>
                <SecondaryGlassButton label="停止录音" onClick={handleStopRecord} />
              </View>
            ) : (
              <View style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <GlassInput value={audioTitle} onInput={(val) => setAudioTitle(val)} placeholder="声音标题（例如：咯咯大笑声）" />
                <PrimaryActionButton label="保存声音记录" onClick={handleSaveAudio} />
              </View>
            )}
          </View>
        </BottomSheet>

        {/* First Moment Modal */}
        <BottomSheet open={firstModalVisible} onClose={() => setFirstModalVisible(false)} title="✨ 记录第一次">
          <View style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <GlassInput value={firstTitle} onInput={(val) => setFirstTitle(val)} placeholder="第一次做什么（例如：第一次会坐）" />
            <GlassTextArea value={firstDesc} onInput={(val) => setFirstDesc(val)} placeholder="记录下这个难忘瞬间的细节..." />
            <PrimaryActionButton label="珍藏第一次" onClick={handleCreateFirst} />
          </View>
        </BottomSheet>

        {/* Time Capsule Modal */}
        <BottomSheet open={capsuleModalVisible} onClose={() => setCapsuleModalVisible(false)} title="✉️ 封存时光胶囊">
          <View style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <GlassInput value={capsuleRecipient} onInput={(val) => setCapsuleRecipient(val)} placeholder="收件人（例如：十八岁的润润）" />
            <GlassInput value={capsuleTitle} onInput={(val) => setCapsuleTitle(val)} placeholder="胶囊标题" />
            <GlassTextArea value={capsuleBody} onInput={(val) => setCapsuleBody(val)} placeholder="写给未来的一封信..." />
            <View style={{ display: 'flex', gap: '12px' }}>
              <SecondaryGlassButton label="存为草稿" onClick={() => handleCreateCapsule(false)} />
              <PrimaryActionButton label="立即封存 🔒" onClick={() => handleCreateCapsule(true)} />
            </View>
          </View>
        </BottomSheet>

        {/* Seal Confirmation Dialog */}
        <ConfirmDialog
          open={sealConfirmVisible}
          title="确认封存时光胶囊？🔒"
          message="封存后将无法直接修改胶囊正文，直到到达指定开启日期。确定现在封存吗？"
          confirmLabel="确认封存"
          cancelLabel="稍后再说"
          onConfirm={handleSealConfirm}
          onCancel={() => setSealConfirmVisible(false)}
        />
      </View>
    </PageShell>
  );
}
