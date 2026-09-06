import { Text, View } from '@tarojs/components';
import { useCallback, useEffect, useState } from 'react';
import { createUlid } from '@runew/shared-utils';
import { ApiError, apiRequest } from '@/api/client';
import { platformAdapters } from '@/adapters/platform';
import { CuteIconChip } from '@/components/foundation/CuteIconChip';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { SectionHeader } from '@/components/foundation/SectionHeader';
import { EmptyState } from '@/components/feedback';
import { FilterChip, GlassDateField, GlassInput } from '@/components/forms';
import { PrimaryActionButton, SecondaryGlassButton } from '@/components/buttons';
import { Glyph } from '@/components/icons/Glyph';
import styles from './FamilyHome.module.scss';
import { FamilyInvitePanel } from './FamilyInvitePanel';
import {
  FAMILY_REPEAT_OPTIONS,
  familyAnniversaryCountdown,
  formatFamilyAnniversaryDate,
  formatFamilyTaskMeta,
  isFamilyTaskOverdue,
} from './familyPresentation';
import {
  familyMemberGlyph,
  familyMemberLabel,
  familyMemberTone,
} from './relationshipCards';
import { BottomSheet, ConfirmDialog } from '@/components/overlay';
import { cacheLocalFamilyTask, deleteLocalFamilyTask, enqueueFamilyTaskOperation, listLocalFamilyTasks, loadFamilyTaskOperations, removeFamilyTaskOperation, saveLocalFamilyTask } from '@/local/familyTaskStore';
import {
  createFamilyInvite as requestFamilyInvite,
  createFamilyAnniversary,
  createFamilyAchievement,
  grantFamilyAchievement,
  deleteFamilyAnniversary,
  fetchFamilyAchievement,
  fetchFamilyAchievements,
  fetchFamilyAnniversaries,
  disableFamilyMember,
  fetchFamilyMember,
  restoreFamilyMember,
  updateFamilyPermissions,
  updateFamilyAnniversary,
  updateFamilyTask,
} from '@/api/family';

type Task = {
  id: string;
  title: string;
  note: string | null;
  completedAt: number | null;
  version: number;
  dueAt?: number | null;
  repeatRule?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  assignedTo?: string | null;
  experienceReward?: number;
};
type Member = { id: string; userId?: string; nickname?: string; relationship: string; status: string };
type Anniversary = { id?: string; title?: string; date?: string; note?: string | null };

const DEFAULT_ACHIEVEMENT_MARK = {
  emoji: '🌱',
  glyph: 'growth' as const,
  tone: 'sage' as const,
  label: '小芽',
};

const ACHIEVEMENT_MARKS = [
  DEFAULT_ACHIEVEMENT_MARK,
  { emoji: '✨', glyph: 'sparkle' as const, tone: 'apricot' as const, label: '星星' },
  { emoji: '🏠', glyph: 'house' as const, tone: 'sky' as const, label: '小家' },
  { emoji: '💛', glyph: 'heart' as const, tone: 'blush' as const, label: '心意' },
];

const RESOURCE_LABELS: Record<string, string> = {
  records: '日常记录',
  growth: '成长记录',
  health: '健康事项',
  memories: '宝宝回忆',
  family: '家庭协作',
};

function achievementMark(emoji?: string | null) {
  return ACHIEVEMENT_MARKS.find((item) => item.emoji === emoji) ?? DEFAULT_ACHIEVEMENT_MARK;
}

function FamilyChoiceChips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <View className={styles.choiceRow}>
      {options.map((option) => (
        <FilterChip
          key={option.value || option.label}
          label={option.label}
          selected={value === option.value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}

export function FamilyHome({
  familyId,
  familyName,
}: {
  familyId?: string;
  familyName?: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState('');
  const [taskNote, setTaskNote] = useState('');
  const [taskOptionsOpen, setTaskOptionsOpen] = useState(false);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskRepeatRule, setTaskRepeatRule] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | ''>('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskExperienceReward, setTaskExperienceReward] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingTaskOperations, setPendingTaskOperations] = useState(0);
  const [conflictTask, setConflictTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [invite, setInvite] = useState<{ token: string; expiresAt: number } | null>(
    null,
  );
  const [inviting, setInviting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberDetail, setMemberDetail] = useState<Awaited<
    ReturnType<typeof fetchFamilyMember>
  > | null>(null);
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [achievements, setAchievements] = useState<
    Array<{ title?: string; emoji?: string; description?: string | null }>
  >([]);
  const [anniversaries, setAnniversaries] = useState<
    Anniversary[]
  >([]);
  const [overlay, setOverlay] = useState<'achievement' | 'anniversary' | null>(null);
  const [achievementDetail, setAchievementDetail] = useState<{ id: string; title: string; description?: string | null; emoji?: string | null } | null>(null);
  const [editingAnniversaryId, setEditingAnniversaryId] = useState<string | null>(null);
  const [selectedAnniversary, setSelectedAnniversary] = useState<Anniversary | null>(null);
  const [deletingAnniversary, setDeletingAnniversary] = useState<Anniversary | null>(null);
  const [anniversaryTitle, setAnniversaryTitle] = useState('');
  const [anniversaryDate, setAnniversaryDate] = useState('');
  const [anniversaryNote, setAnniversaryNote] = useState('');
  const [achievementTitle, setAchievementTitle] = useState('');
  const [achievementDescription, setAchievementDescription] = useState('');
  const [achievementEmoji, setAchievementEmoji] = useState('🌱');
  const refreshPendingTaskOperations = useCallback(async () => {
    if (!familyId) return;
    const operations = await loadFamilyTaskOperations();
    setPendingTaskOperations(
      operations.filter((operation) => operation.familyId === familyId).length,
    );
  }, [familyId]);

  function retryTaskSync() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('online'));
  }

  function dueAtFromInput(value: string) {
    return value ? Date.parse(`${value}T12:00:00.000Z`) : null;
  }

  function dueDateInput(value?: number | null) {
    return value ? new Date(value).toISOString().slice(0, 10) : '';
  }

  function resetTaskOptions() {
    setTaskNote('');
    setTaskDueDate('');
    setTaskRepeatRule('');
    setTaskAssignee('');
    setTaskExperienceReward('0');
  }

  function taskAssigneeLabel(assignedTo?: string | null) {
    if (!assignedTo) return undefined;
    const member = members.find((item) => (item.userId ?? item.id) === assignedTo);
    return member ? familyMemberLabel(member.relationship, member.nickname) : '已分配';
  }

  useEffect(() => {
    if (!familyId) return;
    void (async () => {
      await refreshPendingTaskOperations();
      const offline = !(await platformAdapters.network.isOnline());
      if (offline) {
        const items = await listLocalFamilyTasks(familyId);
        setTasks(items.map((item) => ({ ...item, note: item.note ?? null, completedAt: item.completedAt ?? null })));
        setMessage('当前离线，先把小事记在本地，联网后再同步');
        return;
      }
      try {
        const [t, m, a, d] = await Promise.all([
          apiRequest<{ items: Task[] }>(`/families/${familyId}/tasks`),
          apiRequest<{ items: Member[] }>(`/families/${familyId}/members`),
          fetchFamilyAchievements(familyId),
          fetchFamilyAnniversaries(familyId),
        ]);
        setTasks(t.items);
        void Promise.all(t.items.map((item) => cacheLocalFamilyTask({ ...item, familyId, note: item.note ?? null, completedAt: item.completedAt ?? null })));
        setMembers(m.items);
        setAchievements(
          a.items as Array<{
            title?: string;
            emoji?: string;
            description?: string | null;
          }>,
        );
        setAnniversaries(d.items as Anniversary[]);
      } catch {
        setMessage('小家正在休息，稍后再试试');
      }
    })();
  }, [familyId, refreshPendingTaskOperations]);
  useEffect(() => {
    if (!familyId) return;
    const onOnline = () => {
      void (async () => {
        let hasPendingFailure = false;
        for (const operation of await loadFamilyTaskOperations()) {
          try {
            if (operation.familyId !== familyId) continue;
            if (operation.op === 'CREATE') await apiRequest(`/families/${familyId}/tasks`, { method: 'POST', body: { id: operation.taskId, title: operation.payload?.title ?? '', note: operation.payload?.note?.trim() || null, dueAt: operation.payload?.dueAt ?? null, repeatRule: operation.payload?.repeatRule ?? null, assignedTo: operation.payload?.assignedTo ?? null, experienceReward: operation.payload?.experienceReward ?? 0 }, idempotencyKey: operation.operationId });
            if (operation.op === 'UPDATE') await updateFamilyTask(familyId, operation.taskId, { title: operation.payload?.title ?? '', note: operation.payload?.note?.trim() || null, dueAt: operation.payload?.dueAt ?? null, repeatRule: operation.payload?.repeatRule ?? null, assignedTo: operation.payload?.assignedTo ?? null, experienceReward: operation.payload?.experienceReward ?? 0 }, Math.max(1, (operation.payload?.version ?? 2) - 1));
            if (operation.op === 'COMPLETE') await apiRequest(`/families/${familyId}/tasks/${operation.taskId}/complete`, { method: 'POST', ifMatch: `"v${Math.max(1, (operation.payload?.version ?? 2) - 1)}"` });
            if (operation.op === 'DELETE') await apiRequest(`/families/${familyId}/tasks/${operation.taskId}`, { method: 'DELETE' });
            await removeFamilyTaskOperation(operation.operationId);
            setPendingTaskOperations((count) => Math.max(0, count - 1));
          } catch {
            hasPendingFailure = true;
            setMessage('有一件小事还在等待同步');
          }
        }
        return hasPendingFailure;
      })().then((hasPendingFailure) => apiRequest<{ items: Task[] }>(`/families/${familyId}/tasks`).then((remote) => ({ remote, hasPendingFailure }))).then(({ remote, hasPendingFailure }) => {
        void Promise.all(remote.items.map((item) => cacheLocalFamilyTask({ ...item, familyId, note: item.note ?? null, completedAt: item.completedAt ?? null })));
        setTasks((current) => {
          const localOnly = current.filter((item) => !remote.items.some((entry) => entry.id === item.id));
          return [...remote.items, ...localOnly];
        });
        if (!hasPendingFailure) setMessage('网络回来啦，已更新小家任务');
      }).then(() => refreshPendingTaskOperations()).catch(() => setMessage('网络已恢复，任务稍后再同步'));
    };
    const unsubscribe = platformAdapters.network.onStatusChange((online) => {
      if (online) onOnline();
    });
    return unsubscribe;
  }, [familyId, refreshPendingTaskOperations]);
  async function addTask() {
    if (!familyId || !title.trim()) return;
    setBusy(true);
    const taskId = createUlid();
    const operationId = createUlid();
    const localTask: Task & { familyId: string; version: number } = {
      id: taskId,
      familyId,
      title: title.trim(),
      note: taskNote.trim() || null,
      completedAt: null,
      version: 1,
      dueAt: dueAtFromInput(taskDueDate),
      repeatRule: taskRepeatRule || null,
      assignedTo: taskAssignee || null,
      experienceReward: Number(taskExperienceReward) || 0,
    };
    try {
      const offline = !(await platformAdapters.network.isOnline());
      if (offline) {
        await saveLocalFamilyTask(localTask, operationId);
        await enqueueFamilyTaskOperation({ familyId, taskId, operationId, op: 'CREATE', payload: localTask });
        setPendingTaskOperations((count) => count + 1);
        setTasks((x) => [...x, localTask]);
        setTitle('');
        resetTaskOptions();
        setTaskOptionsOpen(false);
        return;
      }
      try {
        const task = await apiRequest<Task>(`/families/${familyId}/tasks`, {
          method: 'POST',
          body: {
            id: taskId,
            title: localTask.title,
            note: localTask.note ?? undefined,
            dueAt: localTask.dueAt,
            repeatRule: localTask.repeatRule,
            assignedTo: localTask.assignedTo,
            experienceReward: localTask.experienceReward,
          },
          idempotencyKey: operationId,
        });
        setTasks((x) => [...x, task]);
        setTitle('');
        resetTaskOptions();
        setTaskOptionsOpen(false);
      } catch (error) {
        const retryable =
          !(error instanceof ApiError) || error.retryable || error.status >= 500;
        if (!retryable) throw error;
        await saveLocalFamilyTask(localTask, operationId);
        await enqueueFamilyTaskOperation({ familyId, taskId, operationId, op: 'CREATE', payload: localTask });
        setPendingTaskOperations((count) => count + 1);
        setTasks((x) => [...x, localTask]);
        setTitle('');
        resetTaskOptions();
        setTaskOptionsOpen(false);
        setMessage('网络暂时不稳，已先保存在本地，联网后会继续同步');
      }
    } finally {
      setBusy(false);
    }
  }
  async function complete(id: string) {
    if (!familyId) return;
    const current = tasks.find((item) => item.id === id);
    if (!current) return;
    const offline = !(await platformAdapters.network.isOnline());
    if (offline) {
      const localTask = { ...current, familyId, completedAt: Date.now(), version: current.version + 1 };
      await saveLocalFamilyTask(localTask);
      await enqueueFamilyTaskOperation({ familyId, taskId: localTask.id, op: 'COMPLETE', payload: localTask });
      setPendingTaskOperations((count) => count + 1);
      setTasks((x) => x.map((item) => (item.id === id ? localTask : item)));
      setMessage('已保存在本地，联网后会继续同步');
      return;
    }
    try {
      const task = await apiRequest<Task>(`/families/${familyId}/tasks/${id}/complete`, {
        method: 'POST',
        ifMatch: `"v${current.version}"`,
      });
      setTasks((x) => x.map((item) => (item.id === id ? task : item)));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ENTITY_VERSION_CONFLICT') {
        setConflictTask(tasks.find((item) => item.id === id) ?? null);
      } else {
        setMessage('任务状态还没更新好，请稍后再试');
      }
    }
  }
  async function saveTaskEdit() {
    if (!familyId || !editingTask || !editingTask.title.trim()) return;
    try {
      if (!(await platformAdapters.network.isOnline())) {
        const localTask = { ...editingTask, title: editingTask.title.trim(), note: editingTask.note?.trim() || null, familyId, version: editingTask.version + 1 };
        await saveLocalFamilyTask(localTask);
        await enqueueFamilyTaskOperation({ familyId, taskId: localTask.id, op: 'UPDATE', payload: localTask });
        setPendingTaskOperations((count) => count + 1);
        setTasks((items) => items.map((item) => (item.id === localTask.id ? localTask : item)));
        setEditingTask(null);
        setMessage('修改已保存在本地，联网后会继续同步');
        return;
      }
      const updated = await updateFamilyTask(
        familyId,
        editingTask.id,
        {
          title: editingTask.title.trim(),
          note: editingTask.note?.trim() || null,
          dueAt: editingTask.dueAt ?? null,
          repeatRule: editingTask.repeatRule ?? null,
          assignedTo: editingTask.assignedTo ?? null,
          experienceReward: editingTask.experienceReward ?? 0,
        },
        editingTask.version,
      );
      setTasks((items) => items.map((item) => (item.id === editingTask.id ? (updated as Task) : item)));
      setEditingTask(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ENTITY_VERSION_CONFLICT') setConflictTask(editingTask);
      else setMessage('任务还没保存好，请再试一次');
    }
  }
  async function removeTask(task: Task) {
    if (!familyId) return;
    try {
      if (!(await platformAdapters.network.isOnline())) {
        await deleteLocalFamilyTask({ ...task, familyId, version: task.version, completedAt: task.completedAt });
        await enqueueFamilyTaskOperation({ familyId, taskId: task.id, op: 'DELETE', payload: { ...task, familyId } });
        setPendingTaskOperations((count) => count + 1);
        setTasks((items) => items.filter((item) => item.id !== task.id));
        setMessage('删除意图已保存在本地，联网后会继续同步');
        return;
      }
      await apiRequest(`/families/${familyId}/tasks/${task.id}`, { method: 'DELETE' });
      setTasks((items) => items.filter((item) => item.id !== task.id));
    } catch {
      setMessage('任务还没删除好，请再试一次');
    }
  }
  async function createInvite() {
    if (!familyId || inviting) return;
    setInviting(true);
    try {
      const result = await requestFamilyInvite(familyId);
      setInvite(result);
    } catch {
      setMessage('邀请暂时没有生成好，再试一次吧');
    } finally {
      setInviting(false);
    }
  }
  async function openMember(member: Member) {
    if (!familyId) return;
    setSelectedMember(member);
    try {
      setMemberDetail(await fetchFamilyMember(familyId, member.id));
    } catch {
      setMessage('成员详情暂时打不开');
    }
  }
  async function togglePermission(resource: string) {
    if (!familyId || !memberDetail || permissionBusy) return;
    const current = memberDetail.permissions.find(
      (item) => item.resource === resource && item.action === 'VIEW',
    );
    const permissions = memberDetail.permissions.filter(
      (item) => !(item.resource === resource && item.action === 'VIEW'),
    );
    // Role defaults allow family content; the toggle stores an explicit deny.
    if (!current || current.effect === 'ALLOW')
      permissions.push({ resource, action: 'VIEW', effect: 'DENY' });
    setPermissionBusy(true);
    try {
      await updateFamilyPermissions(familyId, memberDetail.id, permissions);
      setMemberDetail({ ...memberDetail, permissions });
    } catch {
      setMessage('权限还没保存好，请稍后再试');
    } finally {
      setPermissionBusy(false);
    }
  }
  async function toggleMemberStatus() {
    if (!familyId || !memberDetail || permissionBusy) return;
    setPermissionBusy(true);
    try {
      if (memberDetail.status === 'DISABLED')
        await restoreFamilyMember(familyId, memberDetail.id);
      else await disableFamilyMember(familyId, memberDetail.id);
      setMemberDetail({
        ...memberDetail,
        status: memberDetail.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED',
      });
      setMembers((items) =>
        items.map((item) =>
          item.id === memberDetail.id
            ? {
                ...item,
                status: memberDetail.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED',
              }
            : item,
        ),
      );
    } catch {
      setMessage('成员状态还没更新好，请稍后再试');
    } finally {
      setPermissionBusy(false);
    }
  }
  async function addAnniversary() {
    if (!familyId || !anniversaryTitle.trim() || !anniversaryDate) return;
    try {
      const payload = {
        title: anniversaryTitle.trim(),
        date: anniversaryDate,
        note: anniversaryNote.trim() || undefined,
      };
      const item = editingAnniversaryId
        ? await updateFamilyAnniversary(familyId, editingAnniversaryId, payload)
        : await createFamilyAnniversary(familyId, payload);
      setAnniversaries((items) =>
        editingAnniversaryId
          ? items.map((entry) => (entry.id === editingAnniversaryId ? (item as Anniversary) : entry))
          : [...items, item as Anniversary],
      );
      setAnniversaryTitle('');
      setAnniversaryDate('');
      setAnniversaryNote('');
      setEditingAnniversaryId(null);
      setOverlay(null);
    } catch {
      setMessage('纪念日还没保存好，请再试一次');
    }
  }
  async function removeAnniversary(item: Anniversary) {
    if (!familyId || !item.id) return;
    try {
      await deleteFamilyAnniversary(familyId, item.id);
      setAnniversaries((items) => items.filter((entry) => entry.id !== item.id));
    } catch {
      setMessage('纪念日还没删除好，请再试一次');
    }
  }
  async function openAchievement(item: { id?: string; title?: string; description?: string | null; emoji?: string }) {
    if (!familyId || !item.id) return;
    try {
      setAchievementDetail(await fetchFamilyAchievement(familyId, item.id));
    } catch {
      setMessage('成就详情暂时打不开');
    }
  }
  async function addAchievement() {
    if (!familyId || !achievementTitle.trim()) return;
    try {
      const item = await createFamilyAchievement(familyId, {
        title: achievementTitle.trim(),
        description: achievementDescription.trim() || undefined,
        emoji: achievementEmoji.trim() || '🌱',
      });
      setAchievements((items) => [...items, item as { title: string; description?: string | null; emoji?: string }]);
      setAchievementTitle('');
      setAchievementDescription('');
      setOverlay(null);
    } catch {
      setMessage('成就还没保存好，请再试一次');
    }
  }
  async function grantAchievement() {
    if (!familyId || !achievementDetail) return;
    try {
      await grantFamilyAchievement(familyId, achievementDetail.id);
      setMessage('这份共同成就已收好');
    } catch {
      setMessage('成就还没收好，请再试一次');
    }
  }
  return (
    <View className={styles.page}>
      <GlassSurface level="tinted" tone="sage" radius="hero" className={styles.hero}>
        <View className={styles.heroArt} aria-hidden>
          <Glyph name="house" size="lg" className={styles.heroGlyph} />
        </View>
        <CuteIconChip icon="house" tone="sage" />
        <View className={styles.heroCopy}>
          <Text className={`text-card-title ${styles.title}`}>{familyName ?? '我们的小家'}</Text>
          <Text className={styles.sub}>把今天的照顾，变成我们共同的记忆</Text>
        </View>
      </GlassSurface>
      <SectionHeader
        title="家庭成员"
        caption={members.length ? `${members.length} 位家人都在这段成长里` : '每个人都在这段成长里'}
        glyph="family"
        tone="sage"
      />
      <GlassSurface level="hero" radius="hero" className={styles.members}>
        <View className={styles.avatarRow}>
          {members.map((m, i) => {
            const label = familyMemberLabel(m.relationship, m.nickname);
            return (
              <View
                className={`${styles.member} ${m.status === 'DISABLED' ? styles.memberAway : ''}`}
                key={m.id}
                role="button"
                aria-label={`${label}，查看详情`}
                onClick={() => void openMember(m)}
              >
                <CuteIconChip
                  icon={familyMemberGlyph(m.relationship)}
                  tone={familyMemberTone(m.relationship, i)}
                />
                <Text className={styles.memberName}>{label}</Text>
              </View>
            );
          })}
          <View
            className={styles.member}
            role="button"
            aria-label="邀请家人"
            aria-busy={inviting}
            onClick={() => void createInvite()}
          >
            <CuteIconChip icon="plus" tone="apricot" dashed sparkle={false} />
            <Text className={styles.memberName}>{inviting ? '正在生成' : '邀请家人'}</Text>
          </View>
        </View>
      </GlassSurface>
      <BottomSheet
        open={selectedMember !== null}
        title="成员详情"
        onClose={() => {
          setSelectedMember(null);
          setMemberDetail(null);
        }}
      >
        {memberDetail ? (
          <View className={styles.memberDetail}>
            <CuteIconChip
              icon={familyMemberGlyph(memberDetail.relationship)}
              tone={familyMemberTone(memberDetail.relationship)}
            />
            <Text className={styles.detailName}>
              {memberDetail.nickname ?? '家庭成员'}
            </Text>
            <Text className={styles.detailMeta}>
              {familyMemberLabel(memberDetail.relationship, memberDetail.nickname)} · {memberDetail.role} ·{' '}
              {memberDetail.status === 'ACTIVE' ? '一起照顾中' : '暂时离开'}
            </Text>
            <Text className={styles.detailLabel}>可以一起查看</Text>
            {['records', 'growth', 'health', 'memories', 'family'].map((resource) => {
              const denied = memberDetail.permissions.some(
                (item) =>
                  item.resource === resource &&
                  item.action === 'VIEW' &&
                  item.effect === 'DENY',
              );
              const allowed = !denied;
              return (
                <View
                  key={resource}
                  className={`glass-control ${styles.permissionRow}`}
                  role="button"
                  onClick={() => (memberDetail.status === 'DISABLED' ? undefined : void togglePermission(resource))}
                  aria-disabled={memberDetail.status === 'DISABLED'}
                >
                  <Text>{RESOURCE_LABELS[resource]}</Text>
                  <Text
                    className={allowed ? styles.permissionOn : styles.permissionOff}
                  >
                    {allowed ? '一起看' : '先收着'}
                  </Text>
                </View>
              );
            })}
            <SecondaryGlassButton
              label={
                memberDetail.status === 'DISABLED' ? '恢复成员访问' : '暂时停用成员'
              }
              onClick={() => void toggleMemberStatus()}
              state={permissionBusy ? 'loading' : 'default'}
            />
          </View>
        ) : (
          <Text className={styles.empty}>正在打开成员详情…</Text>
        )}
      </BottomSheet>
      <BottomSheet
        open={invite !== null}
        title="邀请家人"
        onClose={() => setInvite(null)}
      >
        {invite ? <FamilyInvitePanel {...invite} /> : null}
      </BottomSheet>
      <SectionHeader
        title="今天一起做什么"
        caption="协作小事，不是家庭考核"
        glyph="list"
        tone="apricot"
      />
      <GlassSurface className={styles.taskCard}>
        <View className={styles.inputRow}>
          <View className={styles.inputGrow}>
            <GlassInput
              value={title}
              placeholder="写下一个想一起完成的小事…"
              onInput={setTitle}
            />
          </View>
          <PrimaryActionButton
            label="添加"
            tone="sage"
            fullWidth={false}
            state={busy ? 'loading' : 'default'}
            onClick={() => void addTask()}
          />
        </View>
        <SecondaryGlassButton
          label="设置负责人和日期"
          fullWidth={false}
          onClick={() => setTaskOptionsOpen(true)}
        />
        {tasks.length === 0 ? (
          <EmptyState
            glyph="list"
            tone="apricot"
            title="还没有共同任务"
            description="先写下一件轻松的小事吧"
          />
        ) : (
          tasks.map((task) => {
            const overdue = isFamilyTaskOverdue(task);
            const meta = formatFamilyTaskMeta(task, taskAssigneeLabel(task.assignedTo));
            return (
              <View
                className={styles.task}
                key={task.id}
                role="button"
                aria-label={`${task.title}，查看任务详情`}
                onClick={() => setSelectedTask(task)}
              >
                <View
                  className={`${styles.checkHit} ${task.completedAt ? styles.checked : ''} ${overdue ? styles.overdue : ''}`}
                  role="button"
                  aria-label={task.completedAt ? '已一起完成' : '一起完成'}
                  aria-disabled={Boolean(task.completedAt)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!task.completedAt) void complete(task.id);
                  }}
                >
                  <View className={styles.check}>{task.completedAt ? '✓' : ''}</View>
                </View>
                <View className={styles.taskContent}>
                  <Text className={`${styles.taskTitle} ${task.completedAt ? styles.done : ''}`}>
                    {task.title}
                  </Text>
                  {meta ? (
                    <Text className={`${styles.taskMeta} ${overdue ? styles.taskOverdue : ''}`}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <View className={styles.chevron} aria-hidden>
                  <Glyph name="chevron" size="sm" />
                </View>
              </View>
            );
          })
        )}
      </GlassSurface>
      <View className={styles.tiles}>
        <GlassSurface tone="apricot" level="tinted" className={styles.tile}>
          <CuteIconChip icon="sparkle" tone="apricot" />
          <Text className={styles.tileTitle}>家庭成就</Text>
          <Text className={styles.tileSub}>
            {achievements.length
              ? `${achievements.length} 个共同里程碑`
              : '一起解锁小小里程碑'}
          </Text>
          <SecondaryGlassButton
            label="去看看"
            fullWidth={false}
            onClick={() => setOverlay('achievement')}
          />
        </GlassSurface>
        <GlassSurface tone="lavender" level="tinted" className={styles.tile}>
          <CuteIconChip icon="calendar" tone="lavender" />
          <Text className={styles.tileTitle}>家庭纪念日</Text>
          <Text className={styles.tileSub}>
            {anniversaries.length
              ? `${anniversaries.length} 个值得记住的日子`
              : '记住我们珍贵的日子'}
          </Text>
          <SecondaryGlassButton
            label="添加日期"
            fullWidth={false}
            onClick={() => setOverlay('anniversary')}
          />
        </GlassSurface>
      </View>
      {message ? (
        <View className={styles.messageRow}>
          <Text className={styles.message}>{message}</Text>
          {pendingTaskOperations > 0 ? (
            <SecondaryGlassButton
              label={`重试同步 (${pendingTaskOperations})`}
              fullWidth={false}
              onClick={retryTaskSync}
            />
          ) : null}
        </View>
      ) : null}
      <BottomSheet
        open={overlay === 'achievement'}
        title="家庭成就"
        onClose={() => setOverlay(null)}
      >
        <View className={styles.listSheet}>
          <GlassInput
            value={achievementTitle}
            placeholder="例如：第一次一起露营"
            onInput={setAchievementTitle}
          />
          <Text className={styles.detailLabel}>选一个小小记号</Text>
          <View className={styles.markRow}>
            {ACHIEVEMENT_MARKS.map((mark) => (
              <View
                key={mark.emoji}
                className={styles.markHit}
                role="button"
                aria-label={mark.label}
                aria-pressed={achievementEmoji === mark.emoji}
                onClick={() => setAchievementEmoji(mark.emoji)}
              >
                <CuteIconChip
                  icon={mark.glyph}
                  tone={mark.tone}
                  size="sm"
                  selected={achievementEmoji === mark.emoji}
                />
              </View>
            ))}
          </View>
          <GlassInput
            value={achievementDescription}
            placeholder="写下这段共同记忆"
            onInput={setAchievementDescription}
          />
          <PrimaryActionButton label="收藏这个里程碑" onClick={() => void addAchievement()} />
          {achievements.length ? (
            achievements.map((item, index) => {
              const mark = achievementMark(item.emoji);
              return (
                <View
                  className={`glass-control ${styles.achievementRow}`}
                  key={`${item.title}-${index}`}
                  role="button"
                  onClick={() => void openAchievement(item as { id?: string; title?: string; description?: string | null; emoji?: string })}
                >
                  <CuteIconChip icon={mark.glyph} tone={mark.tone} size="sm" />
                  <View>
                    <Text className={styles.detailName}>
                      {item.title ?? '一起完成的小事'}
                    </Text>
                    <Text className={styles.detailMeta}>
                      {item.description ?? '每一次陪伴，都值得被记住'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <EmptyState
              glyph="sparkle"
              tone="apricot"
              title="成就会慢慢亮起来"
              description="每一次陪伴，都值得被记住"
            />
          )}
        </View>
      </BottomSheet>
      <BottomSheet
        open={overlay === 'anniversary'}
        title="家庭纪念日"
        onClose={() => setOverlay(null)}
      >
        <View className={styles.listSheet}>
          <GlassInput
            value={anniversaryTitle}
            placeholder="例如：第一次见面"
            onInput={setAnniversaryTitle}
          />
          <GlassDateField
            label="日期"
            value={anniversaryDate}
            placeholder="选择一个值得记住的日子"
            start="1900-01-01"
            end="2100-12-31"
            onChange={setAnniversaryDate}
          />
          <GlassInput
            value={anniversaryNote}
            placeholder="写一句想留住的话（可选）"
            onInput={setAnniversaryNote}
          />
          <Text className={styles.detailMeta}>把日期留给我们，一起记住。</Text>
          <PrimaryActionButton
            label="保存这个日子"
            onClick={() => void addAnniversary()}
          />
          {anniversaries.length === 0 ? (
            <EmptyState
              glyph="calendar"
              tone="lavender"
              title="还没有纪念日"
              description="先记下我们珍贵的日子"
            />
          ) : (
            <View className={styles.anniversaryList}>
              {anniversaries.map((item, index) => (
                <View
                  className={styles.anniversaryRow}
                  key={`${item.title}-${index}`}
                  role="button"
                  aria-label={`${item.title ?? '家庭纪念日'}，查看详情`}
                  onClick={() => setSelectedAnniversary(item)}
                >
                  <CuteIconChip icon="calendar" tone="lavender" />
                  <View className={styles.anniversaryCopy}>
                    <Text className={styles.anniversaryTitle}>{item.title}</Text>
                    <Text className={styles.anniversaryDate}>
                      {item.date ? formatFamilyAnniversaryDate(item.date) : ''}
                    </Text>
                  </View>
                  {item.date ? (
                    <Text className={styles.anniversaryCount}>
                      {familyAnniversaryCountdown(item.date)}
                    </Text>
                  ) : null}
                  <View className={styles.chevron} aria-hidden>
                    <Glyph name="chevron" size="sm" />
                  </View>
                </View>
              ))}
            </View>
          )}
          </View>
      </BottomSheet>
      <BottomSheet
        open={Boolean(selectedAnniversary)}
        title="纪念日详情"
        onClose={() => setSelectedAnniversary(null)}
      >
        <View className={styles.detailSheet}>
          <CuteIconChip icon="calendar" tone="lavender" />
          <Text className={styles.detailName}>{selectedAnniversary?.title ?? '家庭纪念日'}</Text>
          <Text className={styles.anniversaryDate}>
            {selectedAnniversary?.date ? formatFamilyAnniversaryDate(selectedAnniversary.date) : ''}
          </Text>
          {selectedAnniversary?.date ? (
            <Text className={styles.anniversaryCount}>
              {familyAnniversaryCountdown(selectedAnniversary.date)}
            </Text>
          ) : null}
          <Text className={styles.detailMeta}>
            {selectedAnniversary?.note ?? '把这一天留给我们，一起记住。'}
          </Text>
          {selectedAnniversary ? (
            <View className={styles.rowActions}>
              <SecondaryGlassButton
                label="编辑"
                onClick={() => {
                  setEditingAnniversaryId(selectedAnniversary.id ?? null);
                  setAnniversaryTitle(selectedAnniversary.title ?? '');
                  setAnniversaryDate(selectedAnniversary.date ?? '');
                  setAnniversaryNote(selectedAnniversary.note ?? '');
                  setSelectedAnniversary(null);
                  setOverlay('anniversary');
                }}
              />
              <SecondaryGlassButton
                label="删除"
                onClick={() => {
                  setDeletingAnniversary(selectedAnniversary);
                  setSelectedAnniversary(null);
                }}
              />
            </View>
          ) : null}
        </View>
      </BottomSheet>
      <BottomSheet
        open={Boolean(achievementDetail)}
        title={achievementDetail?.title ?? '家庭成就'}
        onClose={() => setAchievementDetail(null)}
      >
        <View className={styles.detailSheet}>
          <CuteIconChip
            icon={achievementMark(achievementDetail?.emoji).glyph}
            tone={achievementMark(achievementDetail?.emoji).tone}
          />
          <Text className={styles.detailMeta}>{achievementDetail?.description ?? '每一次陪伴，都值得被记住。'}</Text>
          <PrimaryActionButton label="收下这份共同成就" onClick={() => void grantAchievement()} />
        </View>
      </BottomSheet>
      <BottomSheet
        open={Boolean(conflictTask)}
        title="这件小事有了新变化"
        onClose={() => setConflictTask(null)}
      >
        <View className={styles.detailSheet}>
          <Text className={styles.detailMeta}>
            家人刚刚更新了“{conflictTask?.title ?? '这件事'}”，请重新确认后再完成。
          </Text>
          <SecondaryGlassButton label="知道了" onClick={() => setConflictTask(null)} />
        </View>
      </BottomSheet>
      <BottomSheet
        open={Boolean(selectedTask)}
        title="这件小事"
        onClose={() => setSelectedTask(null)}
      >
        <View className={styles.detailSheet}>
          <Text className={selectedTask?.completedAt ? styles.done : styles.detailName}>
            {selectedTask?.title ?? '共同任务'}
          </Text>
          {selectedTask?.note ? <Text className={styles.detailMeta}>{selectedTask.note}</Text> : null}
          {selectedTask && formatFamilyTaskMeta(selectedTask, taskAssigneeLabel(selectedTask.assignedTo)) ? (
            <Text className={`${styles.detailMeta} ${isFamilyTaskOverdue(selectedTask) ? styles.taskOverdue : ''}`}>
              {formatFamilyTaskMeta(selectedTask, taskAssigneeLabel(selectedTask.assignedTo))}
            </Text>
          ) : null}
          {!selectedTask?.completedAt ? (
            <PrimaryActionButton
              label="一起完成"
              tone="sage"
              onClick={() => {
                if (selectedTask) void complete(selectedTask.id);
                setSelectedTask(null);
              }}
            />
          ) : (
            <Text className={styles.detailMeta}>已经一起完成啦</Text>
          )}
          {selectedTask ? (
            <View className={styles.rowActions}>
              <SecondaryGlassButton label="编辑" onClick={() => { setEditingTask(selectedTask); setSelectedTask(null); }} />
              <SecondaryGlassButton label="删除" onClick={() => { setDeletingTask(selectedTask); setSelectedTask(null); }} />
            </View>
          ) : null}
        </View>
      </BottomSheet>
      <BottomSheet open={Boolean(editingTask)} title="改一改这件小事" onClose={() => setEditingTask(null)}>
        <View className={styles.detailSheet}>
          <GlassInput
            value={editingTask?.title ?? ''}
            placeholder="任务名称"
            onInput={(value) => setEditingTask((task) => (task ? { ...task, title: value } : task))}
          />
          <GlassInput
            value={editingTask?.note ?? ''}
            placeholder="写一句备注（可选）"
            onInput={(value) => setEditingTask((task) => (task ? { ...task, note: value } : task))}
          />
          <Text className={styles.detailLabel}>负责人</Text>
          <View className={styles.choiceRow}>
            <SecondaryGlassButton label="一起完成" fullWidth={false} className={!editingTask?.assignedTo ? styles.choiceActive : undefined} onClick={() => setEditingTask((task) => task ? { ...task, assignedTo: null } : task)} />
            {members.map((member) => (
              <SecondaryGlassButton key={member.id} label={familyMemberLabel(member.relationship, member.nickname)} fullWidth={false} className={editingTask?.assignedTo === (member.userId ?? member.id) ? styles.choiceActive : undefined} onClick={() => setEditingTask((task) => task ? { ...task, assignedTo: member.userId ?? member.id } : task)} />
            ))}
          </View>
          <GlassDateField
            label="日期（可选）"
            value={dueDateInput(editingTask?.dueAt)}
            placeholder="选择日期"
            start="2016-01-01"
            end="2100-12-31"
            onChange={(value) => setEditingTask((task) => (task ? { ...task, dueAt: dueAtFromInput(value) } : task))}
          />
          <Text className={styles.detailLabel}>重复规则</Text>
          <View className={styles.choiceRow}>
            {([['', '不重复'], ['DAILY', '每天'], ['WEEKLY', '每周'], ['MONTHLY', '每月']] as const).map(([value, label]) => (
              <SecondaryGlassButton key={label} label={label} fullWidth={false} className={(editingTask?.repeatRule ?? '') === value ? styles.choiceActive : undefined} onClick={() => setEditingTask((task) => task ? { ...task, repeatRule: value || null } : task)} />
            ))}
          </View>
          <GlassInput
            type="number"
            value={String(editingTask?.experienceReward ?? 0)}
            placeholder="家庭经验（0-100，可选）"
            onInput={(value) => setEditingTask((task) => (task ? { ...task, experienceReward: Number(value) || 0 } : task))}
          />
          <PrimaryActionButton label="保存任务" onClick={() => void saveTaskEdit()} />
        </View>
      </BottomSheet>
      <BottomSheet open={taskOptionsOpen} title="给这件小事添一点细节" onClose={() => setTaskOptionsOpen(false)}>
        <View className={styles.detailSheet}>
          <Text className={styles.detailMeta}>可选信息，不会变成家庭考核。</Text>
          <GlassInput
            value={taskNote}
            placeholder="写一句备注（可选）"
            onInput={setTaskNote}
          />
          <Text className={styles.detailLabel}>负责人</Text>
          <View className={styles.choiceRow}>
            <SecondaryGlassButton
              label="一起完成"
              fullWidth={false}
              className={!taskAssignee ? styles.choiceActive : undefined}
              onClick={() => setTaskAssignee('')}
            />
            {members.map((member) => (
              <SecondaryGlassButton
                key={member.id}
                label={familyMemberLabel(member.relationship, member.nickname)}
                fullWidth={false}
                className={taskAssignee === (member.userId ?? member.id) ? styles.choiceActive : undefined}
                onClick={() => setTaskAssignee(member.userId ?? member.id)}
              />
            ))}
          </View>
          <GlassDateField
            label="日期（可选）"
            value={taskDueDate}
            placeholder="选择日期"
            start="2016-01-01"
            end="2100-12-31"
            onChange={setTaskDueDate}
          />
          <Text className={styles.detailLabel}>重复规则</Text>
          <View className={styles.choiceRow}>
            {([['', '不重复'], ['DAILY', '每天'], ['WEEKLY', '每周'], ['MONTHLY', '每月']] as const).map(([value, label]) => (
              <SecondaryGlassButton
                key={label}
                label={label}
                fullWidth={false}
                className={taskRepeatRule === value ? styles.choiceActive : undefined}
                onClick={() => setTaskRepeatRule(value)}
              />
            ))}
          </View>
          <GlassInput
            type="number"
            value={taskExperienceReward}
            placeholder="家庭经验（0-100，可选）"
            onInput={setTaskExperienceReward}
          />
          <PrimaryActionButton label="保存任务细节" onClick={() => setTaskOptionsOpen(false)} />
        </View>
      </BottomSheet>
      <ConfirmDialog
        open={Boolean(deletingTask)}
        title="删除这件小事？"
        message={`“${deletingTask?.title ?? '这件事'}”将从家庭任务中移除。`}
        confirmLabel="确认删除"
        cancelLabel="先留着"
        danger
        onCancel={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) void removeTask(deletingTask);
          setDeletingTask(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(deletingAnniversary)}
        title="删除这个纪念日？"
        message={`“${deletingAnniversary?.title ?? '这个日子'}”将从家庭纪念日中移除。`}
        confirmLabel="确认删除"
        cancelLabel="先留着"
        danger
        onCancel={() => setDeletingAnniversary(null)}
        onConfirm={() => {
          if (deletingAnniversary) void removeAnniversary(deletingAnniversary);
          setDeletingAnniversary(null);
        }}
      />
    </View>
  );
}
