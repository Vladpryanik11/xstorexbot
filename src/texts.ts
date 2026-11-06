export const texts = {
  buttons: {
    buy: 'Купить подписку',
    catalog: 'Каталог',
    reviews: 'Отзывы',
    about: 'О сервисе',
    support: 'Поддержка',
    mySubscription: 'Моя подписка',
    back: '‹ Назад',
  },
  subscriptionActiveUntil: (date: string) => `Подписка активна до ${date}`,
  planListTitle: 'Выберите срок подписки:',
  noPlans: 'Сейчас нет доступных тарифов. Напишите в поддержку.',
  paySupport: 'По вопросам оплаты и возврата напишите в поддержку.',
  terms: (url: string) => `Оферта сервиса: ${url}`,
  staleButton: 'Кнопка устарела, нажмите /start',
  genericError: 'Что-то пошло не так, попробуйте ещё раз.',
  admin: {
    planEnabled: 'включён',
    planHidden: 'скрыт',
    starsNotSet: 'не задана',
    noUsername: (firstName: string, id: number) => `${firstName}, ID ${id}`,
    withUsername: (firstName: string, username: string, id: number) =>
      `${firstName} (@${username}), ID ${id}`,
    visits: (first: string, last: string) => `Первый визит: ${first}, последний: ${last}`,
    subscriptionActive: (date: string) => `Подписка до ${date}`,
    subscriptionExpired: (date: string) => `Подписка закончилась ${date}`,
    noSubscription: 'Подписки нет',
    blockedBot: (blocked: boolean) => `Заблокировал бота: ${blocked ? 'да' : 'нет'}`,
    paymentsTitle: 'Платежи:',
    noPayments: 'Платежей нет',
    providers: { PLATEGA: 'Platega', STARS: 'Stars', MANUAL: 'вручную' },
    paymentStatuses: {
      PENDING: 'ожидает',
      PAID: 'оплачен',
      CANCELED: 'отменён',
      EXPIRED: 'истёк',
      REFUNDED: 'возвращён',
      CHARGEBACK: 'чарджбэк',
    },
    stats: (s: { users: number; reachable: number; blocked: number; active: number }) =>
      `Пользователей: ${s.users}
Получат рассылку: ${s.reachable}
` +
      `Заблокировали бота: ${s.blocked}
С активной подпиской: ${s.active}`,
  },
} as const;
