import { escapeHtml } from './html.js';
import { formatRub, monthlyPriceRub } from './money.js';

/** `priceRub` в копейках, как поле `Plan.priceRub` в базе. */
export type PlanView = { id: number; days: number; priceRub: number; priceStars: number | null };

/** «490 ₽/мес. — 30 дней»; выгодный тариф помечен звездой. */
export function planButtonLabel(plan: PlanView, best: boolean): string {
  const perMonth = formatRub(monthlyPriceRub(plan.priceRub, plan.days) * 100);
  return `${best ? '⭐ ' : ''}${perMonth}/мес. — ${plan.days} дней`;
}

/** Тариф с наименьшей ценой за день (при равенстве — более длинный); null, если тарифов меньше двух. */
export function bestPlanId(plans: readonly PlanView[]): number | null {
  if (plans.length < 2) return null;
  let best = plans[0] as PlanView;
  for (const plan of plans.slice(1)) {
    // Сравнение цены за день без деления: plan.priceRub / plan.days против best.priceRub / best.days.
    const diff = plan.priceRub * best.days - best.priceRub * plan.days;
    if (diff < 0 || (diff === 0 && plan.days > best.days)) best = plan;
  }
  return best.id;
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
