import { Input, Textarea, View, Text } from '@tarojs/components';
import classNames from '@/utils/classNames';
import styles from './forms.module.scss';

export interface GlassInputProps {
  label?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onInput?: (value: string) => void;
}

export function GlassInput({
  label,
  value,
  placeholder,
  disabled,
  onInput,
}: GlassInputProps) {
  return (
    <View className={styles.field}>
      {label ? <Text className={styles.label}>{label}</Text> : null}
      <Input
        className={classNames(styles.control, disabled ? styles.disabled : undefined)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label ?? placeholder}
        onInput={(event) => onInput?.(event.detail.value)}
      />
    </View>
  );
}

export function GlassTextArea({
  label,
  value,
  placeholder,
  disabled,
  onInput,
}: GlassInputProps) {
  return (
    <View className={styles.field}>
      {label ? <Text className={styles.label}>{label}</Text> : null}
      <Textarea
        className={classNames(styles.control, styles.textarea, disabled ? styles.disabled : undefined)}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label ?? placeholder}
        onInput={(event) => onInput?.(event.detail.value)}
      />
    </View>
  );
}

export interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange?: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View className={styles.segmented} role="tablist">
      {options.map((option) => (
        <View
          key={option.value}
          className={classNames(
            styles.segment,
            value === option.value ? styles.segmentActive : undefined,
          )}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange?.(option.value)}
        >
          <Text>{option.label}</Text>
        </View>
      ))}
    </View>
  );
}

export interface FilterChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function FilterChip({ label, selected, disabled, onClick }: FilterChipProps) {
  return (
    <View
      className={classNames(
        styles.chip,
        selected ? styles.chipSelected : undefined,
        disabled ? styles.disabled : undefined,
      )}
      role="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <Text>{label}</Text>
    </View>
  );
}
