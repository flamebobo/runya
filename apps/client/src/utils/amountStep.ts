export const BOTTLE_DEFAULT_ML = 120;
export const BOTTLE_STEP_ML = 30;
export const BOTTLE_MIN_ML = 30;
export const BOTTLE_MAX_ML = 600;
export const BOTTLE_PRESET_ML = [90, 120, 150, 180] as const;

export function stepAmount(
  value: number,
  delta: number,
  min = BOTTLE_MIN_ML,
  max = BOTTLE_MAX_ML,
): number {
  return Math.min(max, Math.max(min, value + delta));
}
