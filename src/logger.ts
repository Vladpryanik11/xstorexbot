import { Writable } from 'node:stream';
import { type Logger, pino } from 'pino';

export type { Logger };

const MASK = '[скрыто]';

export function redactSecrets(text: string, secrets: string[]): string {
  // Строки лога — JSON: pino экранирует " и \, поэтому маскируем и экранированный вид.
  const candidates = new Set<string>();
  for (const secret of secrets) {
    if (!secret) continue;
    candidates.add(secret);
    candidates.add(JSON.stringify(secret).slice(1, -1));
  }
  // Сначала длинные: короткий секрет внутри длинного не оставит его обрывок.
  const ordered = [...candidates].sort((x, y) => y.length - x.length);
  let out = text;
  for (const c of ordered) out = out.split(c).join(MASK);
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
  return pino(
    {
      level: 'info',
      serializers: {
        // payload запроса GrammyError может содержать InputFile и пользовательские данные.
        err: (err: unknown) => {
          if (!(err instanceof Error)) return err;
          const { payload: _payload, ...rest } = pino.stdSerializers.err(err) as unknown as Record<
            string,
            unknown
          >;
          return rest;
        },
      },
    },
    redacting,
  );
}
