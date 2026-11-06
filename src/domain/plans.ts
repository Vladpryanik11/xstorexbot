import { escapeHtml } from './html.js';
import { formatRub, monthlyPriceRub } from './money.js';

/** `priceRub` в копейках, как поле `Plan.priceRub` в базе. */
export type PlanView = { id: number; days: number; priceRub: number; priceStars: number | null };

export function planButtonLabel(plan: PlanView): string {
  return `${plan.days} дней — ${formatRub(plan.priceRub)}`;
}

/** HTML для `parse_mode: 'HTML'`. */
export function planScreenText(plan: PlanView, offerUrl: string): string {
  const perMonth =
    plan.days > 30
      ? ` (${formatRub(monthlyPriceRub(plan.priceRub, plan.days) * 100)} в месяц)`
      : '';
  return (
    `Подписка: ${plan.days} дней\n` +
    `Стоимость: ${formatRub(plan.priceRub)}${perMonth}\n\n` +
    `Оплачивая, вы принимаете условия <a href="${escapeHtml(offerUrl)}">оферты</a>.`
  );
}
