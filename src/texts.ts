export const texts = {
  buttons: {
    buy: 'Купить подписку',
    catalog: 'Каталог приложений',
    reviews: 'Отзывы',
    about: 'О сервисе',
    support: 'Поддержка',
    mySubscription: 'Моя подписка',
    back: 'Назад',
  },
  subscriptionActiveUntil: (date: string) => `Подписка активна до ${date}`,
  planListTitle: 'Выберите срок подписки:',
  noPlans: 'Сейчас нет доступных тарифов. Напишите в поддержку.',
  paySupport: 'По вопросам оплаты и возврата напишите в поддержку.',
  terms: (url: string) => `Оферта сервиса: ${url}`,
  staleButton: 'Кнопка устарела, нажмите /start',
  genericError: 'Что-то пошло не так, попробуйте ещё раз.',
} as const;
