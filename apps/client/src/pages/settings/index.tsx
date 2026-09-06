import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ExportJob, TrashItem, UpdateNotificationPreferencesBody, UserSettings } from '@runew/contracts';
import { AppTopBar, DangerButton, ErrorState, GlassInput, GlassSurface, PageShell, PrimaryActionButton, Skeleton, SegmentedControl, SecondaryGlassButton, TextAction } from '@/components';
import {
  DndSettingsView,
  NotificationSettingsView,
  type NotificationPreferenceKey,
} from '@/components/settings/SettingsViews';
import { Glyph } from '@/components/icons/Glyph';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotifications';
import { useAuthRuntimeStore, useFamilyRuntimeStore, useThemeStore, useUiOverlayStore } from '@/stores/runtime';
import { changePassword, createExport, downloadExport, fetchAbout, fetchAccount, fetchBackupHistory, fetchBackupStatus, fetchDevices, fetchExports, fetchPrivacy, fetchStorage, fetchTrash, fetchUserSettings, restoreTrash, revokeDevice, updateAccount, updatePrivacy, updateUserSettings } from '@/api/m11';
import { logoutUser } from '@/api/auth';
import styles from './index.module.scss';

type SettingsView = 'home' | 'notifications' | 'dnd' | 'appearance' | 'data' | 'account' | 'password' | 'devices' | 'privacy' | 'backup' | 'about';

function settingsView(value: string | undefined): SettingsView {
  return value === 'notifications' || value === 'dnd' || value === 'appearance' || value === 'data' || value === 'account' || value === 'password' || value === 'devices' || value === 'privacy' || value === 'backup' || value === 'about' ? value : 'home';
}

export default function SettingsPage() {
  return (
    <AppBootstrapGate>
      <SettingsBody />
    </AppBootstrapGate>
  );
}

function SettingsBody() {
  const router = useRouter();
  const view = settingsView(router.params.view);
  const query = useNotificationPreferencesQuery();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchUserSettings });
  const trashQuery = useQuery({ queryKey: ['trash'], queryFn: () => fetchTrash(), enabled: view === 'data' });
  const exportsQuery = useQuery({ queryKey: ['exports'], queryFn: () => fetchExports(), enabled: view === 'data' });
  const accountQuery = useQuery({ queryKey: ['settings', 'account'], queryFn: fetchAccount, enabled: view === 'account' });
  const devicesQuery = useQuery({ queryKey: ['settings', 'devices'], queryFn: fetchDevices, enabled: view === 'devices' });
  const privacyQuery = useQuery({ queryKey: ['settings', 'privacy'], queryFn: fetchPrivacy, enabled: view === 'privacy' });
  const backupStatusQuery = useQuery({ queryKey: ['settings', 'backup-status'], queryFn: fetchBackupStatus, enabled: view === 'backup' || view === 'data' });
  const backupHistoryQuery = useQuery({ queryKey: ['settings', 'backup-history'], queryFn: fetchBackupHistory, enabled: view === 'backup' || view === 'data' });
  const storageQuery = useQuery({ queryKey: ['settings', 'storage'], queryFn: fetchStorage, enabled: view === 'backup' || view === 'data' });
  const aboutQuery = useQuery({ queryKey: ['settings', 'about'], queryFn: fetchAbout, enabled: view === 'about' });
  const update = useUpdateNotificationPreferences();
  const { showToast } = useUiOverlayStore();
  const setUserId = useAuthRuntimeStore((state) => state.setUserId);
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [accountNickname, setAccountNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [privacy, setPrivacy] = useState<UserSettings['privacy'] | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<string | null>(null);

  function returnToPrevious() {
    void Promise.resolve(Taro.navigateBack({ delta: 1 })).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' }),
    );
  }

  function open(nextView: Exclude<SettingsView, 'home'>) {
    void Taro.navigateTo({ url: `/pages/settings/index?view=${nextView}` });
  }

  useEffect(() => {
    if (accountQuery.data) setAccountNickname(accountQuery.data.nickname);
  }, [accountQuery.data]);

  useEffect(() => {
    if (privacyQuery.data) setPrivacy(privacyQuery.data);
  }, [privacyQuery.data]);

  useEffect(() => {
    const hasPendingExport = exportsQuery.data?.items.some(
      (item) => item.state === 'QUEUED' || item.state === 'RUNNING',
    );
    if (view !== 'data' || !hasPendingExport) return;
    const timer = setInterval(() => void exportsQuery.refetch(), 2500);
    return () => clearInterval(timer);
  }, [exportsQuery, view, exportsQuery.data?.items]);

  async function changeAppearance(value: 'SYSTEM' | 'LIGHT' | 'NIGHT') {
    try {
      await updateUserSettings({ appearance: value });
      setTheme(value === 'NIGHT' ? 'night' : 'day');
      showToast('外观设置已保存。');
      await settingsQuery.refetch();
    } catch { showToast('外观还没保存好，请再试一次。'); }
  }

  async function startExport(type: 'CSV' | 'GROWTH_REPORT' | 'PHOTO_AUDIO_ARCHIVE' | 'MEMORY_ARCHIVE' | 'ANNUAL_REVIEW') {
    try {
      if (!familyId) throw new Error('还没有选中的家庭');
      await createExport(familyId, type);
      await exportsQuery.refetch();
      showToast('导出任务已排队。');
    } catch { showToast('导出任务还没创建好，请稍后再试。'); }
  }

  async function restore(item: { entityType: string; entityId: string }) {
    try { await restoreTrash(item.entityType, item.entityId); await trashQuery.refetch(); showToast('已放回原来的位置。'); }
    catch { showToast('这条内容还没恢复好，请再试一次。'); }
  }

  async function download(job: Pick<ExportJob, 'id' | 'type'>) {
    setDownloadingExportId(job.id);
    try {
      await downloadExport(job);
      showToast('导出文件已开始下载。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件还没下载好，请稍后再试。');
    } finally {
      setDownloadingExportId(null);
    }
  }

  async function saveAccount() {
    if (!accountNickname.trim()) return showToast('昵称还不能是空的。');
    setSavingAccount(true);
    try {
      await updateAccount({ nickname: accountNickname.trim() });
      await accountQuery.refetch();
      showToast('账户信息已保存。');
    } catch { showToast('账户信息还没保存好，请再试一次。'); }
    finally { setSavingAccount(false); }
  }

  async function savePassword() {
    if (!currentPassword || newPassword.length < 8) return showToast('新密码至少需要 8 位。');
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword('');
      showToast('密码已更新，请用新密码登录。');
    } catch { showToast('当前密码不正确，或新密码还不符合要求。'); }
    finally { setSavingPassword(false); }
  }

  async function savePrivacy() {
    if (!privacy) return;
    setSavingPrivacy(true);
    try {
      await updatePrivacy(privacy);
      await privacyQuery.refetch();
      showToast('隐私偏好已保存。');
    } catch { showToast('隐私设置还没保存好，请再试一次。'); }
    finally { setSavingPrivacy(false); }
  }

  async function logout() {
    try {
      await logoutUser();
      setUserId(null);
      await Taro.reLaunch({ url: '/pages/auth/login/index' });
    } catch { showToast('退出登录还没完成，请再试一次。'); }
  }

  async function togglePreference(key: NotificationPreferenceKey, value: boolean) {
    const body = { [key]: value } as UpdateNotificationPreferencesBody;
    try {
      await update.mutateAsync(body);
      showToast('通知偏好已保存。');
    } catch {
      showToast('设置还没保存好，请再试一次。');
    }
  }

  async function saveDnd(body: UpdateNotificationPreferencesBody) {
    try {
      await update.mutateAsync(body);
      showToast('免打扰时间已保存。');
    } catch {
      showToast('免打扰设置还没保存好，请再试一次。');
    }
  }

  function homeView() {
    return (
      <View className={styles.homeStack}>
        <GlassSurface
          level="tinted"
          tone="apricot"
          radius="hero"
          className={styles.homeHero}
        >
          <View className={styles.homeArt} aria-hidden>
            <Glyph name="settings" size="lg" />
          </View>
          <View className={styles.homeCopy}>
            <Text className={styles.homeTitle}>把润芽调成你的样子</Text>
            <Text className={styles.homeCaption}>
              通知、夜间安静时间，都可以慢慢调整。
            </Text>
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="账户与密码" onClick={() => open('account')}>
            <View className={styles.homeCardIcon}><Glyph name="family" size="md" /></View>
            <View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>账户与密码</Text><Text className={styles.homeCardCaption}>昵称、登录密码和账户信息</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="隐私设置" onClick={() => open('privacy')}>
            <View className={styles.homeCardIconLavender}><Glyph name="lock" size="md" /></View>
            <View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>隐私设置</Text><Text className={styles.homeCardCaption}>妈妈空间默认只属于你</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="已登录设备" onClick={() => open('devices')}>
            <View className={styles.homeCardIcon}><Glyph name="settings" size="md" /></View>
            <View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>已登录设备</Text><Text className={styles.homeCardCaption}>查看并撤销不再使用的设备</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.homeCard}
        >
          <View
            className={styles.homeCardHit}
            role="button"
            aria-label="通知设置"
            onClick={() => open('notifications')}
          >
            <View className={styles.homeCardIcon}>
              <Glyph name="bell" size="md" />
            </View>
            <View className={styles.homeCardCopy}>
              <Text className={styles.homeCardTitle}>通知设置</Text>
              <Text className={styles.homeCardCaption}>选择哪些消息来找你</Text>
            </View>
            <Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.homeCard}
        >
          <View
            className={styles.homeCardHit}
            role="button"
            aria-label="免打扰设置"
            onClick={() => open('dnd')}
          >
            <View className={styles.homeCardIconLavender}>
              <Glyph name="moon" size="md" />
            </View>
            <View className={styles.homeCardCopy}>
              <Text className={styles.homeCardTitle}>免打扰时间</Text>
              <Text className={styles.homeCardCaption}>让夜里的家保持安静</Text>
            </View>
            <Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="宝宝档案" onClick={() => void Taro.navigateTo({ url: '/pages/baby/index' })}>
            <View className={styles.homeCardIcon}><Glyph name="baby" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>宝宝档案</Text><Text className={styles.homeCardCaption}>编辑资料、喜欢和小小变化</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="全家搜索" onClick={() => void Taro.navigateTo({ url: '/pages/search/index' })}>
            <View className={styles.homeCardIcon}><Glyph name="search" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>全家搜索</Text><Text className={styles.homeCardCaption}>从记录和回忆里找回那一刻</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="夜间与外观" onClick={() => open('appearance')}>
            <View className={styles.homeCardIconLavender}><Glyph name="moon" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>夜间与外观</Text><Text className={styles.homeCardCaption}>当前 {theme === 'night' ? '夜间模式' : '日间模式'}</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="数据管理" onClick={() => open('data')}>
            <View className={styles.homeCardIcon}><Glyph name="shield" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>数据管理</Text><Text className={styles.homeCardCaption}>导出、备份状态和最近删除</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="备份状态" onClick={() => open('backup')}>
            <View className={styles.homeCardIcon}><Glyph name="shield" size="md" /></View>
            <View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>备份状态</Text><Text className={styles.homeCardCaption}>查看最近一次备份和空间使用</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface level="card" radius="card" interactive className={styles.homeCard}>
          <View className={styles.homeCardHit} role="button" aria-label="关于润芽" onClick={() => open('about')}>
            <View className={styles.homeCardIconLavender}><Glyph name="sparkle" size="md" /></View>
            <View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>关于润芽</Text><Text className={styles.homeCardCaption}>版本与服务信息</Text></View><Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <View className={styles.homeActions}>
          <SecondaryGlassButton label="进入管理模式" fullWidth={false} onClick={() => void Taro.navigateTo({ url: '/pages/admin/index' })} />
          <DangerButton label="退出登录" onClick={() => void logout()} />
        </View>
      </View>
    );
  }

  const title =
    view === 'notifications' ? '通知设置' : view === 'dnd' ? '免打扰时间' : view === 'appearance' ? '夜间与外观' : view === 'data' ? '数据管理' : view === 'account' ? '账户信息' : view === 'password' ? '修改密码' : view === 'devices' ? '已登录设备' : view === 'privacy' ? '隐私设置' : view === 'backup' ? '备份与存储' : view === 'about' ? '关于润芽' : '设置';
  const subtitle =
    view === 'notifications'
      ? '只接收你想听见的'
      : view === 'dnd'
        ? '夜里先好好休息'
        : view === 'appearance'
          ? '暖色的夜，也要清楚可读'
          : view === 'data'
            ? '重要的内容，随时带走'
            : view === 'account'
              ? '你的账户，由你掌握'
              : view === 'password'
                ? '定期更新，让登录更安心'
                : view === 'devices'
                  ? '每一台设备都清清楚楚'
                  : view === 'privacy'
                    ? '只分享你愿意分享的'
                    : view === 'backup'
                      ? '重要的记忆，留一份后手'
                      : view === 'about'
                        ? '把每一天认真收藏起来'
            : '把润芽调成你的样子';

  return (
    <PageShell className={styles.page}>
      <AppTopBar
        variant="standard"
        title={title}
        subtitle={subtitle}
        onBackClick={returnToPrevious}
      />
      <View className={`page-content ${styles.content}`}>
        {(view === 'notifications' || view === 'dnd') && query.isPending ? <Skeleton lines={7} /> : null}
        {(view === 'notifications' || view === 'dnd') && query.isError ? (
          <ErrorState
            title="设置还没打开"
            description="稍后再试，已有偏好不会被改掉。"
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {view === 'home' ? homeView() : null}
        {query.data && view === 'notifications' ? (
          <NotificationSettingsView
            preferences={query.data}
            onToggle={(key, value) => void togglePreference(key, value)}
            onDnd={() => open('dnd')}
            updating={update.isPending}
          />
        ) : null}
        {view === 'appearance' ? <SettingsQueryBoundary pending={settingsQuery.isPending} error={settingsQuery.isError} onRetry={() => void settingsQuery.refetch()} title="外观设置还没打开"><>{settingsQuery.data ? <AppearanceView value={settingsQuery.data.appearance} onChange={changeAppearance} /> : null}</></SettingsQueryBoundary> : null}
        {view === 'data' ? <SettingsQueryBoundary pending={trashQuery.isPending || exportsQuery.isPending} error={trashQuery.isError || exportsQuery.isError} onRetry={() => void Promise.all([trashQuery.refetch(), exportsQuery.refetch()])} title="数据管理还没打开"><DataView trash={trashQuery.data?.items ?? []} exports={exportsQuery.data?.items ?? []} downloadingExportId={downloadingExportId} onExport={startExport} onRestore={restore} onDownload={download} /></SettingsQueryBoundary> : null}
        {view === 'account' ? <SettingsQueryBoundary pending={accountQuery.isPending} error={accountQuery.isError} onRetry={() => void accountQuery.refetch()} title="账户信息还没打开"><AccountView nickname={accountNickname} onNickname={setAccountNickname} onSave={() => void saveAccount()} saving={savingAccount} onPassword={() => open('password')} /></SettingsQueryBoundary> : null}
        {view === 'password' ? <PasswordView currentPassword={currentPassword} newPassword={newPassword} onCurrent={setCurrentPassword} onNew={setNewPassword} onSave={() => void savePassword()} saving={savingPassword} /> : null}
        {view === 'devices' ? <SettingsQueryBoundary pending={devicesQuery.isPending} error={devicesQuery.isError} onRetry={() => void devicesQuery.refetch()} title="设备列表还没打开"><DevicesView items={devicesQuery.data?.items ?? []} onRevoke={async (id) => { try { await revokeDevice(id); await devicesQuery.refetch(); showToast('这台设备已退出。'); } catch { showToast('设备状态还没更新好。'); } }} /></SettingsQueryBoundary> : null}
        {view === 'privacy' ? <SettingsQueryBoundary pending={privacyQuery.isPending} error={privacyQuery.isError} onRetry={() => void privacyQuery.refetch()} title="隐私设置还没打开"><PrivacyView value={privacy} onChange={setPrivacy} onSave={() => void savePrivacy()} saving={savingPrivacy} /></SettingsQueryBoundary> : null}
        {view === 'backup' ? <SettingsQueryBoundary pending={backupStatusQuery.isPending || backupHistoryQuery.isPending || storageQuery.isPending} error={backupStatusQuery.isError || backupHistoryQuery.isError || storageQuery.isError} onRetry={() => void Promise.all([backupStatusQuery.refetch(), backupHistoryQuery.refetch(), storageQuery.refetch()])} title="备份信息还没打开"><BackupView status={backupStatusQuery.data} history={backupHistoryQuery.data?.items ?? []} storage={storageQuery.data} /></SettingsQueryBoundary> : null}
        {view === 'about' ? <SettingsQueryBoundary pending={aboutQuery.isPending} error={aboutQuery.isError} onRetry={() => void aboutQuery.refetch()} title="关于信息还没打开"><AboutView value={aboutQuery.data} /></SettingsQueryBoundary> : null}
        {query.data && view === 'dnd' ? (
          <DndSettingsView
            preferences={query.data}
            onSave={saveDnd}
            saving={update.isPending}
          />
        ) : null}
      </View>
    </PageShell>
  );
}

function SettingsQueryBoundary({
  pending,
  error,
  onRetry,
  title,
  children,
}: {
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  title: string;
  children: ReactNode;
}) {
  if (pending) return <Skeleton lines={6} />;
  if (error) return <ErrorState title={title} onRetry={onRetry} />;
  return <>{children}</>;
}

function AppearanceView({ value, onChange }: { value: UserSettings['appearance']; onChange: (value: UserSettings['appearance']) => void }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="lavender" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="moon" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>暖色的夜间模式</Text><Text className={styles.homeCaption}>不是反色，而是一套更柔和、仍然清楚的夜间材质。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.homeCard}><View style={{ padding: '16px' }}><SegmentedControl ariaLabel="选择外观" options={[{ value: 'SYSTEM', label: '跟随系统' }, { value: 'LIGHT', label: '日间' }, { value: 'NIGHT', label: '夜间' }]} value={value} onChange={onChange} /></View></GlassSurface></View>;
}

function DataView({ trash, exports, downloadingExportId, onExport, onRestore, onDownload }: { trash: TrashItem[]; exports: ExportJob[]; downloadingExportId: string | null; onExport: (type: 'CSV' | 'GROWTH_REPORT' | 'PHOTO_AUDIO_ARCHIVE' | 'MEMORY_ARCHIVE' | 'ANNUAL_REVIEW') => void; onRestore: (item: { entityType: string; entityId: string }) => void; onDownload: (job: Pick<ExportJob, 'id' | 'type'>) => void }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="sage" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="shield" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>数据被好好照看着</Text><Text className={styles.homeCaption}>导出任务和最近删除都在这里，默认保留 30 天。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.homeCard}><View className={styles.homeCardHit}><View className={styles.homeCardIcon}><Glyph name="file" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>导出一份档案</Text><Text className={styles.homeCardCaption}>文件会在准备好后保留 48 小时</Text></View></View><View className={styles.exportGrid}><SecondaryGlassButton label="CSV" fullWidth={false} onClick={() => onExport('CSV')} /><SecondaryGlassButton label="成长报告" fullWidth={false} onClick={() => onExport('GROWTH_REPORT')} /><SecondaryGlassButton label="照片与声音" fullWidth={false} onClick={() => onExport('PHOTO_AUDIO_ARCHIVE')} /><SecondaryGlassButton label="回忆归档" fullWidth={false} onClick={() => onExport('MEMORY_ARCHIVE')} /><SecondaryGlassButton label="年度回顾" fullWidth={false} onClick={() => onExport('ANNUAL_REVIEW')} /></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.homeCard}><View className={styles.homeCardHit}><View className={styles.homeCardIconLavender}><Glyph name="close" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>最近删除</Text><Text className={styles.homeCardCaption}>{trash.length ? `${trash.length} 条内容等待恢复` : '这里还没有需要恢复的内容'}</Text></View></View>{trash.slice(0, 5).map((item) => <View key={`${item.entityType}-${item.entityId}`} className={styles.dataRow}><Text className={styles.dataRowTitle}>{item.title}</Text><TextAction label="恢复" onClick={() => onRestore(item)} /></View>)}</GlassSurface><GlassSurface level="card" radius="card" className={styles.homeCard}><View className={styles.homeCardHit}><View className={styles.homeCardIcon}><Glyph name="calendar" size="md" /></View><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>导出历史</Text><Text className={styles.homeCardCaption}>{exports.length ? `${exports.length} 个任务，下载前会再次校验权限` : '还没有导出任务'}</Text></View></View>{exports.slice(0, 6).map((item) => <View key={item.id} className={styles.dataRow}><View className={styles.deviceCopy}><Text className={styles.dataRowTitle}>{item.type}</Text><Text className={styles.homeCaption}>{item.state}</Text></View>{item.state === 'READY' ? <TextAction label="下载" disabled={downloadingExportId === item.id} onClick={() => onDownload(item)} /> : <TextAction label={item.state === 'EXPIRED' ? '已过期' : '准备中'} disabled />}</View>)}</GlassSurface></View>;
}

function AccountView({ nickname, onNickname, onSave, saving, onPassword }: { nickname: string; onNickname: (value: string) => void; onSave: () => void; saving: boolean; onPassword: () => void }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="sky" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="family" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>这是你的账户</Text><Text className={styles.homeCaption}>昵称会出现在家庭协作和记录里。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><GlassInput label="昵称" value={nickname} placeholder="写一个喜欢的称呼" onInput={onNickname} /><PrimaryActionButton label="保存账户信息" state={saving ? 'loading' : 'default'} icon={<Glyph name="sparkle" size="sm" />} onClick={onSave} /><SecondaryGlassButton label="修改登录密码" onClick={onPassword} /></GlassSurface></View>;
}

function PasswordView({ currentPassword, newPassword, onCurrent, onNew, onSave, saving }: { currentPassword: string; newPassword: string; onCurrent: (value: string) => void; onNew: (value: string) => void; onSave: () => void; saving: boolean }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="lavender" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="lock" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>换一把只属于你的钥匙</Text><Text className={styles.homeCaption}>更新密码后，其他设备会在下一次请求时重新验证。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><GlassInput label="当前密码" password value={currentPassword} placeholder="输入当前密码" onInput={onCurrent} /><GlassInput label="新密码" password value={newPassword} placeholder="至少 8 位" onInput={onNew} /><PrimaryActionButton label="保存新密码" state={saving ? 'loading' : 'default'} icon={<Glyph name="lock" size="sm" />} onClick={onSave} /></GlassSurface></View>;
}

function DevicesView({ items, onRevoke }: { items: Array<{ id: string; platform: string; deviceName: string | null; appVersion: string | null; currentFamilyId: string | null; currentBabyId: string | null; lastSeenAt: number }>; onRevoke: (id: string) => Promise<void> }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="sage" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="settings" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>你在哪台设备上陪伴</Text><Text className={styles.homeCaption}>撤销后，这台设备的登录会话会失效。</Text></View></GlassSurface><View className={styles.deviceList}>{items.length ? items.map((item) => <GlassSurface level="card" radius="card" key={item.id} className={styles.deviceCard}><View className={styles.dataRow}><View className={styles.deviceCopy}><Text className={styles.dataRowTitle}>{item.deviceName || item.platform}</Text><Text className={styles.homeCaption}>{item.platform} · {item.appVersion || '当前版本'} · 最近活跃 {new Date(item.lastSeenAt).toLocaleDateString('zh-CN')}</Text></View><TextAction label="退出" onClick={() => void onRevoke(item.id)} /></View></GlassSurface>) : <GlassSurface level="card" radius="card" className={styles.homeCard}><Text className={styles.homeCaption}>暂时没有其他登录设备。</Text></GlassSurface>}</View></View>;
}

function PrivacyView({ value, onChange, onSave, saving }: { value: UserSettings['privacy'] | null; onChange: (value: UserSettings['privacy']) => void; onSave: () => void; saving: boolean }) {
  if (!value) return <Skeleton lines={4} />;
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="blush" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="lock" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>分享之前，先问问自己</Text><Text className={styles.homeCaption}>PRIVATE 内容不会出现在其他家庭成员的搜索里。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><Text className={styles.fieldHeading}>妈妈空间默认可见范围</Text><SegmentedControl ariaLabel="默认日记可见范围" options={[{ value: 'PRIVATE', label: '仅自己' }, { value: 'FAMILY', label: '家庭成员' }]} value={value.defaultDiaryVisibility} onChange={(next) => onChange({ ...value, defaultDiaryVisibility: next })} /><View className={styles.privacyToggleRow} role="switch" aria-checked={value.analyticsEnabled} onClick={() => onChange({ ...value, analyticsEnabled: !value.analyticsEnabled })}><View className={styles.homeCardCopy}><Text className={styles.homeCardTitle}>粗粒度使用分析</Text><Text className={styles.homeCaption}>只记录页面和功能事件，不上传日记正文。</Text></View><View className={value.analyticsEnabled ? styles.toggleOn : styles.toggleOff}><View className={styles.toggleKnob} /></View></View><PrimaryActionButton label="保存隐私设置" state={saving ? 'loading' : 'default'} icon={<Glyph name="lock" size="sm" />} onClick={onSave} /></GlassSurface></View>;
}

function BackupView({ status, history, storage }: { status: { status: string; lastRun: { id: string; status: string; startedAt: number; finishedAt: number | null; bytes: number | null; errorCode: string | null } | null } | undefined; history: Array<{ id: string; status: string; startedAt: number; finishedAt: number | null; bytes: number | null; errorCode: string | null }>; storage: { mediaBytes: number; mediaCount: number } | undefined }) {
  const latest = status?.lastRun;
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="sage" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="shield" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>给重要的记忆留一份后手</Text><Text className={styles.homeCaption}>备份状态、媒体占用和最近历史都在这里。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><Text className={styles.fieldHeading}>最近一次备份</Text><Text className={styles.homeCardTitle}>{latest ? latest.status : status?.status || '还没有运行过'}</Text><Text className={styles.homeCaption}>{latest ? new Date(latest.startedAt).toLocaleString('zh-CN') : '系统会在配置后记录下一次运行。'}</Text></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><Text className={styles.fieldHeading}>媒体存储</Text><Text className={styles.homeCardTitle}>{storage ? `${storage.mediaCount} 个文件 · ${Math.round(storage.mediaBytes / 1024 / 1024)} MB` : '正在统计…'}</Text><Text className={styles.homeCaption}>照片和声音的原始文件不会因为普通删除立即消失。</Text></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><Text className={styles.fieldHeading}>备份历史</Text>{history.slice(0, 6).map((item) => <View className={styles.dataRow} key={item.id}><Text className={styles.dataRowTitle}>{item.status}</Text><Text className={styles.homeCaption}>{new Date(item.startedAt).toLocaleDateString('zh-CN')}</Text></View>)}{history.length === 0 ? <Text className={styles.homeCaption}>还没有备份历史。</Text> : null}</GlassSurface></View>;
}

function AboutView({ value }: { value: { name: string; version: string; apiVersion: string } | undefined }) {
  return <View className={styles.homeStack}><GlassSurface level="tinted" tone="apricot" radius="hero" className={styles.homeHero}><View className={styles.homeArt}><Glyph name="sparkle" size="lg" /></View><View className={styles.homeCopy}><Text className={styles.homeTitle}>把润润长大的每一天，认真收藏起来</Text><Text className={styles.homeCaption}>温暖、私密、和家人一起使用。</Text></View></GlassSurface><GlassSurface level="card" radius="card" className={styles.formCard}><View className={styles.dataRow}><Text className={styles.dataRowTitle}>产品</Text><Text className={styles.homeCaption}>{value?.name || '润芽 · RUNEW'}</Text></View><View className={styles.dataRow}><Text className={styles.dataRowTitle}>版本</Text><Text className={styles.homeCaption}>{value?.version || '读取中…'}</Text></View><View className={styles.dataRow}><Text className={styles.dataRowTitle}>API</Text><Text className={styles.homeCaption}>{value?.apiVersion || 'v1'}</Text></View></GlassSurface></View>;
}
