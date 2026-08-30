import { describe, it, expect } from 'vitest';
import { Money } from './money.js';

// Money is the invariant the whole payment path rests on: every amount is an
// integer number of paise. These tests exist so a refactor can't quietly
// reintroduce floating-point rupees.
describe('Money', () => {
  it('converts rupees to integer paise', () => {
    expect(Money.fromRupees(500)).toBe(50000);
    expect(Money.fromRupees(0)).toBe(0);
    expect(Money.fromRupees(0.01)).toBe(1);
  });

  it('rounds rather than truncating, so a paise is never silently lost', () => {
    expect(Money.fromRupees(10.005)).toBe(1001);
    expect(Money.fromRupees(10.004)).toBe(1000);
  });

  it('survives values that float arithmetic gets wrong', () => {
    // 19.99 * 100 === 1998.9999999999998 in IEEE-754.
    expect(Money.fromRupees(19.99)).toBe(1999);
    expect(Money.fromRupees(1.1)).toBe(110);
    expect(Money.fromRupees(2.9)).toBe(290);
  });

  it('round-trips a price back to rupees', () => {
    expect(Money.toRupees(Money.fromRupees(1399.99))).toBeCloseTo(1399.99, 2);
  });

  it('formats with two decimals', () => {
    expect(Money.format(50000)).toBe('₹500.00');
    expect(Money.format(1)).toBe('₹0.01');
  });

  it('only accepts non-negative integers as valid paise', () => {
    expect(Money.isValid(100)).toBe(true);
    expect(Money.isValid(0)).toBe(true);
    expect(Money.isValid(10.5)).toBe(false);
    expect(Money.isValid(-1)).toBe(false);
    expect(Money.isValid('100')).toBe(false);
    expect(Money.isValid(NaN)).toBe(false);
  });
});
