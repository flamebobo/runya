import { Text, View } from '@tarojs/components';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, GlassSurface, PrimaryActionButton, SecondaryGlassButton, Skeleton, TextAction } from '@/components';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import {
  fetchAdminAuditLogs,
  fetchAdminBackups,
  fetchAdminGemBalance,
  fetchAdminGemRules,
  fetchAdminGemTransactions,
  fetchAdminKnowledge,
  fetchAdminMembers,
  fetchAdminRewards,
  fetchAdminSystemApp,
  fetchAdminSystemDatabase,
  fetchAdminSystemMedia,
  fetchAdminSystemSettings,
  fetchAdminSystemTunnel,
  verifyAdminBackup,
  type AdminBackup,
} from '@/api/admin';
import styles from './modules.module.scss';

export type AdminModuleKey =
  | 'overview'
  | 'gems'
  | 'rules'
  | 'rewards'
  | 'knowledge'
  | 'content'
  | 'members'
  | 'data'
  | 'system'
  | 'audit';

export const ADMIN_MODULES: Array<{ key: AdminModuleKey; label: string; caption: string; glyph: GlyphName }> = [
  { key: 'gems', label: '宝石与流水', caption: '余额、流水、人工调整', glyph: 'gem' },
  { key: 'rules', label: '宝石规则', caption: '奖励规则与日限额', glyph: 'sparkle' },
  { key: 'rewards', label: '商城奖励', caption: '愿望、价格、上下架', glyph: 'heart' },
  { key: 'knowledge', label: '育儿知识库', caption: '发布状态与版本', glyph: 'book' },
  { key: 'content', label: '内容管理', caption: '全局内容索引', glyph: 'diary' },
  { key: 'members', label: '家庭成员', caption: '成员状态与权限', glyph: 'family' },
  { key: 'data', label: '数据与备份', caption: '备份、校验、导出', glyph: 'shield' },
  { key: 'system', label: '系统设置', caption: '运行环境与开关', glyph: 'settings' },
  { key: 'audit', label: '操作日志', caption: '可追溯的安全记录', glyph: 'file' },
];

export function formatAdminSessionRemaining(expiresAt: number, now = Date.now()) {
  const remaining = Math.max(0, expiresAt - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AdminModuleMenu({ active, onSelect }: { active: AdminModuleKey; onSelect: (key: AdminModuleKey) => void }) {
  return (
    <View className={styles.menu}>
      {ADMIN_MODULES.map((item) => (
        <GlassSurface
          key={item.key}
          level="card"
          radius="card"
          interactive
          onClick={() => onSelect(item.key)}
          className={active === item.key ? `${styles.menuItem} ${styles.menuItemActive}` : styles.menuItem}
        >
          <View className={styles.menuIcon}><Glyph name={item.glyph} size="md" /></View>
          <View className={styles.menuCopy}>
            <Text className={styles.menuLabel}>{item.label}</Text>
            <Text className={styles.menuCaption}>{item.caption}</Text>
          </View>
          <Glyph name="chevron" size="sm" />
        </GlassSurface>
      ))}
    </View>
  );
}

interface AdminModulePanelProps {
  active: Exclude<AdminModuleKey, 'overview'>;
  familyId: string | null;
  onOpenGemAdjustment: () => void;
  onCreateBackup: () => Promise<void>;
  onRestoreBackup: (backup: AdminBackup) => void;
  onDisableBackup: () => void;
}

function QueryState({
  loading,
  error,
  empty,
  retry,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  retry: () => void;
  children: React.ReactNode;
}) {
  if (loading) return <GlassSurface level="card" radius="card" className={styles.stateCard}><Skeleton lines={4} /></GlassSurface>;
  if (error) return <GlassSurface level="card" radius="card" className={styles.stateCard}><ErrorState onRetry={retry} /></GlassSurface>;
  if (empty) return <GlassSurface level="card" radius="card" className={styles.stateCard}><EmptyState title="这里还没有内容" description="数据出现后，会在这里清楚地呈现。" /></GlassSurface>;
  return <>{children}</>;
}

function dateLabel(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '尚未记录';
}

function numberLabel(value: number | null | undefined) {
  if (value == null) return '未设置';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function AdminModulePanel({ active, familyId, onOpenGemAdjustment, onCreateBackup, onRestoreBackup, onDisableBackup }: AdminModulePanelProps) {
  const balance = useQuery({ queryKey: ['admin', 'gems', familyId], queryFn: () => fetchAdminGemBalance(familyId!), enabled: active === 'gems' && Boolean(familyId) });
  const transactions = useQuery({ queryKey: ['admin', 'gem-transactions', familyId], queryFn: () => fetchAdminGemTransactions(familyId!), enabled: active === 'gems' && Boolean(familyId) });
  const rules = useQuery({ queryKey: ['admin', 'rules'], queryFn: () => fetchAdminGemRules(), enabled: active === 'rules' });
  const rewards = useQuery({ queryKey: ['admin', 'rewards'], queryFn: () => fetchAdminRewards(familyId ?? undefined), enabled: active === 'rewards' });
  const knowledge = useQuery({ queryKey: ['admin', 'knowledge', active], queryFn: () => fetchAdminKnowledge(), enabled: active === 'knowledge' || active === 'content' });
  const members = useQuery({ queryKey: ['admin', 'members', familyId], queryFn: () => fetchAdminMembers(familyId!), enabled: active === 'members' && Boolean(familyId) });
  const dataStatus = useQuery({ queryKey: ['admin', 'status'], queryFn: async () => (await import('@/api/admin')).fetchAdminDataStatus(), enabled: active === 'data' });
  const backups = useQuery({ queryKey: ['admin', 'backups'], queryFn: fetchAdminBackups, enabled: active === 'data' });
  const audits = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => fetchAdminAuditLogs(50), enabled: active === 'audit' });
  const system = useQuery({
    queryKey: ['admin', 'system'],
    queryFn: async () => {
      const [app, database, media, tunnel, settings] = await Promise.all([
        fetchAdminSystemApp(),
        fetchAdminSystemDatabase(),
        fetchAdminSystemMedia(),
        fetchAdminSystemTunnel(),
        fetchAdminSystemSettings(),
      ]);
      return { app, database, media, tunnel, settings };
    },
    enabled: active === 'system',
  });

  if (active === 'gems') {
    const loading = balance.isPending || transactions.isPending;
    const error = balance.isError || transactions.isError;
    return <QueryState loading={loading} error={error} empty={!loading && !error && !balance.data} retry={() => { void balance.refetch(); void transactions.refetch(); }}>
      <View className={styles.panelStack}>
        <View className={styles.metricGrid}>
          <GlassSurface level="tinted" tone="apricot" radius="card" className={styles.metric}><Text className={styles.metricLabel}>当前余额</Text><Text className={styles.metricValue}>{numberLabel(balance.data?.balance)}</Text><Text className={styles.metricHint}>家庭宝石</Text></GlassSurface>
          <GlassSurface level="tinted" tone={balance.data?.drifted ? 'blush' : 'sage'} radius="card" className={styles.metric}><Text className={styles.metricLabel}>账本校验</Text><Text className={styles.metricValue}>{balance.data?.drifted ? '有差异' : '一致'}</Text><Text className={styles.metricHint}>Ledger {numberLabel(balance.data?.ledgerBalance)}</Text></GlassSurface>
        </View>
        <GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>人工调整</Text><Text className={styles.panelHint}>每次调整都会留下不可变流水</Text></View><PrimaryActionButton label="打开重认证流程" icon={<Glyph name="lock" size="sm" />} onClick={onOpenGemAdjustment} /></GlassSurface>
        <GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>最近流水</Text><Text className={styles.panelHint}>{transactions.data?.items.length ?? 0} 条</Text></View>{(transactions.data?.items ?? []).slice(0, 12).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.amount > 0 ? '+' : ''}{item.amount} 宝石</Text><Text className={styles.rowHint}>{item.reasonCode} · {dateLabel(item.createdAt)}</Text></View><Text className={item.amount > 0 ? styles.positive : styles.negative}>{numberLabel(item.balanceAfter)}</Text></View>)}</GlassSurface>
      </View>
    </QueryState>;
  }

  if (active === 'rules') {
    return <QueryState loading={rules.isPending} error={rules.isError} empty={!rules.isPending && !rules.isError && (rules.data?.items.length ?? 0) === 0} retry={() => void rules.refetch()}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>奖励规则</Text><Text className={styles.panelHint}>全局规则与家庭规则</Text></View>{(rules.data?.items ?? []).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.actionType}</Text><Text className={styles.rowHint}>{item.familyId ? '家庭专属' : '全局'} · 每次 {item.amount} · 日限额 {item.dailyLimit ?? '不限'}</Text></View><Text className={item.enabled ? styles.positive : styles.muted}>{item.enabled ? '启用' : '停用'}</Text></View>)}</GlassSurface></QueryState>;
  }

  if (active === 'rewards') {
    return <QueryState loading={rewards.isPending} error={rewards.isError} empty={!rewards.isPending && !rewards.isError && (rewards.data?.items.length ?? 0) === 0} retry={() => void rewards.refetch()}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>商城奖励</Text><Text className={styles.panelHint}>只展示当前家庭可见愿望</Text></View>{(rewards.data?.items ?? []).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.name}</Text><Text className={styles.rowHint}>{item.description || '还没有写下说明'} · {item.priceGems} 宝石</Text></View><Text className={item.status === 'ACTIVE' ? styles.positive : styles.muted}>{item.status === 'ACTIVE' ? '上架' : '下架'}</Text></View>)}</GlassSurface></QueryState>;
  }

  if (active === 'knowledge' || active === 'content') {
    return <QueryState loading={knowledge.isPending} error={knowledge.isError} empty={!knowledge.isPending && !knowledge.isError && (knowledge.data?.items.length ?? 0) === 0} retry={() => void knowledge.refetch()}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>{active === 'knowledge' ? '育儿知识库' : '内容管理'}</Text><Text className={styles.panelHint}>正文列表默认不在日志快照中</Text></View>{(knowledge.data?.items ?? []).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.title}</Text><Text className={styles.rowHint}>{item.category} · v{item.contentVersion}</Text></View><Text className={item.status === 'PUBLISHED' ? styles.positive : styles.muted}>{item.status}</Text></View>)}</GlassSurface></QueryState>;
  }

  if (active === 'members') {
    return <QueryState loading={members.isPending} error={members.isError} empty={!members.isPending && !members.isError && (members.data?.items.length ?? 0) === 0} retry={() => void members.refetch()}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>家庭成员</Text><Text className={styles.panelHint}>管理员操作仍需独立授权</Text></View>{(members.data?.items ?? []).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.nickname || '未命名成员'}</Text><Text className={styles.rowHint}>{item.role} · 加入于 {dateLabel(item.createdAt)}</Text></View><Text className={item.status === 'ACTIVE' ? styles.positive : styles.muted}>{item.status === 'ACTIVE' ? '正常' : '已停用'}</Text></View>)}</GlassSurface></QueryState>;
  }

  if (active === 'data') {
    return <QueryState loading={dataStatus.isPending || backups.isPending} error={dataStatus.isError || backups.isError} empty={false} retry={() => { void dataStatus.refetch(); void backups.refetch(); }}><View className={styles.panelStack}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>数据中心</Text><Text className={styles.positive}>{dataStatus.data?.status === 'ok' ? '运行正常' : '读取中'}</Text></View><View className={styles.countGrid}>{Object.entries(dataStatus.data?.counts ?? {}).map(([key, value]) => <View className={styles.countItem} key={key}><Text className={styles.countValue}>{numberLabel(value)}</Text><Text className={styles.countLabel}>{key}</Text></View>)}</View></GlassSurface><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>备份历史</Text><SecondaryGlassButton label="立即备份" fullWidth={false} onClick={() => void onCreateBackup()} /></View>{(backups.data?.items ?? []).map((item) => <View className={styles.dataRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.status}</Text><Text className={styles.rowHint}>{dateLabel(item.startedAt)} · {item.bytes ? `${numberLabel(item.bytes)} bytes` : '等待校验'}</Text></View><View className={styles.rowActions}>{item.status === 'READY' ? <><TextAction label="校验" onClick={() => void verifyAdminBackup(item.id).then(() => void backups.refetch())} /><TextAction label="恢复" onClick={() => onRestoreBackup(item)} /></> : <Text className={styles.muted}>不可恢复</Text>}</View></View>)}</GlassSurface><GlassSurface level="tinted" tone="blush" radius="card" className={styles.dangerCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>危险操作</Text><Glyph name="shield" size="sm" /></View><Text className={styles.rowHint}>恢复备份、删除媒体和关闭备份都必须经过二次认证与最终确认。</Text><SecondaryGlassButton label="关闭自动备份" onClick={onDisableBackup} /></GlassSurface></View></QueryState>;
  }

  if (active === 'system') {
    return <QueryState loading={system.isPending} error={system.isError} empty={false} retry={() => void system.refetch()}><View className={styles.panelStack}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>运行环境</Text><Text className={styles.positive}>{system.data?.app.version}</Text></View><View className={styles.dataRow}><Text className={styles.rowTitle}>Node 环境</Text><Text className={styles.rowHint}>{system.data?.app.nodeEnv}</Text></View><View className={styles.dataRow}><Text className={styles.rowTitle}>数据库</Text><Text className={styles.rowHint}>{system.data?.database.journalMode} · FK {system.data?.database.foreignKeys ? 'ON' : 'OFF'}</Text></View><View className={styles.dataRow}><Text className={styles.rowTitle}>媒体 / Tunnel</Text><Text className={styles.rowHint}>{system.data?.media.configured ? '媒体已配置' : '媒体待配置'} · {system.data?.tunnel.configured ? 'Tunnel 已配置' : 'Tunnel 待配置'}</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>系统设置</Text><Text className={styles.panelHint}>{system.data?.settings.items.length ?? 0} 项</Text></View>{(system.data?.settings.items ?? []).map((item) => <View className={styles.dataRow} key={item.key}><Text className={styles.rowTitle}>{item.key}</Text><Text className={styles.rowHint}>{String(item.value)}</Text></View>)}</GlassSurface></View></QueryState>;
  }

  return <QueryState loading={audits.isPending} error={audits.isError} empty={!audits.isPending && !audits.isError && (audits.data?.items.length ?? 0) === 0} retry={() => void audits.refetch()}><GlassSurface level="card" radius="card" className={styles.panelCard}><View className={styles.panelHeading}><Text className={styles.panelTitle}>操作日志</Text><Text className={styles.panelHint}>敏感正文已自动脱敏</Text></View>{(audits.data?.items ?? []).map((item) => <View className={styles.auditRow} key={item.id}><View className={styles.rowCopy}><Text className={styles.rowTitle}>{item.action}</Text><Text className={styles.rowHint}>{item.resourceType}{item.resourceId ? ` · ${item.resourceId}` : ''} · {dateLabel(item.createdAt)}</Text></View><Text className={item.result === 'SUCCESS' ? styles.positive : styles.negative}>{item.result === 'SUCCESS' ? '完成' : '失败'}</Text></View>)}</GlassSurface></QueryState>;
}
