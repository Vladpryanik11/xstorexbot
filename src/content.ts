import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Content {
  startText: string;
  aboutText: string;
  featherText: string;
  startImage: Buffer;
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

/** Подпись к фото ограничена 1024 символами; запас нужен под строку о подписке. */
const START_MAX = 900;
const MESSAGE_MAX = 4000;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

async function readFileOrFail(dir: string, name: string): Promise<Buffer> {
  try {
    return await readFile(join(dir, name));
  } catch {
    throw new ContentError(`Не найден или не читается файл ${name} в папке ${dir}`);
  }
}

async function readText(dir: string, name: string, max: number): Promise<string> {
  const raw = (await readFileOrFail(dir, name)).toString('utf8');
  const text = raw.replace(/^﻿/, '').trim();
  if (text === '') throw new ContentError(`Файл ${name} пустой`);
  if (text.length > max) throw new ContentError(`${name} длиннее ${max} символов`);
  return text;
}

export async function loadContent(dir: string): Promise<Content> {
  const startText = await readText(dir, 'start.txt', START_MAX);
  const aboutText = await readText(dir, 'about.txt', MESSAGE_MAX);
  const featherText = await readText(dir, 'feather.txt', MESSAGE_MAX);
  const startImage = await readFileOrFail(dir, 'start.jpg');
  if (startImage.length > IMAGE_MAX_BYTES) {
    throw new ContentError('start.jpg больше 10 МБ');
  }
  if (
    startImage.length < 3 ||
    startImage[0] !== 0xff ||
    startImage[1] !== 0xd8 ||
    startImage[2] !== 0xff
  ) {
    throw new ContentError('start.jpg не похож на JPEG (нет сигнатуры FF D8 FF)');
  }
  return { startText, aboutText, featherText, startImage };
}
