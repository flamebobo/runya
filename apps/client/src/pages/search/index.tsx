import { Input, Text, View } from '@tarojs/components';
import { useState } from 'react';
import Taro from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { AppTopBar, EmptyState, ErrorState, GlassSurface, PageShell, Skeleton } from '@/components';
import { Glyph } from '@/components/icons/Glyph';
import { searchDocuments } from '@/api/m11';
import { useFamilyRuntimeStore } from '@/stores/runtime';
import styles from './index.module.scss';

function resultUrl(entityType: string, entityId: string) {
  const id = encodeURIComponent(entityId);
  switch (entityType) {
    case 'FEEDING_RECORD':
      return `/pages/records/detail/index?kind=FEEDING&id=${id}`;
    case 'SLEEP_RECORD':
      return `/pages/records/detail/index?kind=SLEEP&id=${id}`;
    case 'DIAPER_RECORD':
      return `/pages/records/detail/index?kind=DIAPER&id=${id}`;
    case 'FOOD_RECORD':
      return `/pages/records/detail/index?kind=FOOD&id=${id}`;
    case 'GROWTH_RECORD':
      return `/pages/growth/index?view=detail&id=${id}`;
    case 'MILESTONE':
      return `/pages/growth/index?view=milestone-detail&id=${id}`;
    case 'HEALTH_EVENT':
      return `/pages/health/index?view=detail&id=${id}`;
    case 'KNOWLEDGE':
      return `/pages/knowledge/index?view=detail&id=${id}`;
    case 'DIARY':
      return `/pages/mom/index?view=diary-detail&id=${id}`;
    case 'MOOD':
      return '/pages/mom/index?view=mood-calendar';
    case 'PHOTO_MEMORY':
      return `/pages/memories/index?tab=photos&id=${id}`;
    case 'AUDIO_MEMORY':
      return `/pages/memories/index?tab=audios&id=${id}`;
    case 'BABY_QUOTE':
      return `/pages/memories/index?tab=quotes&id=${id}`;
    case 'FIRST_MOMENT':
      return `/pages/memories/index?tab=firsts&id=${id}`;
    case 'TIME_CAPSULE':
      return `/pages/memories/index?tab=capsules&id=${id}`;
    default:
      return '/pages/memories/index';
  }
}

export default function SearchPage() {
  return <AppBootstrapGate><SearchBody /></AppBootstrapGate>;
}

function SearchBody() {
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const [value, setValue] = useState('');
  const [term, setTerm] = useState('');
  const query = useQuery({
    queryKey: ['search', familyId, term],
    queryFn: () => searchDocuments(term, familyId ?? undefined),
    enabled: term.trim().length > 0,
  });
  function submit() { const next = value.trim(); if (next) setTerm(next); }
  return (
    <PageShell className={styles.page}>
      <AppTopBar variant="standard" title="全家搜索" subtitle="把想找的那一页，轻轻找回来" onBackClick={() => void Taro.navigateBack()} />
      <View className={`page-content ${styles.content}`}>
        <View className={styles.stack}>
          <GlassSurface level="tinted" tone="sky" radius="hero" className={styles.hero}><View className={styles.heroArt}><Glyph name="search" size="lg" /></View><View className={styles.heroCopy}><Text className={styles.heroTitle}>记忆在这里等你</Text><Text className={styles.heroCaption}>记录、成长、知识和回忆，都会一起被找到。</Text></View></GlassSurface>
          <GlassSurface level="control" radius="hero" className={styles.searchBar}><Input className={styles.searchInput} value={value} placeholder="搜索润润的每一个小故事" confirmType="search" onInput={(event) => setValue(event.detail.value)} onConfirm={submit} /><View className={styles.searchButton} role="button" aria-label="开始搜索" onClick={submit}><Glyph name="search" size="md" /></View></GlassSurface>
          {query.isPending ? <GlassSurface level="card" radius="card" className={styles.empty}><Skeleton lines={3} /></GlassSurface> : null}
          {query.isError ? <ErrorState title="这次没有找好" description="稍后再试，已有记录不会受到影响。" onRetry={() => void query.refetch()} /> : null}
          {query.data ? <><View className={styles.resultHeader}><Text className={styles.resultTitle}>搜索结果</Text><Text className={styles.resultCount}>{query.data.items.length} 条</Text></View><View className={styles.results}>{query.data.items.map((item) => <GlassSurface level="card" radius="card" interactive key={`${item.entityType}-${item.entityId}`} className={styles.result} onClick={() => void Taro.navigateTo({ url: resultUrl(item.entityType, item.entityId) })}><View className={styles.resultMark}><Glyph name={item.entityType === 'KNOWLEDGE' ? 'book' : item.entityType === 'AUDIO_MEMORY' ? 'mic' : item.entityType === 'PHOTO_MEMORY' ? 'photo' : 'diary'} size="sm" /></View><View className={styles.resultCopy}><Text className={styles.resultTitleText}>{item.title || '未命名的记录'}</Text><Text className={styles.snippet}>{item.snippet || '这条记录已被好好保存。'}</Text><Text className={styles.meta}>{item.entityType} · {item.occurredAt ? new Date(item.occurredAt).toLocaleDateString('zh-CN') : '润芽档案'}</Text></View><Glyph name="chevron" size="sm" /></GlassSurface>)}</View>{query.data.items.length === 0 ? <EmptyState title="还没有找到相似的故事" description="换一个词试试，或者从宝宝档案开始记录。" /> : null}</> : <GlassSurface level="card" radius="card" className={styles.empty}><Text>输入一个词，找回属于你们家的那一刻。</Text></GlassSurface>}
        </View>
      </View>
    </PageShell>
  );
}
