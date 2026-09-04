import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlaygroundError, loadPlayground, loadPlaygrounds } from './playground-loader.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dlp-playground-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writePlayground(id: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const file = path.join(root, `${id}.json`);
  const data = {
    id,
    title: 'Demo playground',
    backend: { imageid: 'ubuntu' },
    ttlSeconds: 1800,
    ...overrides,
  };
  await writeFile(file, JSON.stringify(data));
  return file;
}

describe('loadPlayground — đường xanh', () => {
  it('dựng DTO đầy đủ từ file hợp lệ', async () => {
    const file = await writePlayground('demo-playground', { description: 'mô tả' });
    const playground = await loadPlayground(file);
    expect(playground.id).toBe('demo-playground');
    expect(playground.title).toBe('Demo playground');
    expect(playground.description).toBe('mô tả');
    expect(playground.tier).toBe('sysbox');
    expect(playground.capabilities).toEqual([]);
    expect(playground.ttlSeconds).toBe(1800);
    expect(playground.interfaceLayout).toBeNull();
  });

  it('description vắng mặt ⇒ null (không phải chuỗi rỗng)', async () => {
    const file = await writePlayground('no-desc');
    const playground = await loadPlayground(file);
    expect(playground.description).toBeNull();
  });
});

describe('loadPlayground — errors-over-fallback', () => {
  it('id trong file khác tên file ⇒ NÉM', async () => {
    const file = await writePlayground('thu-muc', { id: 'khac-hoan-toan' });
    await expect(loadPlayground(file)).rejects.toThrow(/khai id="khac-hoan-toan"/);
  });

  it('ttlSeconds ngoài phạm vi (< 300) ⇒ NÉM, nêu đúng field ttlSeconds', async () => {
    const file = await writePlayground('ttl-thap', { ttlSeconds: 100 });
    await expect(loadPlayground(file)).rejects.toThrow(/ttlSeconds/);
  });

  it('ttlSeconds ngoài phạm vi (> 7200) ⇒ NÉM, nêu đúng field ttlSeconds', async () => {
    const file = await writePlayground('ttl-cao', { ttlSeconds: 10_000 });
    await expect(loadPlayground(file)).rejects.toThrow(/ttlSeconds/);
  });

  it('field lạ ⇒ NÉM, nêu đúng tên field lạ', async () => {
    const file = await writePlayground('field-la', { somethingNew: true });
    await expect(loadPlayground(file)).rejects.toThrow(/somethingNew/);
  });

  it('backend.imageid lạ ⇒ NÉM và liệt kê imageid đã biết', async () => {
    const file = await writePlayground('imageid-la', { backend: { imageid: 'windows-2030' } });
    await expect(loadPlayground(file)).rejects.toThrow(/BACKEND_IMAGE_MAPPING/);
  });

  it('JSON hỏng ⇒ NÉM', async () => {
    const file = path.join(root, 'hong.json');
    await writeFile(file, '{ khong phai json');
    await expect(loadPlayground(file)).rejects.toThrow(/không phải JSON hợp lệ/);
  });

  it('lỗi luôn mang PlaygroundError để phân loại được', async () => {
    const file = path.join(root, 'khong-ton-tai.json');
    await expect(loadPlayground(file)).rejects.toThrow(PlaygroundError);
  });
});

describe('loadPlaygrounds', () => {
  it('nạp mọi file *.json trong thư mục PHẲNG, sắp theo id', async () => {
    await writePlayground('bai-b');
    await writePlayground('bai-a');
    const playgrounds = await loadPlaygrounds(root);
    expect(playgrounds.map((p) => p.id)).toEqual(['bai-a', 'bai-b']);
  });

  it('bỏ qua thư mục con, chỉ nạp file .json ngay cấp root', async () => {
    await writePlayground('bai-a');
    await mkdir(path.join(root, 'khong-lien-quan'), { recursive: true });
    await writeFile(path.join(root, 'README.md'), 'không phải playground');
    expect((await loadPlaygrounds(root)).map((p) => p.id)).toEqual(['bai-a']);
  });

  it('MỘT playground hỏng làm hỏng cả mẻ — không bỏ qua trong im lặng', async () => {
    await writePlayground('bai-tot');
    await writePlayground('bai-hong', { ttlSeconds: 1 });
    await expect(loadPlaygrounds(root)).rejects.toThrow(/ttlSeconds/);
  });
});
