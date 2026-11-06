import { redactSecrets } from './logger.js';

/** Печатает только сообщение ошибки (без стека и объекта) с замаскированными секретами. */
export function reportFatal(err: unknown, secrets: string[]): void {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Ошибка запуска: ${redactSecrets(message, secrets)}\n`);
}
