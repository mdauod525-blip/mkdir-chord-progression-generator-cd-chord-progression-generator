import { describe, expect, it } from 'vitest';
import { compactUsd, label, pct, scoreTone, usd } from '../src/lib/format';
import { qs } from '../src/lib/api';

describe('format', () => {
  it('formats money and percentages', () => {
    expect(usd(1234.5)).toBe('$1,235');
    expect(usd(null)).toBe('—');
    expect(compactUsd(1_250_000)).toBe('$1.3M');
    expect(compactUsd(-42_000)).toBe('-$42k');
    expect(pct(12.345)).toBe('12.3%');
    expect(label('fix_and_flip')).toBe('Fix and flip');
  });
  it('maps scores to tones per the deal bands', () => {
    expect(scoreTone(92)).toBe('good');
    expect(scoreTone(75)).toBe('accent');
    expect(scoreTone(65)).toBe('warn');
    expect(scoreTone(40)).toBe('bad');
    expect(scoreTone(80, true)).toBe('neutral');
  });
  it('builds query strings without empty values', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: false })).toBe('?a=1&d=false');
  });
});
