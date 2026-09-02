import { Text, View } from '@tarojs/components';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import {
  BOTTLE_MAX_ML,
  BOTTLE_MIN_ML,
  BOTTLE_PRESET_ML,
  BOTTLE_STEP_ML,
  stepAmount,
} from '@/utils/amountStep';
import classNames from '@/utils/classNames';
import styles from './forms.module.scss';

export interface AmountStepperProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  presets?: readonly number[];
}

export function AmountStepper({
  label = '毫升',
  value,
  onChange,
  step = BOTTLE_STEP_ML,
  min = BOTTLE_MIN_ML,
  max = BOTTLE_MAX_ML,
  unit = 'ml',
  presets = BOTTLE_PRESET_ML,
}: AmountStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View className={styles.stepper}>
      {label ? <Text className={styles.label}>{label}</Text> : null}
      <View className={styles.stepperRow}>
        <View
          className={classNames(styles.stepHit, atMin ? styles.stepHitDisabled : undefined)}
          role="button"
          aria-label={`减少 ${step} 毫升`}
          aria-disabled={atMin}
          onClick={() => {
            if (!atMin) onChange(stepAmount(value, -step, min, max));
          }}
        >
          <GlassSurface level="control" radius="floating" interactive={!atMin} className={styles.stepBtn}>
            <Glyph name="minus" size="md" />
          </GlassSurface>
        </View>
        <GlassSurface level="tinted" tone="apricot" radius="hero" className={styles.valueCard}>
          <View className={styles.valueHit} aria-label={`当前 ${value} 毫升`}>
            <Text className={styles.valueNumber}>{value}</Text>
            <Text className={styles.valueUnit}>{unit}</Text>
          </View>
        </GlassSurface>
        <View
          className={classNames(styles.stepHit, atMax ? styles.stepHitDisabled : undefined)}
          role="button"
          aria-label={`增加 ${step} 毫升`}
          aria-disabled={atMax}
          onClick={() => {
            if (!atMax) onChange(stepAmount(value, step, min, max));
          }}
        >
          <GlassSurface level="control" radius="floating" interactive={!atMax} className={styles.stepBtn}>
            <Glyph name="plus" size="md" />
          </GlassSurface>
        </View>
      </View>
      <View className={styles.presets}>
        {presets.map((preset) => (
          <View
            key={preset}
            className={classNames(
              styles.chip,
              'glass-control',
              value === preset ? styles.chipSelected : undefined,
            )}
            role="button"
            aria-pressed={value === preset}
            aria-label={`${preset} 毫升`}
            onClick={() => onChange(preset)}
          >
            <Text>{preset}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
