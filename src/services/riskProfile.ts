/**
 * Risk-tolerance → default risk-per-trade mapping.
 *
 * `TradingPsychologySettings.riskToleranceLevel` used to be stored and then
 * never read by anything: the Risk Calculator always opened at 1 % no matter
 * what the user picked. This module is the single place that turns the
 * preference into a *suggestion* for the calculator's input.
 *
 * It is deliberately a UI default only — nothing here places orders or
 * overrides a value the user typed.
 */

export type RiskToleranceLevel = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';

/** Suggested risk per trade (percent of account) for each tolerance level. */
export const RISK_PROFILE_DEFAULT_PCT: Record<RiskToleranceLevel, string> = {
  CONSERVATIVE: '0.5',
  MODERATE: '1',
  AGGRESSIVE: '2',
};

/** Thai labels for the settings dropdown / captions. */
export const RISK_PROFILE_LABEL_TH: Record<RiskToleranceLevel, string> = {
  CONSERVATIVE: 'ระวังสูง (0.5% ต่อไม้)',
  MODERATE: 'สมดุล (1% ต่อไม้)',
  AGGRESSIVE: 'รับความเสี่ยงได้ (2% ต่อไม้)',
};

/** Narrow an unknown value (stored JSON, cast from a select) to a valid level. */
export function parseRiskToleranceLevel(value: unknown): RiskToleranceLevel {
  return value === 'CONSERVATIVE' || value === 'AGGRESSIVE' || value === 'MODERATE'
    ? value
    : 'MODERATE';
}

/** Default value for the calculator's risk% input, as a string for <input>. */
export function defaultRiskPercentForProfile(level: unknown): string {
  return RISK_PROFILE_DEFAULT_PCT[parseRiskToleranceLevel(level)];
}
