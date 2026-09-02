import { Text, View } from '@tarojs/components';
import type { SyncConflictInfo } from '@runew/contracts';
import type { DiaperType } from '@runew/domain-types';
import { SecondaryGlassButton, PrimaryActionButton } from '@/components/buttons';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import styles from './SyncDialogs.module.scss';

const DIAPER_LABELS: Record<DiaperType, string> = {
  WET: '湿',
  DIRTY: '便',
  BOTH: '湿+便',
  DRY: '干',
};

function valueLabel(field: string, value: unknown): string {
  if (value == null || value === '') return '（空）';
  if (field === 'diaperType') return DIAPER_LABELS[value as DiaperType] ?? String(value);
  if (field === 'recordedAt') {
    const date = new Date(value as number);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return String(value);
}

export interface ConflictDialogProps {
  conflict: SyncConflictInfo | null;
  onResolve: (conflict: SyncConflictInfo, choice: 'KEEP_SERVER' | 'KEEP_CLIENT') => void;
}

// 同一字段两边都改了 → 用户选择保留哪一边。
// 禁止静默覆盖：无论选哪边，另一边的值都明确展示出来。
export function ConflictDialog({ conflict, onResolve }: ConflictDialogProps) {
  if (!conflict) return null;
  const fields = conflict.conflictFields.length > 0 ? conflict.conflictFields : ['内容'];

  return (
    <View className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="同一处改了两次">
      <View className={styles.backdrop} />
      <GlassSurface level="floating" radius="floating" className={styles.card}>
        <Text className={styles.title}>同一处改了两次</Text>
        <Text className={styles.description}>
          这条记录的两边都被修改过，选一个想留下的版本。另一边不会消失，会回到最近删除。
        </Text>
        {fields.map((field) => (
          <View key={field} className={styles.fieldPair}>
            <View className={styles.fieldOption}>
              <Text className={styles.fieldTag}>本机</Text>
              <Text className={styles.fieldValue}>
                {valueLabel(field, conflict.clientPatch[field as keyof typeof conflict.clientPatch])}
              </Text>
            </View>
            <View className={styles.fieldOption}>
              <Text className={styles.fieldTag}>另一台设备</Text>
              <Text className={styles.fieldValue}>
                {valueLabel(field, conflict.serverSnapshot[field as keyof typeof conflict.serverSnapshot])}
              </Text>
            </View>
          </View>
        ))}
        <View className={styles.actions}>
          <SecondaryGlassButton
            label="保留另一台设备的"
            fullWidth={false}
            onClick={() => onResolve(conflict, 'KEEP_SERVER')}
          />
          <PrimaryActionButton
            label="保留本机的"
            fullWidth={false}
            onClick={() => onResolve(conflict, 'KEEP_CLIENT')}
          />
        </View>
      </GlassSurface>
    </View>
  );
}

export interface DuplicateDialogProps {
  open: boolean;
  pair: { candidateId: string; summaryA: string; summaryB: string } | null;
  onResolve: (candidateId: string, resolution: 'MERGE' | 'KEEP_BOTH', canonical: 'A' | 'B') => void;
  onClose: () => void;
}

// 同一时间段的相似记录：合并或都保留，绝不静默删除（AGENTS §28）。
export function DuplicateDialog({ open, pair, onResolve, onClose }: DuplicateDialogProps) {
  if (!open || !pair) return null;

  return (
    <View className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="可能记重复了">
      <View className={styles.backdrop} onClick={onClose} />
      <GlassSurface level="floating" radius="floating" className={styles.card}>
        <Text className={styles.title}>可能记重复了</Text>
        <Text className={styles.description}>
          两条记录挨得很近，可能是同一件事。可以合并成一条，也可以都留下来。
        </Text>
        <View className={styles.duplicatePair}>
          <View className={styles.fieldOption}>
            <Text className={styles.fieldTag}>这一条</Text>
            <Text className={styles.fieldValue}>{pair.summaryA}</Text>
          </View>
          <View className={styles.fieldOption}>
            <Text className={styles.fieldTag}>那一条</Text>
            <Text className={styles.fieldValue}>{pair.summaryB}</Text>
          </View>
        </View>
        <View className={styles.actions}>
          <SecondaryGlassButton label="都保留" fullWidth={false} onClick={() => onResolve(pair.candidateId, 'KEEP_BOTH', 'A')} />
          <PrimaryActionButton
            label={`合并，留下「${pair.summaryA}」`}
            fullWidth={false}
            onClick={() => onResolve(pair.candidateId, 'MERGE', 'A')}
          />
        </View>
        <Text className={styles.mergeNote}>合并后另一条会进入最近删除，30 天内可找回。</Text>
      </GlassSurface>
    </View>
  );
}

export interface DeletionDialogProps {
  notice: { operationId: string; entityType: string; entityId: string } | null;
  onRestore: (notice: { operationId: string; entityType: string; entityId: string }) => void;
  onDiscard: (notice: { operationId: string; entityType: string; entityId: string }) => void;
}

// 对端已删除 vs 本机离线修改：不自动复活，也不丢本机修改，交给用户决策。
export function DeletionDialog({ notice, onRestore, onDiscard }: DeletionDialogProps) {
  if (!notice) return null;

  return (
    <View className={styles.overlay} role="alertdialog" aria-modal="true" aria-label="这条记录刚被删掉了">
      <View className={styles.backdrop} />
      <GlassSurface level="floating" radius="floating" className={styles.card}>
        <Text className={styles.title}>这条记录刚被删掉了</Text>
        <Text className={styles.description}>
          家里的另一位成员在别处删除了这条记录，而你这边刚刚改过它。想怎么处理？
        </Text>
        <View className={styles.actions}>
          <SecondaryGlassButton label="放弃我的修改" fullWidth={false} onClick={() => onDiscard(notice)} />
          <PrimaryActionButton label="恢复这条记录" fullWidth={false} onClick={() => onRestore(notice)} />
        </View>
      </GlassSurface>
    </View>
  );
}
