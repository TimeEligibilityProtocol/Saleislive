export interface Money {
  amountMinor: number;
  currency: string;
}

export function money(amountMinor: number, currency: string): Money {
  return { amountMinor, currency };
}
