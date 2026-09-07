import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScenarioError } from './errors.ts';
import { loadScenario, loadScenarios } from './loader.ts';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dlp-scenario-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const SOURCE = {
  repo: 'https://github.com/example/repo',
  commit: '0'.repeat(40),
  path: 'demo',
  license: 'MIT',
  licenseUrl: 'https://raw.githubusercontent.com/example/repo/main/LICENSE',
  upstreamTitle: 'Demo',
};

interface Fixture {
  id?: string;
  sidecar?: Record<string, unknown>;
  index?: unknown;
  files?: Record<string, string>;
}

async function makeScenario(fixture: Fixture = {}): Promise<string> {
  const id = fixture.id ?? 'demo-scenario';
  const dir = path.join(root, id);
  await mkdir(dir, { recursive: true });

  const sidecar = {
    id,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    source: SOURCE,
    ...fixture.sidecar,
  };
  await writeFile(path.join(dir, 'dlp.json'), JSON.stringify(sidecar));

  const index = fixture.index ?? {
    title: 'Demo',
    details: { steps: [{ title: 'Bước 1', text: 'step1.md' }] },
    backend: { imageid: 'ubuntu' },
  };
  await writeFile(path.join(dir, 'index.json'), JSON.stringify(index));

  const files = fixture.files ?? { 'step1.md': '# Bước 1\n\n`ls`{{exec}}\n' };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return dir;
}

describe('loadScenario — đường xanh', () => {
  it('dựng DTO đầy đủ từ thư mục hợp lệ', async () => {
    const scenario = await loadScenario(await makeScenario());
    expect(scenario.id).toBe('demo-scenario');
    expect(scenario.title).toBe('Demo');
    expect(scenario.difficulty).toBe('beginner');
    expect(scenario.tier).toBe('sysbox');
    expect(scenario.capabilities).toEqual([]);
    expect(scenario.steps).toHaveLength(1);
    expect(scenario.steps[0]?.index).toBe(0);
    expect(scenario.steps[0]?.markdown).toContain('{{exec}}');
    expect(scenario.steps[0]?.verifyScript).toBeNull();
    expect(scenario.ignoredUpstreamFields).toEqual([]);
  });

  it('đọc nội dung script chứ không phải đường dẫn script', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Demo',
        details: {
          intro: { text: 'intro.md', background: 'setup.sh' },
          steps: [{ text: 'step1.md', verify: 'sub/verify.sh' }],
        },
        backend: { imageid: 'ubuntu' },
      },
      files: {
        'intro.md': 'chào',
        'setup.sh': '#!/bin/sh\necho setup\n',
        'step1.md': 'nội dung',
        'sub/verify.sh': '#!/bin/sh\nexit 0\n',
      },
    });
    const scenario = await loadScenario(dir);
    expect(scenario.intro?.setup.background).toContain('echo setup');
    expect(scenario.intro?.setup.foreground).toBeNull();
    expect(scenario.steps[0]?.verifyScript).toContain('exit 0');
  });

  it('index step liên tục từ 0 và ánh xạ imageid k8s ra capability', async () => {
    const dir = await makeScenario({
      index: {
        title: 'K8s',
        details: { steps: [{ text: 'a.md' }, { text: 'a.md' }, { text: 'a.md' }] },
        backend: { imageid: 'kubernetes-kubeadm-2nodes' },
      },
      files: { 'a.md': 'x' },
    });
    const scenario = await loadScenario(dir);
    expect(scenario.steps.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(scenario.capabilities).toEqual(['kubernetes', 'multi-node']);
  });
});

describe('loadScenario — errors-over-fallback', () => {
  it('id sidecar khác tên thư mục ⇒ NÉM (id là khoá progress.lesson_id)', async () => {
    const dir = await makeScenario({ id: 'thu-muc', sidecar: { id: 'khac-hoan-toan' } });
    await expect(loadScenario(dir)).rejects.toThrow(/progress\.lesson_id/);
  });

  it('không có step nào ⇒ NÉM dù Killercoda cho phép', async () => {
    const dir = await makeScenario({
      index: { title: 'Trống', backend: { imageid: 'ubuntu' } },
      files: {},
    });
    await expect(loadScenario(dir)).rejects.toThrow(/không có step nào/);
  });

  it('imageid lạ ⇒ NÉM và liệt kê imageid đã biết', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Lạ',
        details: { steps: [{ text: 'a.md' }] },
        backend: { imageid: 'windows-2030' },
      },
      files: { 'a.md': 'x' },
    });
    await expect(loadScenario(dir)).rejects.toThrow(/BACKEND_IMAGE_MAPPING/);
  });

  it('đường dẫn text trỏ ra ngoài thư mục ⇒ NÉM', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Traversal',
        details: { steps: [{ text: '../../../etc/passwd' }] },
        backend: { imageid: 'ubuntu' },
      },
      files: { 'a.md': 'x' },
    });
    await expect(loadScenario(dir)).rejects.toThrow(/ra ngoài thư mục scenario/);
  });

  it('đường dẫn tuyệt đối ⇒ NÉM', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Abs',
        details: { steps: [{ text: path.resolve(root, 'x.md') }] },
        backend: { imageid: 'ubuntu' },
      },
      files: { 'x.md': 'x' },
    });
    await expect(loadScenario(dir)).rejects.toThrow(/tuyệt đối/);
  });

  it('file markdown vắng mặt ⇒ NÉM, nêu rõ field nào trỏ tới nó', async () => {
    const dir = await makeScenario({ files: {} });
    await expect(loadScenario(dir)).rejects.toThrow(/details\.steps\.0\.text/);
  });

  it('bỏ qua field upstream mà không ghi notes ⇒ NÉM', async () => {
    const dir = await makeScenario({
      sidecar: { acknowledgedUnknownFields: ['details.intro.courseData'] },
      index: {
        title: 'Demo',
        details: { intro: { text: 'i.md', courseData: 's.sh' }, steps: [{ text: 'step1.md' }] },
        backend: { imageid: 'ubuntu' },
      },
      files: { 'i.md': 'x', 'step1.md': 'y', 's.sh': 'z' },
    });
    await expect(loadScenario(dir)).rejects.toThrow(/"notes" để trống/);
  });

  it('dlp.json thiếu license ⇒ NÉM (AC 2.E: license phải máy kiểm được)', async () => {
    const { license: _drop, ...sourceWithoutLicense } = SOURCE;
    const dir = await makeScenario({ sidecar: { source: sourceWithoutLicense } });
    await expect(loadScenario(dir)).rejects.toThrow(/dlp\.json sai cấu trúc/);
  });

  it('dlp.json có field lạ ⇒ NÉM (luật 3 áp cho cả file của ta)', async () => {
    const dir = await makeScenario({ sidecar: { somethingNew: true } });
    await expect(loadScenario(dir)).rejects.toThrow(/dlp\.json sai cấu trúc/);
  });

  it('JSON hỏng ⇒ NÉM kèm tên file', async () => {
    const dir = await makeScenario();
    await writeFile(path.join(dir, 'index.json'), '{ khong phai json');
    await expect(loadScenario(dir)).rejects.toThrow(/index\.json không phải JSON hợp lệ/);
  });

  it('lỗi luôn mang tên thư mục để định vị được', async () => {
    const dir = await makeScenario({ id: 'bai-hong', files: {} });
    await expect(loadScenario(dir)).rejects.toThrow(ScenarioError);
    await expect(loadScenario(dir)).rejects.toThrow(/bai-hong/);
  });
});

describe('loadScenarios', () => {
  it('nạp nhiều thư mục, sắp xếp theo id', async () => {
    await makeScenario({ id: 'bai-b' });
    await makeScenario({ id: 'bai-a' });
    const scenarios = await loadScenarios(root);
    expect(scenarios.map((s) => s.id)).toEqual(['bai-a', 'bai-b']);
  });

  it('MỘT scenario hỏng làm hỏng cả mẻ — không bỏ qua trong im lặng', async () => {
    await makeScenario({ id: 'bai-tot' });
    await makeScenario({ id: 'bai-hong', files: {} });
    await expect(loadScenarios(root)).rejects.toThrow(/bai-hong/);
  });

  it('bỏ qua file lẻ ở cấp root, chỉ nạp thư mục', async () => {
    await makeScenario({ id: 'bai-a' });
    await writeFile(path.join(root, 'README.md'), 'không phải scenario');
    expect((await loadScenarios(root)).map((s) => s.id)).toEqual(['bai-a']);
  });
});

/**
 * `requiresCapabilities` — thứ bài ĐÒI, tách khỏi thứ image CUNG CẤP.
 *
 * Hai ca dưới đây gác hai chế độ hỏng khác nhau: bỏ trống phải giữ NGUYÊN hành
 * vi cũ (nếu không thì mọi sidecar đã vendor đổi nghĩa trong im lặng), và khai
 * quá tay phải bị chặn Ở BIÊN NHẬP (nếu không thì bài chết ở terminal của người
 * học giữa step 3, cách nguyên nhân ba tầng).
 */
const FULL_INDEX = (imageid: string) => ({
  title: 'Demo',
  details: { steps: [{ title: 'Bước 1', text: 'step1.md' }] },
  backend: { imageid },
});

describe('requiresCapabilities', () => {
  it('sidecar không khai ⇒ null, tức "giống thứ image cung cấp"', async () => {
    const dir = await makeScenario({
      id: 'req-mac-dinh',
      sidecar: { source: null },
      index: FULL_INDEX('kubernetes-kubeadm-2nodes'),
    });
    const s = await loadScenario(dir);
    expect(s.requiresCapabilities).toBeNull();
    expect(s.capabilities).toEqual(['kubernetes', 'multi-node']);
  });

  it('khai TẬP CON ⇒ nhận, và capabilities KHÔNG bị sửa theo', async () => {
    const dir = await makeScenario({
      id: 'req-tap-con',
      sidecar: { source: null, requiresCapabilities: ['kubernetes'] },
      index: FULL_INDEX('kubernetes-kubeadm-2nodes'),
    });
    const s = await loadScenario(dir);
    expect(s.requiresCapabilities).toEqual(['kubernetes']);
    // `capabilities` là sự thật về imageid — thu hẹp cái ĐÒI không được phép
    // viết lại cái CUNG CẤP, vì hai câu hỏi đó vẫn khác nhau.
    expect(s.capabilities).toEqual(['kubernetes', 'multi-node']);
  });

  it('đòi thứ image KHÔNG cung cấp ⇒ ném, và lỗi nêu CẢ HAI phía', async () => {
    const dir = await makeScenario({
      id: 'req-qua-tay',
      sidecar: { source: null, requiresCapabilities: ['kubernetes', 'multi-node'] },
      index: FULL_INDEX('kubernetes-kubeadm-1node'),
    });
    await expect(loadScenario(dir)).rejects.toThrow(/multi-node/);
    // Lỗi phải nói cả thứ ĐÒI lẫn thứ imageid CUNG CẤP — nêu một phía thì người
    // đọc không biết phải sửa dlp.json hay sửa index.json.
    await expect(loadScenario(dir)).rejects.toThrow(/requiresCapabilities/);
    await expect(loadScenario(dir)).rejects.toThrow(/kubernetes-kubeadm-1node/);
  });
});

describe('toolset — thu hẹp TẠI BIÊN dựng DTO', () => {
  // Ba ca này gác đúng chỗ mà typecheck KHÔNG gác được. `tsc` chỉ khẳng định
  // field `toolset` tồn tại trên DTO; nó không nói gì về việc giá trị đi vào đó
  // đã qua `sanitizeToolset` hay chưa. Bỏ lượt lọc ở biên thì cả ba ca dưới vẫn
  // biên dịch được, và một tên lạ sẽ đi thẳng tới `dlp-tools enable` rồi hỏng
  // lúc setup phiên — trước mặt người học, xa nhất có thể khỏi dòng code sai.

  it('khoá vắng mặt ⇒ mảng rỗng, KHÔNG phải undefined', async () => {
    const dir = await makeScenario();
    const scenario = await loadScenario(dir);
    // Mảng rỗng chứ không `undefined`/`null`: hợp đồng §C4 chọn MỘT cách viết
    // cho "không bật gì", nếu không thì `?? []` sẽ mọc ở mọi call-site.
    expect(scenario.toolset).toEqual([]);
  });

  it('giữ đúng công cụ hợp lệ, đúng thứ tự người soạn viết', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Demo',
        details: { steps: [{ title: 'Bước 1', text: 'step1.md' }] },
        backend: { imageid: 'ubuntu' },
        toolset: ['yq', 'btop'],
      },
    });
    const scenario = await loadScenario(dir);
    // KHÔNG sắp xếp lại: một hàm lặng lẽ đổi thứ tự người soạn viết là thứ khó
    // truy hơn nhiều so với một danh sách chưa đẹp.
    expect(scenario.toolset).toEqual(['yq', 'btop']);
  });

  it('tên ngoài danh mục bị LOẠI, và bài vẫn nạp được', async () => {
    const dir = await makeScenario({
      index: {
        title: 'Demo',
        details: { steps: [{ title: 'Bước 1', text: 'step1.md' }] },
        backend: { imageid: 'ubuntu' },
        toolset: ['btop', 'khong-ton-tai', 'yq'],
      },
    });
    // Lọc bỏ chứ KHÔNG ném: một công cụ đã bị gỡ khỏi danh mục chỉ được phép làm
    // mất công cụ đó, không được làm mất cả bài. Đây là điểm khác có chủ ý so với
    // `toAction` của content-blocks (verb lạ ⇒ ném), vì nút bấm sai chức năng là
    // thứ người học TƯƠNG TÁC, còn tiện ích vắng mặt thì không.
    const scenario = await loadScenario(dir);
    expect(scenario.toolset).toEqual(['btop', 'yq']);
  });
});
