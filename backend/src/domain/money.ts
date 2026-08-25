// Money value object. INVARIANT: money is always an integer number of paise.
// ₹500 => 50000. Never use floats for money in logic.

export type Paise = number;

export const Money = {
  fromRupees(rupees: number): Paise {
    return Math.round(rupees * 100);
  },
  toRupees(paise: Paise): number {
    return paise / 100;
  },
  format(paise: Paise): string {
    return `₹${(paise / 100).toFixed(2)}`;
  },
  isValid(paise: unknown): paise is Paise {
    return typeof paise === 'number' && Number.isInteger(paise) && paise >= 0;
  },
};
