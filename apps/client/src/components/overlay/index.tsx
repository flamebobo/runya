import { View, Text } from '@tarojs/components';
import { PrimaryActionButton, SecondaryGlassButton } from '@/components/buttons';
import { Glyph } from '@/components/icons/Glyph';
import styles from './BottomSheet.module.scss';

export interface BottomSheetProps {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

export function BottomSheet({ open, title, children, onClose }: BottomSheetProps) {
  if (!open) return null;

  return (
    <View className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <View className={styles.backdrop} onClick={onClose} />
      <View className={styles.sheet}>
        <View className={styles.handle} aria-hidden />
        <View className={styles.header}>
          <Text className={styles.title}>{title}</Text>
          {onClose ? (
            <View className={styles.close} role="button" aria-label="收起" onClick={onClose}>
              <Glyph name="close" size="sm" />
            </View>
          ) : null}
        </View>
        <View className={styles.content}>{children}</View>
      </View>
    </View>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <View className={styles.dialogOverlay} role="alertdialog" aria-modal="true" aria-label={title}>
      <View className={styles.backdrop} onClick={onCancel} />
      <View className={styles.dialog}>
        <Text className={styles.dialogTitle}>{title}</Text>
        <Text className={styles.dialogMessage}>{message}</Text>
        <View className={styles.actions}>
          <SecondaryGlassButton label={cancelLabel} onClick={onCancel} fullWidth={false} />
          {danger ? (
            <PrimaryActionButton
              label={confirmLabel}
              tone="blush"
              onClick={onConfirm}
              fullWidth={false}
            />
          ) : (
            <PrimaryActionButton
              label={confirmLabel}
              onClick={onConfirm}
              fullWidth={false}
            />
          )}
        </View>
      </View>
    </View>
  );
}

export { AddMomentOverlay } from './AddMomentOverlay';
