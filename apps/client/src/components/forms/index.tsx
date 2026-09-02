import { Input, Picker, Textarea, View, Text } from '@tarojs/components';
import classNames from '@/utils/classNames';
import { Glyph } from '@/components/icons/Glyph';
import { formatBirthdayLabel, todayIsoDate } from '@/utils/babyAge';
import styles from './forms.module.scss';

export interface GlassInputProps {
  label?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  password?: boolean;
  error?: boolean;
  onInput?: (value: string) => void;
}

export function GlassInput({
  label,
  value,
  placeholder,
  disabled,
  password = false,
  error = false,
  onInput,
}: GlassInputProps) {
  return (
    <View className={styles.field}>
      {label ? <Text className={styles.label}>{label}</Text> : null}
      <Input
        className={classNames(
          styles.control,
          'glass-control',
          disabled ? styles.disabled : undefined,
          error ? styles.controlError : undefined,
        )}
        value={value}
        password={password}
        placeholder={placeholder}
        placeholderStyle="color: #8D7D70"
        disabled={disabled}
        aria-label={label ?? placeholder}
        aria-invalid={error}
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
        className={classNames(
          styles.control,
          styles.textarea,
          'glass-control',
          disabled ? styles.disabled : undefined,
        )}
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
    <View className={classNames(styles.segmented, 'glass-control')} role="tablist">
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
        'glass-control',
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

export interface GlassDateFieldProps {
  label?: string;
  value?: string;
  placeholder?: string;
  error?: boolean;
  start?: string;
  end?: string;
  onChange?: (value: string) => void;
}

export function GlassDateField({
  label,
  value,
  placeholder = '点这里选择日期',
  error = false,
  start = '2016-01-01',
  end,
  onChange,
}: GlassDateFieldProps) {
  const pickerValue = value || todayIsoDate();
  const display = value ? formatBirthdayLabel(value) : placeholder;

  return (
    <View className={styles.field}>
      {label ? <Text className={styles.label}>{label}</Text> : null}
      <Picker
        mode="date"
        value={pickerValue}
        start={start}
        end={end ?? todayIsoDate()}
        onChange={(event) => onChange?.(event.detail.value)}
      >
        <View
          className={classNames(
            styles.dateControl,
            'glass-control',
            error ? styles.controlError : undefined,
          )}
          role="button"
          aria-label={label ?? '选择日期'}
          aria-invalid={error}
        >
          <Text className={value ? styles.dateValue : styles.datePlaceholder}>{display}</Text>
          <View className={styles.dateChevron} aria-hidden>
            <Glyph name="chevron" size="sm" />
          </View>
        </View>
      </Picker>
    </View>
  );
}
