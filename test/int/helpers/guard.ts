/** Защита от запуска миграций и TRUNCATE на рабочей базе: имя базы обязано оканчиваться на `_test`. */
export function assertTestDatabase(url: string): void {
  let dbName: string;
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL_TEST не является корректным URL');
  }
  if (!dbName.endsWith('_test')) {
    throw new Error(
      'DATABASE_URL_TEST должен указывать на базу, имя которой оканчивается на _test',
    );
  }
}
