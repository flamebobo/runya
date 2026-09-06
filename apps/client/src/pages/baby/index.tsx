import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { CreateBabyBody, UpdateBabyBody } from '@runew/contracts';
import {
  AppTopBar,
  EmptyState,
  ErrorState,
  GlassInput,
  GlassSurface,
  PageShell,
  PrimaryActionButton,
  SecondaryGlassButton,
  Skeleton,
} from '@/components';
import { GlassDateField } from '@/components/forms';
import { Glyph } from '@/components/icons/Glyph';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { useBootstrapQuery, bootstrapQueryKey } from '@/hooks/useBootstrap';
import { useFamilyRuntimeStore, useUiOverlayStore } from '@/stores/runtime';
import { addBaby, createBabyPreference, fetchBabyChanges, fetchBabyPreferences, switchBaby, updateBaby } from '@/api/m11';
import { formatBirthdayLabel, formatBabyAgeLabel } from '@/utils/babyAge';
import styles from './index.module.scss';

// Every baby-scoped cache must be invalidated when the active context changes.
// Several detail queries intentionally use a different first segment than list queries.
const CARE_QUERY_PREFIXES = [
  'records',
  'record-stats',
  'growth',
  'growth-detail',
  'growth-monthly-story',
  'milestones',
  'milestone-detail',
  'health',
  'health-detail',
  'knowledge',
  'knowledge-list',
  'knowledge-detail',
  'knowledge-search',
  'knowledge-recommendations',
  'knowledge-library',
  'knowledge-counts',
  'knowledge-state',
  'memories',
];

export default function BabyPage() {
  return <AppBootstrapGate><BabyBody /></AppBootstrapGate>;
}

function BabyBody() {
  const bootstrap = useBootstrapQuery(false);
  const queryClient = useQueryClient();
  const familyId = useFamilyRuntimeStore((state) => state.familyId) ?? bootstrap.data?.currentFamily?.id;
  const babyId = useFamilyRuntimeStore((state) => state.babyId) ?? bootstrap.data?.currentBaby?.id;
  const setBabyId = useFamilyRuntimeStore((state) => state.setBabyId);
  const { showToast } = useUiOverlayStore();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthday, setBirthday] = useState('');
  const [notes, setNotes] = useState('');
  const [preference, setPreference] = useState('');
  const [preferenceType, setPreferenceType] = useState<'LIKE' | 'DISLIKE'>('LIKE');
  const [saving, setSaving] = useState(false);
  const baby = bootstrap.data?.babies.find((item) => item.id === babyId) ?? bootstrap.data?.currentBaby;
  const babyItems = bootstrap.data?.babies ?? [];
  const canSwitchBaby = babyItems.length > 1;
  const preferences = useQuery({
    queryKey: ['baby-preferences', babyId],
    queryFn: () => fetchBabyPreferences(babyId!),
    enabled: Boolean(babyId),
  });
  const changes = useQuery({
    queryKey: ['baby-changes', babyId],
    queryFn: () => fetchBabyChanges(babyId!),
    enabled: Boolean(babyId),
  });

  function startEdit() {
    if (!baby) return;
    setName(baby.name);
    setNickname(baby.nickname ?? '');
    setBirthday(baby.birthday);
    setNotes(baby.notes ?? '');
    setAdding(false);
    setEditing(true);
  }

  function startAddBaby() {
    setEditing(false);
    setAdding(true);
    setName('');
    setNickname('');
    setBirthday('');
    setNotes('');
  }

  async function saveBaby() {
    if (!familyId || !name.trim() || !birthday) return showToast('请先补充宝宝姓名和生日。');
    setSaving(true);
    try {
      const body = { name: name.trim(), birthday, ...(nickname.trim() ? { nickname: nickname.trim() } : {}), notes: notes.trim() || null };
      if (editing && baby) await updateBaby(baby.id, body satisfies UpdateBabyBody, baby.version);
      else await addBaby(familyId, body satisfies CreateBabyBody);
      await queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
      setEditing(false); setAdding(false); showToast('宝宝档案已保存。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '档案还没保存好，请再试一次。');
    } finally { setSaving(false); }
  }

  async function selectBaby(id: string) {
    if (!familyId || id === babyId) return;
    setSaving(true);
    try {
      await switchBaby(familyId, id);
      setBabyId(id);
      queryClient.setQueryData(bootstrapQueryKey, (old: typeof bootstrap.data) => old ? ({ ...old, currentBaby: old.babies.find((item) => item.id === id) ?? old.currentBaby }) : old);
      await Promise.all(CARE_QUERY_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      showToast('已经切换到这位小宝贝。');
    } catch (error) { showToast(error instanceof Error ? error.message : '切换还没完成，请再试一次。'); }
    finally { setSaving(false); }
  }

  async function savePreference() {
    if (!babyId || !preference.trim()) return;
    try {
      await createBabyPreference(babyId, { type: preferenceType, label: preference.trim(), sourceType: 'MANUAL' });
      setPreference('');
      await preferences.refetch();
      showToast(preferenceType === 'LIKE' ? '小档案又多了一条喜欢。' : '小档案记下了一条不喜欢。');
    } catch (error) { showToast(error instanceof Error ? error.message : '偏好还没记下。'); }
  }

  const showEditor = editing || adding;
  return (
    <PageShell className={styles.page}>
      <AppTopBar variant="standard" title="宝宝档案" subtitle="把每一个小小的喜欢，都认真收藏" onBackClick={() => void Taro.navigateBack()} />
      <View className={`page-content ${styles.content}`}>
        <View className={styles.stack}>
          <GlassSurface level="tinted" tone="apricot" radius="hero" className={styles.hero}>
            <View className={styles.heroRow}>
              <View className={styles.avatar}><Glyph name="baby" size="lg" /></View>
              <View className={styles.heroCopy}>
                <Text className={styles.heroTitle}>{baby?.nickname || baby?.name || '小宝贝'}</Text>
                <Text className={styles.heroCaption}>{baby ? `${formatBirthdayLabel(baby.birthday)} · ${formatBabyAgeLabel(baby.birthday)}` : '从一张小档案开始'}</Text>
              </View>
            </View>
          </GlassSurface>

          <View className={styles.section}>
            <View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="family" size="sm" /></View><Text>家里的小宝贝</Text></View>
            <View className={styles.babyList}>
              {babyItems.map((item) => (
                <GlassSurface key={item.id} level="card" radius="card" interactive={canSwitchBaby} className={item.id === babyId ? `${styles.babyCard} ${styles.babyCardActive}` : styles.babyCard}>
                  <View role={canSwitchBaby ? 'button' : undefined} aria-label={canSwitchBaby ? `切换到${item.nickname || item.name}` : undefined} onClick={canSwitchBaby ? () => void selectBaby(item.id) : undefined} className={styles.babyCardHit}>
                    <View className={styles.babyDot}><Glyph name="baby" size="md" /></View>
                    <View className={styles.babyInfo}><Text className={styles.babyName}>{item.nickname || item.name}</Text><Text className={styles.babyMeta}>{formatBabyAgeLabel(item.birthday)}</Text>{canSwitchBaby && item.id === babyId ? <Text className={styles.activeTag}>正在陪伴</Text> : null}</View>
                  </View>
                </GlassSurface>
              ))}
              <GlassSurface level="card" radius="card" interactive className={styles.babyCard}>
                <View role="button" aria-label="添加宝宝" onClick={startAddBaby} className={styles.babyCardHit}>
                  <View className={styles.babyDot}><Glyph name="plus" size="md" /></View><View className={styles.babyInfo}><Text className={styles.babyName}>添加宝宝</Text><Text className={styles.babyMeta}>家里又多了一份可爱</Text></View>
                </View>
              </GlassSurface>
            </View>
          </View>

          {baby ? <GlassSurface level="card" radius="card" className={styles.formCard}>
            <View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="diary" size="sm" /></View><Text>{showEditor ? (adding ? '新增宝宝' : '编辑档案') : '档案小卡片'}</Text></View>
            {showEditor ? <><View className={styles.formGrid}><GlassInput label="名字" value={name} placeholder="例如：润润" onInput={setName} /><GlassInput label="小名" value={nickname} placeholder="可选" onInput={setNickname} /></View><GlassDateField label="生日" value={birthday} onChange={setBirthday} /><GlassInput label="备注" value={notes} placeholder="留一句想说的话" onInput={setNotes} /><View className={styles.actions}><SecondaryGlassButton label="先不改了" onClick={() => { setEditing(false); setAdding(false); }} /><PrimaryActionButton label="保存档案" state={saving ? 'loading' : 'default'} onClick={() => void saveBaby()} /></View></> : <><Text className={styles.heroCaption}>{baby.notes || '还没有写下备注，今天也可以是一个好日子。'}</Text><View className={styles.actions}><PrimaryActionButton label="编辑宝宝档案" fullWidth={false} icon={<Glyph name="diary" size="sm" />} onClick={startEdit} /><SecondaryGlassButton label="添加另一位宝宝" fullWidth={false} onClick={startAddBaby} /></View></>}
          </GlassSurface> : null}

          {baby ? <View className={styles.section}><View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="heart" size="sm" /></View><Text>喜欢与不喜欢</Text></View><GlassSurface level="card" radius="card" className={styles.formCard}><View className={styles.inputRow}><GlassInput label="记下一条" value={preference} placeholder="例如：喜欢香蕉" onInput={setPreference} /><PrimaryActionButton label="添加" fullWidth={false} onClick={() => void savePreference()} /></View>{preferences.isPending ? <Skeleton lines={2} /> : preferences.isError ? <ErrorState title="偏好还没加载好" onRetry={() => void preferences.refetch()} /> : preferences.data?.items.length ? <View className={styles.prefGrid}>{preferences.data.items.map((item) => <View key={item.id} className={styles.prefCard}><View className={`${styles.prefGlyph} ${item.type === 'LIKE' ? styles.like : styles.dislike}`}><Glyph name={item.type === 'LIKE' ? 'heart' : 'close'} size="sm" /></View><Text className={styles.prefText}>{item.label}</Text></View>)}</View> : <EmptyState title="还没有喜欢或不喜欢" description="记下一条，让小档案更像他自己。" /> }<View className={styles.actions}><SecondaryGlassButton label={preferenceType === 'LIKE' ? '切换为不喜欢' : '切换为喜欢'} fullWidth={false} onClick={() => setPreferenceType(preferenceType === 'LIKE' ? 'DISLIKE' : 'LIKE')} /></View></GlassSurface></View> : null}

          {baby ? <View className={styles.section}><View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="sparkle" size="sm" /></View><Text>最近变化</Text></View>{changes.isPending ? <Skeleton lines={3} /> : changes.isError ? <ErrorState title="最近变化还没加载好" onRetry={() => void changes.refetch()} /> : changes.data?.items.length ? <View className={styles.changeList}>{changes.data.items.slice(0, 6).map((item) => <GlassSurface level="card" radius="card" key={item.id} className={styles.changeRow}><View className={styles.changeText}><Text className={styles.changeField}>{item.field}</Text><Text className={styles.changeValues}>{item.oldValue || '空'} → {item.newValue || '空'}</Text></View><Text className={styles.changeTime}>{new Date(item.changedAt).toLocaleDateString('zh-CN')}</Text></GlassSurface>)}</View> : <EmptyState title="还没有最近变化" description="下一次更新档案时，这里会留下轻轻的足迹。" />}</View> : null}
        </View>
      </View>
    </PageShell>
  );
}
