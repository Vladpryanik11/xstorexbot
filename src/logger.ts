import { Writable } from 'node:stream';
import { type Logger, pino } from 'pino';

export type { Logger };

const MASK = '[скрыто]';

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join(MASK);
  }
  return out;
}

export function createLogger(
  secrets: string[],
  destination: NodeJS.WritableStream = process.stdout,
): Logger {
  const redacting = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      destination.write(redactSecrets(chunk.toString(), secrets), callback);
    },
  });
  return pino({ level: 'info' }, redacting);
}
