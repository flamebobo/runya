import { View } from '@tarojs/components';
import {
  AppTopBar,
  BottomNav,
  ConfirmDialog,
  DangerButton,
  EmptyState,
  ErrorState,
  FilterChip,
  GlassInput,
  GlassSurface,
  GlassTextArea,
  PageShell,
  PrimaryActionButton,
  SecondaryGlassButton,
  SectionHeader,
  SegmentedControl,
  Skeleton,
} from '@/components';
import { useState } from 'react';
import styles from './index.module.scss';

export default function DesignSystemPage() {
  const [segment, setSegment] = useState<'apricot' | 'sage'>('apricot');
  const [dialogOpen, setDialogOpen] = useState(false);

  if (process.env.NODE_ENV === 'production') {
    return (
      <PageShell>
        <EmptyState title="此页面仅开发环境可用" />
      </PageShell>
    );
  }

  return (
    <PageShell bottomNav>
      <AppTopBar variant="standard" title="Design System" onBackClick={() => undefined} />
      <View className={`page-content ${styles.page}`}>
        <SectionHeader title="Foundation" caption="Warm Glass + Cute Accent" />
        <GlassSurface level="card" className={styles.block}>
          Glass Card
        </GlassSurface>
        <GlassSurface level="hero" tone="sky" className={styles.block}>
          Glass Hero
        </GlassSurface>
        <SectionHeader title="Buttons" />
        <PrimaryActionButton label="Primary Apricot" tone="apricot" />
        <PrimaryActionButton label="Loading" state="loading" tone="sage" />
        <PrimaryActionButton label="Disabled" state="disabled" tone="lavender" />
        <SecondaryGlassButton label="Secondary" />
        <DangerButton label="Danger" />
        <SectionHeader title="Forms" />
        <GlassInput label="账号" placeholder="妈妈" />
        <GlassTextArea label="备注" placeholder="写下今天的小事" />
        <SegmentedControl
          options={[
            { value: 'apricot', label: 'Apricot' },
            { value: 'sage', label: 'Sage' },
          ]}
          value={segment}
          onChange={setSegment}
        />
        <View className={styles.chips}>
          <FilterChip label="默认" />
          <FilterChip label="选中" selected />
        </View>
        <Skeleton lines={4} />
        <ErrorState onRetry={() => undefined} />
        <SecondaryGlassButton label="打开确认 Dialog" onClick={() => setDialogOpen(true)} />
      </View>
      <BottomNav active="today" />
      <ConfirmDialog
        open={dialogOpen}
        title="确认示例"
        message="这是一个 M0 设计系统 Dialog 示例。"
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => setDialogOpen(false)}
      />
    </PageShell>
  );
}
