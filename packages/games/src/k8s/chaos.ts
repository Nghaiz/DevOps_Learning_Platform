/**
 * Chế độ sinh tồn vô hạn: các đợt sự cố dồn tới, mỗi đợt nặng hơn đợt trước.
 *
 * ## Hai trục leo thang, và vì sao phải là hai
 *
 * Mỗi đợt nặng hơn theo **số lượng** (bao nhiêu sự cố cùng lúc) và theo **thời
 * gian** (`graceSec` — người chơi có bao lâu trước khi đợt sau chồng lên). Leo
 * thang chỉ bằng số lượng thì đợt 12 chỉ là đợt 4 lặp ba lần; leo thang chỉ
 * bằng thời gian thì nó biến thành bài kiểm tra tốc độ gõ. Hai trục cùng lúc
 * mới ép người chơi đổi CÁCH chơi: từ sửa tuần tự sang phải phân loại và chọn
 * việc nào bỏ mặc.
 *
 * ## Trục thứ ba, quan trọng nhất: độ khó của việc CHẨN ĐOÁN
 *
 * Đây là chỗ chaos mode kiếm được giá trị của nó. Ba đợt đầu chỉ bốc những sự cố
 * **nói thẳng ra nguyên nhân** trong Events — một lệnh `describe` là xong. Từ đợt
 * 5 trở đi, các đợt bắt đầu bốc **hai sự cố cùng biểu hiện** vào chung một đợt:
 *
 * - `lenh-entrypoint-sai` · `memory-limit-qua-thap` · `liveness-probe-qua-gat`
 *   — cả ba đều là "container cứ restart mãi".
 * - `service-selector-lech-label` · `readiness-probe-sai-cong` — cả hai đều là
 *   "Service không có endpoint".
 * - `node-het-cpu` · `nodeselector-khong-khop` — cả hai đều là pod `Pending`.
 * - `thieu-configmap` · `key-configmap-sai` — cả hai đều là
 *   `CreateContainerConfigError`.
 *
 * Người chơi đếm được số sự cố ngay từ bảng trạng thái, nhưng không phân biệt
 * được chúng nếu không đọc bằng chứng. Đó là thứ đáng bị kiểm dưới sức ép.
 *
 * ## Vì sao dừng bảng ở đợt 20
 *
 * Hai mươi đợt là chỗ hai trục leo thang chạm sàn: `graceSec` xuống tới
 * `GRACE_TOI_THIEU` và không nên xuống nữa (dưới ngưỡng đó thì kể cả người chơi
 * hoàn hảo cũng không kịp đọc `describe` một lần). Từ đợt 21 trở đi chỉ còn một
 * trục tăng được, và `dotHonLoan()` lo phần đó bằng công thức — thay vì viết tay
 * một bảng vô hạn mà không ai kiểm chứng nổi.
 *
 * ## Cân bằng: "vẫn thắng được tới quá đợt 15"
 *
 * Ngân sách đặt theo một giả định đo được: một người chơi giỏi cần khoảng 25–35
 * giây cho một sự cố đã nhận ra loại, và khoảng 50–60 giây cho một sự cố phải
 * phân biệt với cặp song sinh của nó. Đối chiếu với bảng dưới:
 *
 * - Đợt 5: 2 sự cố (một cặp dễ nhầm) trong 95 giây — vừa đủ, không dư.
 * - Đợt 12: 4 sự cố trong 70 giây — buộc phải bỏ qua một cái và chịu nó dồn
 *   sang đợt sau. Đây là điểm chế độ chơi đổi bản chất.
 * - Đợt 16: 5 sự cố trong 60 giây — chỉ qua được nếu người chơi đã quen tay tới
 *   mức không cần đọc gợi ý nào.
 *
 * Nghĩa là ngưỡng thua tự nhiên của một người chơi giỏi rơi vào khoảng đợt
 * 15–18, đúng mục tiêu thiết kế. Nếu đo thực tế lệch nhiều so với con số này thì
 * sửa `GRACE_*` ở đây chứ đừng sửa bảng từng dòng — bảng là dữ liệu dẫn xuất từ
 * ba hằng số đó.
 */

import type { ChaosWave, IncidentKind } from './contract.ts';

/**
 * Sàn cứng của `graceSec`. Dưới mức này thì kể cả người chơi hoàn hảo cũng không
 * kịp chạy `kubectl describe` một lần và đọc kết quả, nên độ khó tăng thêm là
 * độ khó giả — nó không kiểm thêm kỹ năng nào, chỉ kiểm tốc độ gõ.
 */
export const GRACE_TOI_THIEU = 45;

/** `graceSec` của đợt 1. Rộng rãi có chủ ý: đợt đầu là để làm quen nhịp. */
export const GRACE_BAN_DAU = 120;

/** Số sự cố tối đa mà bảng viết tay đạt tới ở đợt 20. */
export const SO_SU_CO_TOI_DA_BANG = 7;

/**
 * Hai mươi đợt viết tay.
 *
 * Cột `incidents` được chọn chứ không bốc ngẫu nhiên, vì thứ tự người chơi GẶP
 * mới là thứ dạy được điều gì. Ba đợt đầu chỉ có sự cố nói thẳng nguyên nhân;
 * cặp dễ nhầm đầu tiên xuất hiện ở đợt 5; sự cố tốn nhiều thao tác nhất
 * (`pvc-khong-co-pv-khop`, `rbac-thieu-quyen`, `node-notready`) để dành cho nửa
 * sau, khi `graceSec` đã hẹp và người chơi buộc phải quyết định bỏ cái nào.
 */
export const CHAOS_WAVES: readonly ChaosWave[] = [
  // ── Đợt 1–4: mỗi sự cố tự nói ra nguyên nhân trong Events ──────────────────
  { wave: 1, incidents: ['image-tag-sai'], graceSec: 120 },
  { wave: 2, incidents: ['thieu-configmap'], graceSec: 110 },
  { wave: 3, incidents: ['image-registry-khong-toi-duoc', 'lenh-entrypoint-sai'], graceSec: 110 },
  { wave: 4, incidents: ['service-sai-targetport', 'thieu-secret'], graceSec: 100 },

  // ── Đợt 5–9: cặp dễ nhầm đầu tiên, rồi ba sự cố cùng lúc ───────────────────
  // Đợt 5 là bước ngoặt: hai sự cố này cùng cho ra "Service không có endpoint".
  { wave: 5, incidents: ['service-selector-lech-label', 'readiness-probe-sai-cong'], graceSec: 95 },
  { wave: 6, incidents: ['memory-limit-qua-thap', 'dns-khong-phan-giai', 'ingress-sai-path'], graceSec: 95 },
  // Cả ba đều là "container cứ restart mãi" — cặp ba khó nhất trong game.
  {
    wave: 7,
    incidents: ['lenh-entrypoint-sai', 'memory-limit-qua-thap', 'liveness-probe-qua-gat'],
    graceSec: 90,
  },
  { wave: 8, incidents: ['node-het-cpu', 'thieu-imagepullsecret', 'key-configmap-sai'], graceSec: 85 },
  // Hai sự cố Pending trông giống hệt nhau, cộng một sự cố mạng để chia trí.
  {
    wave: 9,
    incidents: ['node-het-cpu', 'nodeselector-khong-khop', 'networkpolicy-chan-nham'],
    graceSec: 80,
  },

  // ── Đợt 10–13: bốn sự cố cùng lúc; bắt đầu phải bỏ bớt việc ────────────────
  {
    wave: 10,
    incidents: ['pvc-khong-co-pv-khop', 'image-tag-sai', 'readiness-probe-sai-cong', 'thieu-configmap'],
    graceSec: 80,
  },
  {
    wave: 11,
    incidents: ['probe-khong-co-initialdelay', 'khong-co-endpoint', 'resourcequota-chan', 'lenh-entrypoint-sai'],
    graceSec: 75,
  },
  // Đợt 12: điểm chế độ chơi đổi bản chất — 4 sự cố, 70 giây, không đủ cho tất cả.
  {
    wave: 12,
    incidents: ['memory-limit-qua-thap', 'liveness-probe-qua-gat', 'service-selector-lech-label', 'dns-khong-phan-giai'],
    graceSec: 70,
  },
  {
    wave: 13,
    incidents: ['storageclass-khong-ton-tai', 'serviceaccount-khong-ton-tai', 'ingress-sai-path', 'node-het-memory'],
    graceSec: 70,
  },

  // ── Đợt 14–16: năm sự cố; sự cố tốn nhiều thao tác bắt đầu vào ─────────────
  {
    wave: 14,
    incidents: ['rbac-thieu-quyen', 'image-registry-khong-toi-duoc', 'key-configmap-sai', 'thieu-configmap', 'service-sai-targetport'],
    graceSec: 65,
  },
  {
    wave: 15,
    incidents: ['node-notready', 'taint-khong-co-toleration', 'memory-limit-qua-thap', 'readiness-probe-sai-cong', 'khong-co-endpoint'],
    graceSec: 60,
  },
  {
    wave: 16,
    incidents: ['pvc-readwriteonce-hai-node', 'hpa-khong-co-metrics', 'lenh-entrypoint-sai', 'nodeselector-khong-khop', 'networkpolicy-chan-nham'],
    graceSec: 60,
  },

  // ── Đợt 17–20: sáu rồi bảy sự cố, grace chạm sàn ──────────────────────────
  {
    wave: 17,
    incidents: ['replica-vuot-quota', 'limitrange-tu-choi', 'probe-khong-co-initialdelay', 'dns-khong-phan-giai', 'thieu-secret', 'image-tag-sai'],
    graceSec: 55,
  },
  {
    wave: 18,
    incidents: ['pdb-chan-drain', 'node-het-cpu', 'node-het-memory', 'service-selector-lech-label', 'readiness-probe-sai-cong', 'key-configmap-sai'],
    graceSec: 50,
  },
  {
    wave: 19,
    incidents: ['rbac-thieu-quyen', 'serviceaccount-khong-ton-tai', 'liveness-probe-qua-gat', 'memory-limit-qua-thap', 'lenh-entrypoint-sai', 'ingress-sai-path'],
    graceSec: 50,
  },
  {
    wave: 20,
    incidents: ['node-notready', 'pvc-khong-co-pv-khop', 'storageclass-khong-ton-tai', 'networkpolicy-chan-nham', 'dns-khong-phan-giai', 'hpa-khong-co-metrics', 'resourcequota-chan'],
    graceSec: 45,
  },
];

/**
 * Kho sự cố dùng cho các đợt sau đợt 20.
 *
 * Thứ tự trong mảng là một phần của hợp đồng phát lại: `dotHonLoan()` chọn theo
 * chỉ số, nên đảo thứ tự ở đây sẽ đổi mọi đợt đã sinh ra trước đó. Thêm mục mới
 * thì thêm vào CUỐI.
 *
 * Kiểu `readonly IncidentKind[]` làm việc kiểm tính hợp lệ thành việc của trình
 * biên dịch: một chuỗi gõ sai ở đây là lỗi typecheck, không phải một sự cố im
 * lặng không bao giờ được gieo.
 */
const KHO_SU_CO: readonly IncidentKind[] = [
  'image-tag-sai',
  'lenh-entrypoint-sai',
  'memory-limit-qua-thap',
  'liveness-probe-qua-gat',
  'probe-khong-co-initialdelay',
  'readiness-probe-sai-cong',
  'service-selector-lech-label',
  'service-sai-targetport',
  'khong-co-endpoint',
  'dns-khong-phan-giai',
  'networkpolicy-chan-nham',
  'ingress-sai-path',
  'thieu-configmap',
  'key-configmap-sai',
  'thieu-secret',
  'thieu-imagepullsecret',
  'image-registry-khong-toi-duoc',
  'pvc-khong-co-pv-khop',
  'storageclass-khong-ton-tai',
  'pvc-readwriteonce-hai-node',
  'node-het-cpu',
  'node-het-memory',
  'node-notready',
  'taint-khong-co-toleration',
  'nodeselector-khong-khop',
  'resourcequota-chan',
  'limitrange-tu-choi',
  'replica-vuot-quota',
  'rbac-thieu-quyen',
  'serviceaccount-khong-ton-tai',
  'pdb-chan-drain',
  'hpa-khong-co-metrics',
];

/** Trần số sự cố một đợt. Quá mức này thì màn hình không còn đọc được nữa. */
const SO_SU_CO_TRAN = 12;

/**
 * Trả về đợt thứ `wave`, cho MỌI `wave >= 1`.
 *
 * Tới đợt 20 thì đọc thẳng từ `CHAOS_WAVES`. Từ 21 trở đi thì sinh ra bằng công
 * thức, vì `graceSec` đã chạm sàn và chỉ còn một trục tăng được.
 *
 * ⚠ Hàm này **tất định tuyệt đối**: cùng `wave` luôn cho cùng kết quả, không
 * `Math.random()`, không `Date.now()`. Đó là điều kiện để một lượt chơi chaos
 * phát lại được từ `RunLog` — xem `contract.ts` § "Nhật ký hành động". Nếu sau
 * này cần ngẫu nhiên hoá thứ tự thì phải đi qua `core/rng.ts` có hạt giống, và
 * hạt giống đó phải nằm trong `RunLog`.
 *
 * Bước nhảy `1 + (wave % 7)` là để hai đợt liên tiếp không bốc trùng bộ sự cố;
 * 7 nguyên tố cùng nhau với 32 (độ dài kho) nên chuỗi chỉ số quét hết kho trước
 * khi lặp lại.
 */
export function dotHonLoan(wave: number): ChaosWave {
  if (!Number.isInteger(wave) || wave < 1) {
    throw new RangeError(`wave phải là số nguyên >= 1, nhận được: ${String(wave)}`);
  }

  const daViet = CHAOS_WAVES[wave - 1];
  if (daViet !== undefined) return daViet;

  const soSuCo = Math.min(SO_SU_CO_TRAN, SO_SU_CO_TOI_DA_BANG + Math.floor((wave - CHAOS_WAVES.length) / 3));
  const buoc = 1 + (wave % 7);
  const incidents: IncidentKind[] = [];
  for (let i = 0; i < soSuCo; i += 1) {
    const chiSo = (wave * buoc + i * buoc) % KHO_SU_CO.length;
    const suCo = KHO_SU_CO[chiSo];
    // Kho là hằng số nên nhánh này không xảy ra; guard ở đây vì
    // `noUncheckedIndexedAccess` đang bật và một `!` sẽ che mất lỗi thật nếu
    // sau này ai đó rút ngắn kho.
    if (suCo !== undefined) incidents.push(suCo);
  }

  return { wave, incidents, graceSec: GRACE_TOI_THIEU };
}
