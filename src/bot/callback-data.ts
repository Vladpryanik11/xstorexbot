export type MenuAction = 'start' | 'buy' | 'about' | 'my' | 'plans';

export const cb = {
  menu: (a: MenuAction): string => `menu:${a}`,
  plan: (id: number): string => `plan:${id}`,
};

/** `plan:2` → 2; всё остальное (мусор, ноль, минус, дробь, слишком большое) → null. */
export function parsePlanId(data: string): number | null {
  const m = /^plan:(\d+)$/.exec(data);
  if (!m?.[1]) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
