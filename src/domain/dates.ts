const mskDate = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Дата для покупателя: ДД.ММ.ГГГГ по московскому времени. */
export function formatDateMsk(date: Date): string {
  return mskDate.format(date);
}
