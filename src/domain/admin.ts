import { texts } from '../texts.js';
import { formatDateMsk } from './dates.js';
import { formatRub } from './money.js';
import type { PlanView } from './plans.js';

export type SubscriberQuery = { id: number } | { username: string };

/** Telegram ID (до 15 цифр) или @username (4–32 символа). */
export function parseSubscriberQuery(text: string): SubscriberQuery | null {
  const t = text.trim();
  if (/^\d{1,15}$/.test(t)) return { id: Number(t) };
  if (/^@?[A-Za-z0-9_]{4,32}$/.test(t)) return { username: t.replace(/^@/, '') };
  return null;
}

/** Целое число суток 1…3650. */
export function parseDays(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 3650 ? n : null;
}

/** Целые рубли 1…1 000 000 (допустимы пробелы внутри числа) в копейки. */
export function parseRubToKopecks(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(?: \d+)*$/.test(t)) return null;
  const rub = Number(t.replace(/ /g, ''));
  return rub >= 1 && rub <= 1_000_000 ? rub * 100 : null;
}

/** `-` сбрасывает цену в звёздах; иначе целое 1…100 000. */
export function parseStars(text: string): number | null | 'clear' {
  const t = text.trim();
  if (t === '-') return 'clear';
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 100_000 ? n : null;
}

/** «Название | https://адрес»: делится по первому `|`. */
export function parseButton(text: string): { text: string; url: string } | null {
  const i = text.indexOf('|');
  if (i < 0) return null;
  const label = text.slice(0, i).trim();
  const url = text.slice(i + 1).trim();
  if (label.length < 1 || [...label].length > 64) return null;
  if (!/^https:\/\/\S+$/.test(url)) return null;
  return { text: label, url };
}

export type PlanAdminView = PlanView & { enabled: boolean };

export function planAdminLine(p: PlanAdminView): string {
  const stars = p.priceStars === null ? texts.admin.starsNotSet : String(p.priceStars);
  const state = p.enabled ? texts.admin.planEnabled : texts.admin.planHidden;
  return `${p.days} дней · ${formatRub(p.priceRub)} · ⭐ ${stars} · ${state}`;
}

export type PaymentLine = {
  createdAt: Date;
  provider: 'PLATEGA' | 'STARS' | 'MANUAL';
  amount: number;
  currency: 'RUB' | 'XTR';
  status: 'PENDING' | 'PAID' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | 'CHARGEBACK';
};

export type SubscriberCard = {
  id: number;
  firstName: string;
  username: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  blockedAt: Date | null;
  endsAt: Date | null;
  payments: PaymentLine[];
};

function paymentLineText(p: PaymentLine): string {
  const amount = p.currency === 'XTR' ? `${p.amount} ⭐` : formatRub(p.amount);
  return [
    formatDateMsk(p.createdAt),
    texts.admin.providers[p.provider],
    amount,
    texts.admin.paymentStatuses[p.status],
  ].join(' · ');
}

export function subscriberCardText(card: SubscriberCard, now: Date): string {
  const a = texts.admin;
  const title =
    card.username === null
      ? a.noUsername(card.firstName, card.id)
      : a.withUsername(card.firstName, card.username, card.id);
  const subscription =
    card.endsAt === null
      ? a.noSubscription
      : card.endsAt.getTime() > now.getTime()
        ? a.subscriptionActive(formatDateMsk(card.endsAt))
        : a.subscriptionExpired(formatDateMsk(card.endsAt));
  const payments =
    card.payments.length === 0
      ? a.noPayments
      : `${a.paymentsTitle}\n${card.payments.map(paymentLineText).join('\n')}`;
  return [
    title,
    a.visits(formatDateMsk(card.createdAt), formatDateMsk(card.lastSeenAt)),
    subscription,
    a.blockedBot(card.blockedAt !== null),
    '',
    payments,
  ].join('\n');
}

export type BaseStats = { users: number; reachable: number; blocked: number; active: number };

export function baseStatsText(s: BaseStats): string {
  return texts.admin.stats(s);
}
