import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filesystemScenarioSource } from './source.ts';

const CONTENT_DIR = fileURLToPath(new URL('../../../content/scenarios', import.meta.url));

describe('filesystemScenarioSource', () => {
  it('liệt kê bản rút gọn của mọi scenario trong content/, sắp theo id', async () => {
    const items = await filesystemScenarioSource(CONTENT_DIR).list();

    // Danh sách ghim CỨNG có chủ ý: nó là cổng "kho nội dung vừa đổi" — thêm hoặc
    // mất một bài phải là một sửa đổi CÓ Ý THỨC ở đây, không phải một con số tự
    // trôi. Hai bài `dlp-*` là first-party (source: null), xen giữa các bài
    // vendored vì thứ tự là theo id chứ không theo xuất xứ.
    expect(items.map((s) => s.id)).toEqual([
      'ckad-configmap-as-files',
      'dlp-docker-basics',
      'dlp-k8s-basics',
      'dlp-k8s-multinode-scheduling',
      'dlp-sandbox-basics',
      'loki-quickstart',
      'loxilb-tcp-load-balancing',
      'prolug-linux-system-checking',
    ]);
    // Bản rút gọn KHÔNG mang nội dung step — đó là toàn bộ lý do nó tồn tại.
    for (const item of items) {
      expect(item).not.toHaveProperty('steps');
      expect(item.stepCount).toBeGreaterThan(0);
    }
  });

  it('get trả scenario đầy đủ kèm step', async () => {
    const scenario = await filesystemScenarioSource(CONTENT_DIR).get('ckad-configmap-as-files');

    expect(scenario).not.toBeNull();
    expect(scenario?.steps.length).toBeGreaterThan(0);
    expect(scenario?.steps[0]?.markdown).toContain('#');
  });

  it('get trả null cho id không có, KHÔNG ném', async () => {
    // "Không tìm thấy" là câu trả lời hợp lệ; chỉ tRPC mới biết nó phải thành
    // NOT_FOUND. Ném ở tầng này buộc mọi caller phải bắt lỗi để phân loại.
    await expect(filesystemScenarioSource(CONTENT_DIR).get('khong-ton-tai')).resolves.toBeNull();
  });

  it('nạp một lần rồi dùng lại — hai lượt list trả cùng dữ liệu', async () => {
    const source = filesystemScenarioSource(CONTENT_DIR);
    const [a, b] = await Promise.all([source.list(), source.list()]);
    expect(a).toEqual(b);
  });

  it('thư mục sai thì NÉM chứ không trả danh sách rỗng', async () => {
    // Rỗng-trong-im-lặng là chế độ hỏng tệ nhất ở đây: trang /lessons hiện ra
    // trống rỗng và không có gì nói rằng SCENARIOS_DIR đang trỏ sai chỗ.
    const source = filesystemScenarioSource(path.join(CONTENT_DIR, 'khong-co-thu-muc-nay'));
    await expect(source.list()).rejects.toThrow();
  });

  it('lượt nạp hỏng KHÔNG bị đóng băng trong cache', async () => {
    // Giữ lại một promise reject nghĩa là một lỗi tạm thời (mount chưa sẵn
    // sàng) sẽ dính vĩnh viễn cho tới khi restart pod.
    const source = filesystemScenarioSource(path.join(CONTENT_DIR, 'khong-co'));
    await expect(source.list()).rejects.toThrow();
    await expect(source.list()).rejects.toThrow();
  });
});

/**
 * `ContentSource` — phần mở rộng P8. `filesystemScenarioSource(CONTENT_DIR)`
 * KHÔNG truyền `labsRootDir`/`playgroundsRootDir` tường minh: đây chính là
 * đường caller HIỆN CÓ (`catalog.ts`) sẽ đi — nếu suy luận thư mục anh em sai,
 * bài test này là chỗ đầu tiên đỏ.
 */
describe('filesystemScenarioSource — ContentSource (lab + playground)', () => {
  it('listLabs liệt kê bản rút gọn, sắp theo id, không mang task', async () => {
    const items = await filesystemScenarioSource(CONTENT_DIR).listLabs();
    expect(items.map((l) => l.id)).toEqual(['dlp-k8s-broken-deploy', 'dlp-linux-triage']);
    for (const item of items) {
      expect(item).not.toHaveProperty('tasks');
      expect(item.taskCount).toBeGreaterThan(0);
    }
  });

  it('getLab trả lab đầy đủ kèm task', async () => {
    const lab = await filesystemScenarioSource(CONTENT_DIR).getLab('dlp-linux-triage');
    expect(lab).not.toBeNull();
    expect(lab?.tasks.length).toBeGreaterThan(0);
    expect(lab?.tasks[0]?.markdown).toContain('#');
  });

  it('getLab trả null cho id không có, KHÔNG ném', async () => {
    await expect(filesystemScenarioSource(CONTENT_DIR).getLab('khong-ton-tai')).resolves.toBeNull();
  });

  it('listPlaygrounds liệt kê mọi playground, sắp theo id', async () => {
    const items = await filesystemScenarioSource(CONTENT_DIR).listPlaygrounds();
    expect(items.map((p) => p.id)).toEqual(['dlp-docker-playground', 'dlp-linux-playground']);
  });

  it('getPlayground trả playground đầy đủ', async () => {
    const playground = await filesystemScenarioSource(CONTENT_DIR).getPlayground(
      'dlp-linux-playground',
    );
    expect(playground).not.toBeNull();
    expect(playground?.ttlSeconds).toBe(1800);
  });

  it('getPlayground trả null cho id không có, KHÔNG ném', async () => {
    await expect(
      filesystemScenarioSource(CONTENT_DIR).getPlayground('khong-ton-tai'),
    ).resolves.toBeNull();
  });

  it('cache của scenario/lab/playground ĐỘC LẬP — lab hỏng không ảnh hưởng list() scenario', async () => {
    const source = filesystemScenarioSource(CONTENT_DIR, {
      labsRootDir: path.join(CONTENT_DIR, 'khong-co-thu-muc-nay'),
    });
    await expect(source.listLabs()).rejects.toThrow();
    // scenario vẫn nạp tốt dù labsRootDir sai — hai cache tách biệt.
    await expect(source.list()).resolves.not.toHaveLength(0);
  });

  it('labsRootDir/playgroundsRootDir tường minh ghi đè suy luận thư mục anh em', async () => {
    const explicit = filesystemScenarioSource(path.join(CONTENT_DIR, 'khong-lien-quan'), {
      labsRootDir: path.join(CONTENT_DIR, '..', 'labs'),
      playgroundsRootDir: path.join(CONTENT_DIR, '..', 'playgrounds'),
    });
    const labs = await explicit.listLabs();
    expect(labs.map((l) => l.id)).toEqual(['dlp-k8s-broken-deploy', 'dlp-linux-triage']);
  });
});

/**
 * D9 (phase-13) — `listPage` của nguồn ĐĨA: cắt lát trên mảng đã sắp trong bộ
 * nhớ, KHÔNG validate sự tồn tại của cursor (đó là việc của composite — xem
 * `composite-source.test.ts`).
 */
describe('filesystemScenarioSource — listPage (D9)', () => {
  // Cùng danh sách ghim ở test `list()` phía trên, 8 bài — dùng lại nguyên vẹn
  // để một trang limit=3 cắt đúng ba biên đã biết trước.
  const ALL_IDS = [
    'ckad-configmap-as-files',
    'dlp-docker-basics',
    'dlp-k8s-basics',
    'dlp-k8s-multinode-scheduling',
    'dlp-sandbox-basics',
    'loki-quickstart',
    'loxilb-tcp-load-balancing',
    'prolug-linux-system-checking',
  ];

  it('trang đầu: đúng limit mục + nextCursor = id mục cuối trang', async () => {
    const page = await filesystemScenarioSource(CONTENT_DIR).listPage({ limit: 3 });
    expect(page.items.map((s) => s.id)).toEqual(ALL_IDS.slice(0, 3));
    expect(page.nextCursor).toBe(ALL_IDS[2]);
  });

  it('trang giữa: cursor = mục cuối trang trước → trang kế tiếp không trùng, không sót', async () => {
    const first = await filesystemScenarioSource(CONTENT_DIR).listPage({ limit: 3 });
    expect(first.nextCursor).not.toBeNull();
    const second = await filesystemScenarioSource(CONTENT_DIR).listPage({
      limit: 3,
      cursor: first.nextCursor as string,
    });
    expect(second.items.map((s) => s.id)).toEqual(ALL_IDS.slice(3, 6));
    expect(second.nextCursor).toBe(ALL_IDS[5]);
  });

  it('trang cuối: ít hơn limit mục → nextCursor null', async () => {
    const cursorId = ALL_IDS[5];
    if (cursorId === undefined) {
      throw new Error('ALL_IDS[5] phải tồn tại — fixture cố định 8 phần tử');
    }
    const last = await filesystemScenarioSource(CONTENT_DIR).listPage({
      limit: 3,
      cursor: cursorId,
    });
    expect(last.items.map((s) => s.id)).toEqual(ALL_IDS.slice(6));
    expect(last.nextCursor).toBeNull();
  });

  it('cursor KHÔNG tồn tại → KHÔNG ném, chỉ lọc id > cursor (validate là việc của composite)', async () => {
    // Đây chính là điểm khác `list()` cũ (findIndex-rồi-ném): `listPage` của
    // MỘT nguồn không được ném cho một cursor hợp lệ ở nguồn KHÁC — semantics
    // keyset thuần (`id > cursor`) hoạt động đúng dù `cursor` không tồn tại.
    const page = await filesystemScenarioSource(CONTENT_DIR).listPage({
      limit: 100,
      cursor: 'khong-ton-tai-nhung-hop-le',
    });
    // 'khong-ton-tai-nhung-hop-le' > 'loki-quickstart' theo thứ tự chuỗi, nên
    // chỉ hai bài sau nó còn lại.
    expect(page.items.map((s) => s.id)).toEqual(
      ALL_IDS.filter((id) => id > 'khong-ton-tai-nhung-hop-le'),
    );
  });

  it('filter.tier áp TRƯỚC khi phân trang — limit đếm trên tập ĐÃ lọc', async () => {
    const unfiltered = await filesystemScenarioSource(CONTENT_DIR).listPage({ limit: 100 });
    // Cả 8 bài ghim đều `tier: 'sysbox'` (đúng thực trạng nội dung vendored
    // hôm nay) — nên phép chứng tốt nhất KHÔNG phụ thuộc vào việc kho có đủ đa
    // dạng tier hay không: lọc theo `sysbox` phải trả ĐÚNG TOÀN BỘ tập (đối
    // chứng dương — filter không vô tình chặn cả những gì lẽ ra phải qua), và
    // lọc theo một tier KHÔNG tồn tại trong kho (`gvisor`) phải trả RỖNG (đối
    // chứng âm — nếu filter bị bỏ qua trong im lặng, phép lọc này sẽ trả về cả
    // 8 bài thay vì 0).
    const bySysbox = await filesystemScenarioSource(CONTENT_DIR).listPage({
      limit: 100,
      filter: { tier: 'sysbox' },
    });
    expect(bySysbox.items.map((s) => s.id).sort()).toEqual(
      unfiltered.items.map((s) => s.id).sort(),
    );

    const byGvisor = await filesystemScenarioSource(CONTENT_DIR).listPage({
      limit: 100,
      filter: { tier: 'gvisor' },
    });
    expect(byGvisor.items).toHaveLength(0);
    expect(byGvisor.nextCursor).toBeNull();
  });

  it('listLabsPage/listPlaygroundsPage phân trang cùng khuôn', async () => {
    const labs = await filesystemScenarioSource(CONTENT_DIR).listLabsPage({ limit: 1 });
    expect(labs.items).toHaveLength(1);

    const playgrounds = await filesystemScenarioSource(CONTENT_DIR).listPlaygroundsPage({
      limit: 1,
    });
    expect(playgrounds.items).toHaveLength(1);
    expect(playgrounds.nextCursor).toBe('dlp-docker-playground');
  });
});
