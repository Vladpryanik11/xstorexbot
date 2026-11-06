/** Копейки в рубли целым числом без разделителей тысяч: `1170 ₽`. */
export function formatRub(kopecks: number): string {
  return `${Math.round(kopecks / 100)} ₽`;
}

/** Цена за 30 дней в рублях, округлённая до целого. */
export function monthlyPriceRub(priceKopecks: number, days: number): number {
  return Math.round(((priceKopecks / 100) * 30) / days);
}
