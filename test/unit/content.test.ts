import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentError, loadContent } from '../../src/content.js';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
let dir: string;

async function fill(
  over: Partial<Record<'start.txt' | 'about.txt' | 'feather.txt', string>> = {},
  image: Buffer | null = JPG,
): Promise<void> {
  const files = {
    'start.txt': '  Привет!  \n',
    'about.txt': '\nО сервисе\n',
    'feather.txt': ' Шаги Feather ',
    ...over,
  };
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  if (image) await writeFile(join(dir, 'start.jpg'), image);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'content-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('loadContent', () => {
  it('читает тексты без пробелов по краям и картинку', async () => {
    await fill();
    const c = await loadContent(dir);
    expect(c.startText).toBe('Привет!');
    expect(c.aboutText).toBe('О сервисе');
    expect(c.featherText).toBe('Шаги Feather');
    expect(c.startImage.equals(JPG)).toBe(true);
  });

  it('убирает BOM в начале start.txt', async () => {
    await fill({ 'start.txt': '﻿Привет' });
    expect((await loadContent(dir)).startText).toBe('Привет');
  });

  it('нет about.txt: ошибка называет файл', async () => {
    await fill();
    await rm(join(dir, 'about.txt'));
    const err = await loadContent(dir).catch((e) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect(err.message).toContain('about.txt');
  });

  it('пустой feather.txt: ошибка', async () => {
    await fill({ 'feather.txt': '   \n ' });
    await expect(loadContent(dir)).rejects.toBeInstanceOf(ContentError);
  });

  it('start.txt длиннее 900 символов: ошибка', async () => {
    await fill({ 'start.txt': 'а'.repeat(901) });
    await expect(loadContent(dir)).rejects.toThrow('start.txt длиннее 900 символов');
    await fill({ 'start.txt': 'а'.repeat(900) });
    await expect(loadContent(dir)).resolves.toBeDefined();
  });

  it.each(['about.txt', 'feather.txt'] as const)(
    '%s длиннее 4000 символов: ошибка',
    async (name) => {
      await fill({ [name]: 'а'.repeat(4001) });
      const err = await loadContent(dir).catch((e) => e);
      expect(err).toBeInstanceOf(ContentError);
      expect(err.message).toContain(name);
    },
  );

  it('start.jpg не JPEG: ошибка', async () => {
    await fill({}, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const err = await loadContent(dir).catch((e) => e);
    expect(err).toBeInstanceOf(ContentError);
    expect(err.message).toContain('start.jpg');
  });

  it('start.jpg больше 10 МБ: ошибка', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    JPG.copy(big);
    await fill({}, big);
    await expect(loadContent(dir)).rejects.toBeInstanceOf(ContentError);
  });

  it('нет start.jpg: ошибка', async () => {
    await fill({}, null);
    await expect(loadContent(dir)).rejects.toThrow('start.jpg');
  });
});
