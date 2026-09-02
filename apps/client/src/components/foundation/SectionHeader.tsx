import { View, Text } from '@tarojs/components';
import { TextAction } from '@/components/buttons';
import styles from './SectionHeader.module.scss';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  caption?: string;
}

export function SectionHeader({ title, actionLabel, onAction, caption }: SectionHeaderProps) {
  return (
    <View className={styles.root}>
      <View className={styles.main}>
        <Text className={styles.title}>{title}</Text>
        {caption ? <Text className={styles.caption}>{caption}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TextAction label={actionLabel} onClick={onAction} />
      ) : null}
    </View>
  );
}
