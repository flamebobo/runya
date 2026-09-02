import { describe, expect, it } from 'vitest';
import { BOTTLE_DEFAULT_ML, BOTTLE_MAX_ML, BOTTLE_MIN_ML, stepAmount } from './amountStep';

describe('stepAmount', () => {
  it('uses 120 as the product default tick', () => {
    expect(BOTTLE_DEFAULT_ML).toBe(120);
    expect(stepAmount(BOTTLE_DEFAULT_ML, 30)).toBe(150);
    expect(stepAmount(BOTTLE_DEFAULT_ML, -30)).toBe(90);
  });

  it('clamps to the bottle range', () => {
    expect(stepAmount(BOTTLE_MIN_ML, -30)).toBe(BOTTLE_MIN_ML);
    expect(stepAmount(BOTTLE_MAX_ML, 30)).toBe(BOTTLE_MAX_ML);
  });
});
