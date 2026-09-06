import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BottomSheet,
  DangerButton,
  ErrorState,
  GlassInput,
  GlassSurface,
  AppTopBar,
  PageShell,
  PrimaryActionButton,
  SecondaryGlassButton,
  Skeleton,
  TextAction,
} from '@/components';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { Glyph } from '@/components/icons/Glyph';
import {
  adminLogin,
  adminLogout,
  adminReauth,
  adjustAdminGems,
  disableAdminBackups,
  fetchAdminAuditLogs,
  fetchAdminDataStatus,
  fetchAdminSession,
  restoreAdminBackup,
  type AdminBackup,
} from '@/api/admin';
import { useFamilyRuntimeStore, useUiOverlayStore } from '@/stores/runtime';
import { AdminModuleMenu, AdminModulePanel, formatAdminSessionRemaining, type AdminModuleKey } from './AdminModules';
import styles from './index.module.scss';

type DangerRequest = {
  actionScope: 'BACKUP_RESTORE' | 'BACKUP_DISABLE';
  resourceId: string;
  title: string;
  message: string;
  backup?: AdminBackup;
};

export default function AdminPage() {
  return <AppBootstrapGate><AdminBody /></AppBootstrapGate>;
}

function AdminBody() {
  const { showToast } = useUiOverlayStore();
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const [password, setPassword] = useState('');
  const [adjustPassword, setAdjustPassword] = useState('');
  const [amount, setAmount] = useState('1');
  const [grant, setGrant] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeModule, setActiveModule] = useState<AdminModuleKey>('overview');
  const [clock, setClock] = useState(Date.now());
  const [danger, setDanger] = useState<DangerRequest | null>(null);
  const [dangerPassword, setDangerPassword] = useState('');
  const [dangerGrant, setDangerGrant] = useState<string | null>(null);
  const [dangerBusy, setDangerBusy] = useState(false);

  const session = useQuery({ queryKey: ['admin', 'session'], queryFn: fetchAdminSession, retry: false });
  const status = useQuery({ queryKey: ['admin', 'status'], queryFn: fetchAdminDataStatus, enabled: session.isSuccess });
  const audits = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => fetchAdminAuditLogs(20), enabled: session.isSuccess });

  useEffect(() => {
    if (!session.data?.expiresAt) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [session.data?.expiresAt]);

  useEffect(() => {
    if (session.data && session.data.expiresAt <= clock) void session.refetch();
  }, [clock, session.data, session]);

  async function login() {
    if (!password) {
      showToast('请输入管理员密码。');
      return;
    }
    setBusy(true);
    try {
      await adminLogin(password);
      await session.refetch();
      setPassword('');
      setActiveModule('overview');
      showToast('管理员会话已建立。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '验证没有通过，请再试一次。');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await adminLogout();
      await session.refetch();
      setActiveModule('overview');
      showToast('已退出管理模式。');
    } catch {
      showToast('退出管理模式时请再试一次。');
    }
  }

  async function requestGemGrant() {
    if (!adjustPassword || !familyId) {
      showToast('请先填写管理员密码。');
      return;
    }
    setBusy(true);
    try {
      const result = await adminReauth(adjustPassword, 'GEM_ADJUST', familyId);
      setGrant(result.token);
      setAdjustPassword('');
      showToast('危险操作已获得一次性授权。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重认证没有通过。');
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    if (!grant || !familyId) {
      showToast('请先完成重认证。');
      return;
    }
    setBusy(true);
    try {
      await adjustAdminGems(familyId, Number(amount) || 0, grant, '管理模式人工调整');
      setGrant(null);
      await Promise.all([status.refetch(), audits.refetch()]);
      showToast('宝石流水已写入。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '调整没有完成。');
    } finally {
      setBusy(false);
    }
  }

  function openDanger(request: DangerRequest) {
    setDanger(request);
    setDangerPassword('');
    setDangerGrant(null);
  }

  function closeDanger() {
    if (dangerBusy) return;
    setDanger(null);
    setDangerPassword('');
    setDangerGrant(null);
  }

  async function issueDangerGrant() {
    if (!danger || !dangerPassword) {
      showToast('请再次输入管理员密码。');
      return;
    }
    setDangerBusy(true);
    try {
      const result = await adminReauth(dangerPassword, danger.actionScope, danger.resourceId);
      setDangerGrant(result.token);
      setDangerPassword('');
      showToast('已完成二次认证，请确认影响范围。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '重认证没有通过。');
    } finally {
      setDangerBusy(false);
    }
  }

  async function executeDanger() {
    if (!danger || !dangerGrant) {
      showToast('请先完成二次认证。');
      return;
    }
    setDangerBusy(true);
    try {
      if (danger.actionScope === 'BACKUP_RESTORE' && danger.backup) {
        const result = await restoreAdminBackup(danger.backup.id, dangerGrant);
        showToast(result.restartRequired ? '恢复已进入准备阶段，服务重启后生效。' : '备份已恢复。');
      } else {
        await disableAdminBackups(dangerGrant);
        showToast('自动备份已关闭。');
      }
      setDanger(null);
      setDangerGrant(null);
      await audits.refetch();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '危险操作没有完成。');
    } finally {
      setDangerBusy(false);
    }
  }

  const authenticated = session.isSuccess && Boolean(session.data);
  const remaining = session.data ? formatAdminSessionRemaining(session.data.expiresAt, clock) : null;

  return (
    <PageShell className={styles.page}>
      <AppTopBarWithSession onBack={() => void Taro.navigateBack()} />
      <View className={`page-content ${styles.content}`}>
        <View className={styles.stack}>
          <GlassSurface level="tinted" tone="lavender" radius="hero" className={styles.hero}>
            <View className={styles.heroArt}><Glyph name="shield" size="lg" /></View>
            <View className={styles.heroCopy}>
              <Text className={styles.heroTitle}>{authenticated ? '管理员已验证' : '独立安全域'}</Text>
              <Text className={styles.heroCaption}>家庭成员身份与管理员身份分开保护，每一次重要操作都留下痕迹。</Text>
            </View>
          </GlassSurface>

          {!authenticated ? (
            <GlassSurface level="card" radius="card" className={styles.formCard}>
              <View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="lock" size="sm" /></View><Text>进入管理模式</Text></View>
              {session.isPending ? <Skeleton lines={3} /> : null}
              <GlassInput label="管理员密码" password value={password} placeholder="请输入管理员密码" onInput={setPassword} />
              <PrimaryActionButton label="验证并进入" state={busy ? 'loading' : 'default'} icon={<Glyph name="shield" size="sm" />} onClick={() => void login()} />
              <Text className={styles.hint}>管理员会话约 30 分钟，到期后需要重新验证。</Text>
            </GlassSurface>
          ) : (
            <>
              <GlassSurface level="card" radius="card" className={styles.sessionBar}>
                <View className={styles.sessionCopy}><Text className={styles.sessionTitle}>管理会话有效</Text><Text className={styles.sessionHint}>剩余 {remaining}</Text></View>
                <TextAction label="退出管理模式" onClick={() => void logout()} />
              </GlassSurface>
              {activeModule === 'overview' ? (
                <>
                  <GlassSurface level="card" radius="card" className={styles.panel}>
                    <View className={styles.statusRow}><Text className={styles.sectionTitle}>数据中心</Text><Text className={styles.statusValue}>{status.isError ? '暂时不可用' : status.data?.status === 'ok' ? '运行正常' : '读取中'}</Text></View>
                    {status.isError ? <ErrorState onRetry={() => void status.refetch()} /> : status.isPending ? <Skeleton lines={2} /> : <Text className={styles.muted}>{status.data ? `已接入 ${Object.keys(status.data.counts).length} 个核心数据表` : '正在读取系统概况…'}</Text>}
                  </GlassSurface>
                  <View className={styles.moduleIntro}><Text className={styles.sectionTitle}>管理工作台</Text><Text className={styles.muted}>点开一个模块查看真实数据与操作入口。</Text></View>
                  <AdminModuleMenu active={activeModule} onSelect={setActiveModule} />
                  <GlassSurface level="card" radius="card" className={styles.formCard}>
                    <View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="gem" size="sm" /></View><Text>人工调整宝石</Text></View>
                    <Text className={styles.hint}>危险操作需要管理员重认证、一次性授权和最终确认。授权只绑定当前家庭。</Text>
                    <GlassInput label="重认证密码" password value={adjustPassword} placeholder="再次输入管理员密码" onInput={setAdjustPassword} />
                    <GlassInput label="数量（可正可负）" type="number" value={amount} onInput={setAmount} />
                    {grant ? <PrimaryActionButton label="确认写入流水" state={busy ? 'loading' : 'default'} icon={<Glyph name="sparkle" size="sm" />} onClick={() => void adjust()} /> : <SecondaryGlassButton label="获取一次性授权" state={busy ? 'loading' : 'default'} onClick={() => void requestGemGrant()} />}
                  </GlassSurface>
                  <GlassSurface level="card" radius="card" className={styles.panel}>
                    <View className={styles.sectionTitle}><View className={styles.mark}><Glyph name="file" size="sm" /></View><Text>最近审计</Text></View>
                    {audits.isPending ? <Skeleton lines={3} /> : audits.isError ? <ErrorState onRetry={() => void audits.refetch()} /> : <View className={styles.auditList}>{(audits.data?.items ?? []).slice(0, 8).map((item) => <View className={styles.auditRow} key={item.id}><Text className={styles.auditAction}>{item.action} · {item.result}</Text><Text className={styles.auditTime}>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</Text></View>)}</View>}
                    {!audits.isPending && !audits.isError && audits.data?.items.length === 0 ? <Text className={styles.muted}>每一次管理员动作都会在这里留下简洁记录。</Text> : null}
                  </GlassSurface>
                </>
              ) : (
                <>
                  <View className={styles.detailHeader}><TextAction label="返回管理菜单" onClick={() => setActiveModule('overview')} /><Text className={styles.detailTitle}>{activeModuleLabel(activeModule)}</Text></View>
                  <AdminModulePanel
                    active={activeModule}
                    familyId={familyId}
                    onOpenGemAdjustment={() => setActiveModule('overview')}
                    onCreateBackup={async () => {
                      try { const { createAdminBackup } = await import('@/api/admin'); await createAdminBackup(); showToast('备份任务已开始。'); } catch { showToast('备份还没开始，请稍后再试。'); }
                    }}
                    onRestoreBackup={(backup) => openDanger({ actionScope: 'BACKUP_RESTORE', resourceId: backup.id, title: '恢复历史备份', message: '恢复会把当前数据库替换为这份已校验快照，并可能需要服务重启。', backup })}
                    onDisableBackup={() => openDanger({ actionScope: 'BACKUP_DISABLE', resourceId: 'backup_enabled', title: '关闭自动备份', message: '关闭后系统不再自动生成备份，已有备份不会被删除。' })}
                  />
                </>
              )}
            </>
          )}
        </View>
      </View>
      <BottomSheet open={Boolean(danger)} title={danger?.title ?? '危险操作'} onClose={closeDanger}>
        {danger ? <View className={styles.dangerFlow}>
          <Text className={styles.dangerMessage}>{danger.message}</Text>
          <Text className={styles.dangerHint}>流程：二次认证 → 单次授权 → 最终确认 → 留下审计记录。</Text>
          {!dangerGrant ? <><GlassInput label="管理员密码" password value={dangerPassword} placeholder="再次输入管理员密码" onInput={setDangerPassword} /><PrimaryActionButton label="开始二次认证" state={dangerBusy ? 'loading' : 'default'} icon={<Glyph name="lock" size="sm" />} onClick={() => void issueDangerGrant()} /></> : <><GlassSurface level="tinted" tone="blush" radius="card" className={styles.confirmSurface}><Text className={styles.confirmTitle}>请确认影响范围</Text><Text className={styles.confirmText}>{danger.message}</Text></GlassSurface><DangerButton label="确认并执行" state={dangerBusy ? 'loading' : 'default'} onClick={() => void executeDanger()} /><SecondaryGlassButton label="先不执行" onClick={closeDanger} /></>}
        </View> : null}
      </BottomSheet>
    </PageShell>
  );
}

function activeModuleLabel(active: AdminModuleKey) {
  if (active === 'overview') return '管理工作台';
  return ({ gems: '宝石与流水', rules: '宝石规则', rewards: '商城奖励', knowledge: '育儿知识库', content: '内容管理', members: '家庭成员', data: '数据与备份', system: '系统设置', audit: '操作日志' } as Record<Exclude<AdminModuleKey, 'overview'>, string>)[active];
}

function AppTopBarWithSession({ onBack }: { onBack: () => void }) {
  return <AppTopBar variant="admin" title="管理模式" subtitle="守护家庭数据的另一把钥匙" onBackClick={onBack} />;
}
