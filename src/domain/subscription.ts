const DAY_MS = 24 * 60 * 60 * 1000;

/** Новый конец подписки: от текущего конца, если он в будущем, иначе от `now`, плюс `days` суток. */
export function extendEndsAt(current: Date | null, now: Date, days: number): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + days * DAY_MS);
}
