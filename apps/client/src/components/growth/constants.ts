import type { GrowthMetric } from '@runew/contracts';
import type { SemanticTone } from '@runew/domain-types';

export interface GrowthMetricDefinition {
  key: GrowthMetric;
  label: string;
  shortLabel: string;
  unit: 'cm' | 'kg';
  field: 'heightCm' | 'weightKg' | 'headCircumferenceCm';
  tone: SemanticTone;
  color: string;
}

export const GROWTH_METRICS: Record<GrowthMetric, GrowthMetricDefinition> = {
  height: {
    key: 'height',
    label: '身高趋势',
    shortLabel: '身高',
    unit: 'cm',
    field: 'heightCm',
    tone: 'sage',
    color: '#5c9466',
  },
  weight: {
    key: 'weight',
    label: '体重趋势',
    shortLabel: '体重',
    unit: 'kg',
    field: 'weightKg',
    tone: 'apricot',
    color: '#e87d38',
  },
  head: {
    key: 'head',
    label: '头围趋势',
    shortLabel: '头围',
    unit: 'cm',
    field: 'headCircumferenceCm',
    tone: 'lavender',
    color: '#8c73c7',
  },
};

export function formatGrowthDate(timestamp: number, withTime = false) {
  const date = new Date(timestamp);
  const day = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (!withTime) return day;
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatGrowthValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split('-');
  return `${year}年${Number(monthNumber)}月`;
}
