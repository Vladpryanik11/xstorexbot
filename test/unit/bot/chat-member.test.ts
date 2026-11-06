import { describe, expect, it } from 'vitest';
import { createHarness } from '../helpers/harness.js';

describe('my_chat_member', () => {
  it('kicked ставит blockedAt и не трогает lastSeenAt', async () => {
    const h = createHarness();
    await h.chatMember('kicked');
    expect(h.services.blocked.get(42)).toEqual(h.now.value);
    expect(h.services.users).toHaveLength(0);
  });

  it('member снимает blockedAt', async () => {
    const h = createHarness();
    await h.chatMember('member');
    expect(h.services.blocked.get(42)).toBeNull();
    expect(h.services.users).toHaveLength(0);
  });

  it('другие статусы игнорируются', async () => {
    const h = createHarness();
    await h.chatMember('member');
    h.services.blocked.clear();
    await h.chatMember('left' as never);
    expect(h.services.blocked.size).toBe(0);
  });
});
