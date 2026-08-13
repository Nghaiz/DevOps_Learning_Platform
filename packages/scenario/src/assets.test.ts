import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScenarioAsset } from '@devops-platform/shared-types/scenario';
import { MAX_TOTAL_ASSET_BYTES, ScenarioAssetError, resolveScenarioAssets } from './assets.ts';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** Dựng một thư mục scenario giả với `assets/` chứa các file cho trước. */
async function makeScenarioDir(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'dlp-assets-'));
  dirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, 'assets', name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

function asset(file: string, over: Partial<ScenarioAsset> = {}): ScenarioAsset {
  return { host: 'host01', file, target: '~/', chmod: null, ...over };
}

describe('resolveScenarioAssets', () => {
  it('không có asset thì KHÔNG chạm đĩa (scenario không có thư mục assets vẫn nạp được)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dlp-noassets-'));
    dirs.push(root);
    // Không tạo `assets/`. Đa số scenario không có asset nào, nên một hiện thực
    // `readdir` vô điều kiện sẽ làm chúng ném ENOENT ở mọi lượt runSetup.
    await expect(resolveScenarioAssets(root, [])).resolves.toEqual([]);
  });

  it('đọc file theo tên và trả đúng nội dung byte', async () => {
    const root = await makeScenarioDir({ 'start.sh': 'echo hi\n' });
    const [got] = await resolveScenarioAssets(root, [asset('start.sh')]);

    expect(got?.name).toBe('start.sh');
    expect(new TextDecoder().decode(got?.bytes)).toBe('echo hi\n');
  });

  it('giải được asset nằm trong THƯ MỤC CON (`app/config.json`)', async () => {
    // Killercoda cho phép đường dẫn nhiều tầng. Một `readdir` phẳng sẽ trượt ca
    // này và báo "không khớp file nào" cho một khai báo hợp lệ.
    const root = await makeScenarioDir({ 'app/config.json': '{}' });
    const got = await resolveScenarioAssets(root, [asset('app/config.json')]);

    expect(got.map((a) => a.name)).toEqual(['app/config.json']);
  });

  it('giải glob `*` và sắp xếp ổn định', async () => {
    const root = await makeScenarioDir({ 'b.sh': 'b', 'a.sh': 'a', 'skip.txt': 'x' });
    const got = await resolveScenarioAssets(root, [asset('*.sh')]);

    expect(got.map((a) => a.name)).toEqual(['a.sh', 'b.sh']);
  });

  it('glob không khớp file nào thì NÉM, không trả mảng rỗng', async () => {
    // Trả rỗng sẽ để `background` chạy rồi chết ở `No such file or directory` —
    // xa nguyên nhân đúng một tầng.
    const root = await makeScenarioDir({ 'a.sh': 'a' });
    await expect(resolveScenarioAssets(root, [asset('*.js')])).rejects.toThrow(
      ScenarioAssetError,
    );
  });

  it('tên file không tồn tại thì NÉM', async () => {
    const root = await makeScenarioDir({ 'a.sh': 'a' });
    await expect(resolveScenarioAssets(root, [asset('khong-co.sh')])).rejects.toThrow(
      /không khớp file nào/,
    );
  });

  it('khai báo trùng (cùng file + cùng target) chỉ đẩy MỘT lần', async () => {
    // `loxilb` khai `config-mirror.sh` hai lần trong cùng index.json — có thật,
    // không phải giả định.
    const root = await makeScenarioDir({ 'dup.sh': 'x' });
    const got = await resolveScenarioAssets(root, [asset('dup.sh'), asset('dup.sh')]);

    expect(got).toHaveLength(1);
  });

  it('cùng file nhưng KHÁC target thì vẫn đẩy hai lần', async () => {
    const root = await makeScenarioDir({ 'dup.sh': 'x' });
    const got = await resolveScenarioAssets(root, [
      asset('dup.sh', { target: '~/' }),
      asset('dup.sh', { target: '/opt/' }),
    ]);

    expect(got).toHaveLength(2);
  });

  it('vượt trần tổng dung lượng thì NÉM', async () => {
    const root = await makeScenarioDir({ 'big.bin': 'x'.repeat(MAX_TOTAL_ASSET_BYTES + 1) });
    await expect(resolveScenarioAssets(root, [asset('big.bin')])).rejects.toThrow(
      /vượt trần/,
    );
  });

  it('trần nằm DƯỚI trần thân request 64 KiB của gateway', () => {
    // Hai con số này là MỘT CẶP. Bản đầu đặt 1 MiB — gấp 16 lần thứ vận chuyển
    // được — nên bài đầu tiên kèm tarball nhỏ sẽ vượt `maxBodyBytes` và gateway
    // trả BAD_REQUEST, mà BFF dịch thành "không chạy được script CHẤM BÀI": một
    // lỗi chấm bài cho một lượt ĐẨY FILE.
    //
    // base64 nở ×4/3, cộng xuống dòng + JSON escaping + khung mkdir/chmod.
    const GATEWAY_MAX_BODY_BYTES = 64 * 1024;
    expect(Math.ceil((MAX_TOTAL_ASSET_BYTES * 4) / 3)).toBeLessThan(GATEWAY_MAX_BODY_BYTES);
  });

  it('glob khớp trúng THƯ MỤC thì bỏ qua thư mục, không ném EISDIR', async () => {
    // `readdir(recursive)` tra ve ca thu muc. `readFile` tren thu muc nem EISDIR
    // — mot Error TRAN, khong phai ScenarioAssetError — nen no lot qua ranh gioi
    // loi co kieu va hien ra duoi dang INTERNAL_SERVER_ERROR mu mit.
    const root = await makeScenarioDir({ 'app/config.json': '{}', 'top.sh': 'x' });
    const got = await resolveScenarioAssets(root, [asset('*')]);

    // `*` không vắt qua `/` nên chỉ khớp `top.sh` và thư mục `app`; thư mục bị bỏ.
    expect(got.map((a) => a.name)).toEqual(['top.sh']);
  });

  it('glob CHỈ khớp thư mục thì NÉM, không trả rỗng im lặng', async () => {
    const root = await makeScenarioDir({ 'app/config.json': '{}' });
    await expect(resolveScenarioAssets(root, [asset('app')])).rejects.toThrow(
      /chỉ khớp thư mục/,
    );
  });

  it('pattern quá nhiều dấu * bị TỪ CHỐI (chặn regex bùng nổ)', async () => {
    // Đo thật: 10 dấu `*` trên một tên 40 ký tự có chứa `/` làm engine regex
    // chạy ~115 GIÂY, và nó chạy ĐỒNG BỘ trong mutation runSetup nên treo event
    // loop của BFF cho MỌI người dùng. Hôm nay pattern đến từ nội dung đã
    // vendored; bản ScenarioSource chạy trên DB biến nó thành đầu vào người dùng.
    const root = await makeScenarioDir({ 'a.sh': 'x' });
    await expect(
      resolveScenarioAssets(root, [asset('*a*b*c*d*e*f*g*h*i*j*')]),
    ).rejects.toThrow(/quá 4 dấu/);
  });

  it('pattern nhiều * nhưng trong hạn vẫn chạy nhanh', async () => {
    const root = await makeScenarioDir({ 'a-b-c-d.sh': 'x' });
    const started = Date.now();
    const got = await resolveScenarioAssets(root, [asset('*-*-*-*.sh')]);
    expect(got.map((a) => a.name)).toEqual(['a-b-c-d.sh']);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('khai asset nhưng KHÔNG có thư mục assets/ thì NÉM kèm đường dẫn', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'dlp-missing-'));
    dirs.push(root);
    await expect(resolveScenarioAssets(root, [asset('a.sh')])).rejects.toThrow(
      /không đọc được thư mục/,
    );
  });
});
