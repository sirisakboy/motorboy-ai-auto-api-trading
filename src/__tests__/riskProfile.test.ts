import { describe, it, expect } from 'vitest';
import {
  RISK_PROFILE_DEFAULT_PCT,
  defaultRiskPercentForProfile,
  parseRiskToleranceLevel,
} from '../services/riskProfile';

describe('riskProfile', () => {
  it('maps each tolerance level to a risk% that stays within the 2% guideline', () => {
    expect(defaultRiskPercentForProfile('CONSERVATIVE')).toBe('0.5');
    expect(defaultRiskPercentForProfile('MODERATE')).toBe('1');
    expect(defaultRiskPercentForProfile('AGGRESSIVE')).toBe('2');
    for (const value of Object.values(RISK_PROFILE_DEFAULT_PCT)) {
      expect(Number(value)).toBeGreaterThan(0);
      expect(Number(value)).toBeLessThanOrEqual(2);
    }
  });

  it('falls back to MODERATE for junk stored values', () => {
    expect(parseRiskToleranceLevel('YOLO')).toBe('MODERATE');
    expect(parseRiskToleranceLevel(undefined)).toBe('MODERATE');
    expect(parseRiskToleranceLevel(42)).toBe('MODERATE');
    expect(defaultRiskPercentForProfile(null)).toBe('1');
  });
});
