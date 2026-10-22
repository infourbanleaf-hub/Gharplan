import { describe, it, expect } from 'vitest';
import { formatLength, parseFeetInches, feetToMetres } from '../engine/units';

describe('units', () => {
  it('formats feet-inches', () => {
    expect(formatLength(30)).toBe("30'-0\"");
    expect(formatLength(3.5)).toBe("3'-6\"");
    expect(formatLength(12.25)).toBe("12'-3\"");
  });
  it('formats metres', () => {
    expect(formatLength(30, 'm')).toBe('9.14 m');
    expect(feetToMetres(3.28084)).toBeCloseTo(1, 6);
  });
  it('parses feet-inches entries', () => {
    expect(parseFeetInches("12'-6\"")).toBe(12.5);
    expect(parseFeetInches("12'6")).toBe(12.5);
    expect(parseFeetInches('12 ft 6 in')).toBe(12.5);
    expect(parseFeetInches('12.5')).toBe(12.5);
    expect(parseFeetInches('12 in 13')).toBeNull();
    expect(parseFeetInches('abc')).toBeNull();
  });
});
