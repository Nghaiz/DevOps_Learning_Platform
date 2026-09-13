import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapBackendImage } from './backend.ts';

/**
 * ⛔ Cổng NỘI DUNG: không bài nào được vừa khai `interface.layout: ide` vừa đòi
 * một cụm k8s trong sandbox.
 *
 * ## Vì sao file này tồn tại: một cổng ĐƯỢC VIỆN DẪN mà chưa bao giờ có thật
 *
 * `apps/web/src/server/lessons/catalog.ts` (quanh dòng 120) giải thích rằng
 * `profileForCapabilities` cố ý trả `'k8s'` cho tổ hợp ide+kubernetes, rằng tổ
 * hợp đó CHƯA CÓ SỐ ĐO, và chốt bằng câu *"có `TestNoContentIsBothIdeAndK8s`
 * gác đúng điều đó"*. Ghi chú nội dung của `content/scenarios/dlp-ide-config-edit`
 * viện dẫn lại chính cái tên đó để biện minh cho việc chọn `backend.imageid:
 * ubuntu`.
 *
 * Cái test ấy KHÔNG TỒN TẠI. Đo 2026-09-13: `grep -rn "IdeAndK8s"` trên `*.go`,
 * `*.ts`, `*.mjs` toàn repo (trừ `node_modules`) chỉ trả về đúng hai chú thích
 * viện dẫn nó. Hai chỗ trong mã đang dựa vào một cái chốt không có thật, và
 * không có gì báo — đúng hình dạng "một ô xanh không chứng minh gì".
 *
 * File này làm cho lời viện dẫn đó thành đúng. Nếu bạn đổi tên nó, hãy đổi cả
 * hai chỗ trích dẫn ở trên cùng lượt.
 *
 * ## Vì sao phải chặn ở tầng NỘI DUNG chứ không tầng hàm
 *
 * `profileForCapabilities(['kubernetes'], 'ide')` trả `'k8s'` và đã có test
 * riêng (`server/lessons/catalog.test.ts`). Nhưng đó là test về HÀM: nó khẳng
 * định hàm làm đúng thứ nó hứa. Thứ chưa ai gác là **có bài nào rơi vào nhánh
 * đó không** — và hậu quả không nằm ở hàm mà ở pod: profile `k8s` cấp 1Gi cho
 * một cụm con, nhưng chưa phép đo nào cộng thêm Theia vào đó. 6.E đo IDE + bài
 * là 660Mi mà KHÔNG có cụm con; profile `k8s` đo với cụm con mà KHÔNG có IDE.
 * Cộng thẳng hai số là đúng phép tính đã sai 18% một lần rồi.
 *
 * Nên khi ô này đỏ, việc phải làm là ĐO tổ hợp đó rồi thêm một profile mới —
 * KHÔNG phải nới ô này, và cũng không phải chọn đại một trong hai profile cũ.
 */

const CONTENT_ROOT = resolve(import.meta.dirname, '../../../content');

/** Một mục nội dung đã đọc từ đĩa, ở dạng tối thiểu mà cổng này cần. */
interface ContentItem {
  readonly rel: string;
  readonly imageId: string;
  readonly layout: string | null;
}

/**
 * ⚠ Đọc THẲNG từ đĩa chứ không qua loader.
 *
 * Loader từ chối một mục sai lược đồ bằng cách ném, nên một lượt duyệt qua
 * loader sẽ dừng ở mục hỏng đầu tiên và những mục sau nó không bao giờ được
 * kiểm. Cổng này phải nói về TOÀN BỘ cây, kể cả khi một mục khác đang hỏng vì
 * lý do không liên quan.
 */
function readContentTree(): readonly ContentItem[] {
  const items: ContentItem[] = [];

  /*
    Ba loại nội dung có `backend` + `interface`. `paths`/`quizzes` không dựng
    sandbox nên không có profile để sai.

    ⚠ HAI hình dạng trên đĩa, và cái thứ hai suýt bị bỏ sót. `scenarios/` và
    `labs/` là MỘT THƯ MỤC mỗi mục (kèm `index.json` / `lab.json` và các file
    markdown), còn `playgrounds/` là các FILE `.json` PHẲNG. Bản đầu của cổng
    này chỉ duyệt thư mục, nên nó bỏ qua trọn nhóm playground trong im lặng và
    vẫn xanh — đúng cái lớp lỗi mà chính nó tồn tại để chặn. Ô "đọc được cây
    nội dung thật" bên dưới không bắt được điều đó, vì hai nhóm kia đã đủ làm
    số mục lớn hơn 0.
  */
  const groups: readonly (readonly [string, string | null])[] = [
    ['scenarios', 'index.json'],
    ['labs', 'lab.json'],
    ['playgrounds', null],
  ];

  for (const [group, fileName] of groups) {
    const dir = join(CONTENT_ROOT, group);
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      let file: string;
      let rel: string;
      if (fileName === null) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }
        file = join(dir, entry.name);
        rel = `${group}/${entry.name}`;
      } else {
        if (!entry.isDirectory()) {
          continue;
        }
        file = join(dir, entry.name, fileName);
        rel = `${group}/${entry.name}`;
        if (!existsSync(file)) {
          continue;
        }
      }
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) {
        continue;
      }
      const record = parsed as Record<string, unknown>;
      const backend = record['backend'];
      const iface = record['interface'];
      const imageId =
        typeof backend === 'object' && backend !== null
          ? (backend as Record<string, unknown>)['imageid']
          : undefined;
      const layout =
        typeof iface === 'object' && iface !== null
          ? (iface as Record<string, unknown>)['layout']
          : undefined;
      if (typeof imageId !== 'string') {
        continue;
      }
      items.push({ rel, imageId, layout: typeof layout === 'string' ? layout : null });
    }
  }
  return items;
}

describe('TestNoContentIsBothIdeAndK8s — cổng nội dung ide + kubernetes', () => {
  const items = readContentTree();

  /**
   * ⚠ Phép kiểm đầu vào, KHÔNG phải một pinned baseline.
   *
   * Một bộ duyệt gõ sai đường dẫn trả mảng rỗng, và mọi khẳng định "không mục
   * nào vi phạm" bên dưới sẽ XANH vĩnh viễn trên một tập rỗng. Ô này khẳng
   * định cây thật sự được đọc. Con số không phải là một mốc phải giữ — nó chỉ
   * cần lớn hơn 0 và là kiểu dữ liệu đúng.
   */
  it('đọc được cây nội dung thật, và phủ ĐỦ BA nhóm', () => {
    expect(items.length, `không đọc được mục nào dưới ${CONTENT_ROOT}`).toBeGreaterThan(0);
    expect(items.every((i) => i.imageId.length > 0)).toBe(true);

    /*
      ⚠ Vế "đủ ba nhóm" không thừa, và nó có lịch sử.

      Bản đầu của bộ duyệt chỉ đi qua thư mục con, nên nó bỏ trọn nhóm
      `playgrounds/` (các file `.json` PHẲNG) mà vẫn xanh: hai nhóm kia đủ làm
      tổng số mục lớn hơn 0. Một phép kiểm tổng-lớn-hơn-0 không phân biệt được
      "đọc đủ" với "đọc được hai phần ba", nên nó phải đếm theo TỪNG nhóm.
    */
    for (const group of ['scenarios', 'labs', 'playgrounds']) {
      expect(
        items.filter((i) => i.rel.startsWith(`${group}/`)).length,
        `nhóm ${group}/ không đóng góp mục nào — bộ duyệt đang bỏ sót nó`,
      ).toBeGreaterThan(0);
    }
  });

  it('không mục nào vừa `ide` vừa đòi kubernetes', () => {
    const offenders = items
      .filter((item) => item.layout === 'ide')
      .filter((item) => mapBackendImage(item.imageId)?.capabilities.includes('kubernetes') === true)
      .map((item) => `${item.rel} (imageid=${item.imageId})`);

    expect(
      offenders,
      'Tổ hợp ide + kubernetes CHƯA CÓ SỐ ĐO RAM. `profileForCapabilities` sẽ trả ' +
        '`k8s` (1Gi) cho các mục này, và chưa phép đo nào cộng Theia vào một pod ' +
        'đang chạy cụm con. ĐO trước rồi thêm profile mới — đừng nới ô này.',
    ).toEqual([]);
  });

  /**
   * ⛔ Nửa DƯƠNG. Không có nó, một `mapBackendImage` trả `null` cho mọi thứ,
   * hoặc một phép lọc `layout === 'ide'` gõ sai, cũng làm ô trên xanh mãi mãi.
   */
  it('đối chứng dương — cùng phép dò BẮT được một mục vi phạm dựng sẵn', () => {
    const fake: readonly ContentItem[] = [
      { rel: 'scenarios/gia-dinh-vi-pham', imageId: 'kubernetes-kubeadm-1node', layout: 'ide' },
      { rel: 'scenarios/khong-vi-pham', imageId: 'ubuntu', layout: 'ide' },
    ];
    const offenders = fake
      .filter((item) => item.layout === 'ide')
      .filter((item) => mapBackendImage(item.imageId)?.capabilities.includes('kubernetes') === true)
      .map((item) => item.rel);

    expect(offenders).toEqual(['scenarios/gia-dinh-vi-pham']);
  });

  /**
   * Bài IDE first-party phải còn đó và còn ở nhánh không-k8s.
   *
   * Đây không phải một ô trang trí: nếu ai đó đổi `backend.imageid` của nó sang
   * một image kubernetes thì ô "không mục nào vi phạm" ở trên sẽ đỏ — nhưng nếu
   * ai đó XOÁ khối `interface` đi thì mọi ô trên vẫn xanh, và đường
   * `interfaceLayout === 'ide'` lại trở về chỗ không nội dung nào chạm tới.
   */
  it('vẫn còn ít nhất một mục khai `ide`, và mục đó không đòi kubernetes', () => {
    const ide = items.filter((item) => item.layout === 'ide');
    expect(ide.length, 'không còn nội dung nào khai `ide` — đường IDE lại thành mã không ai chạy').toBeGreaterThan(0);
    for (const item of ide) {
      expect(mapBackendImage(item.imageId), `${item.rel}: imageid lạ`).not.toBeNull();
    }
  });
});
