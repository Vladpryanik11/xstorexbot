export type BroadcastButton = { text: string; url: string };

export interface BroadcastSummary {
  id: number;
  status: 'RUNNING' | 'DONE' | 'STOPPED' | 'FAILED';
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  pending: number;
  createdAt: Date;
  finishedAt: Date | null;
}

/** Рассылка по базе. Тело — задача 10; здесь только контракт для админки. */
export interface Broadcasts {
  countRecipients(): Promise<number>;
  /** Идущая, иначе последняя, иначе null. */
  current(): Promise<BroadcastSummary | null>;
  start(input: {
    adminId: number;
    sourceChatId: number;
    sourceMessageId: number;
    button: BroadcastButton | null;
  }): Promise<{ ok: true; id: number; total: number } | { ok: false; reason: 'running' }>;
  /** false, если уже не идёт. */
  stop(adminId: number, broadcastId: number): Promise<boolean>;
  resume(): Promise<void>;
  /** Ждёт окончания текущего цикла отправки (тесты, остановка). */
  idle(): Promise<void>;
}
