/**
 * Từ vựng mà bộ gợi ý terminal tra vào: lời giải thích cho từng động từ, và
 * bảng cờ.
 *
 * Hai nửa của file này có mức tin cậy KHÁC NHAU, và chỗ khác nhau đó là điều
 * quan trọng nhất cần biết khi sửa nó:
 *
 * - **Động từ và động từ con — CÓ CỔNG GÁC.** Danh sách không nằm ở đây; nó là
 *   `KUBECTL_VERBS` do engine export, và hằng đó mang một cặp kiểm tra hai chiều
 *   lúc biên dịch. Ở đây chỉ còn phần LỜI, gắn bằng `satisfies Record<KubectlVerb,
 *   string>` / `Record<RolloutSub, string>` — nên thêm một động từ vào
 *   `KubectlCommand` là file này đỏ ngay vì thiếu lời giải thích. Không có đường
 *   nào để gợi ý lệch khỏi bộ phân tích mà không ai biết.
 *
 * - **Cờ — VẪN LÀ BẢN CHÉP, KHÔNG CÓ CỔNG GÁC.** `readFlags` trong `kubectl.ts`
 *   là một `switch`, không phải bảng tra, nên không có dữ liệu nào để đọc. Nặn
 *   một bảng ra khỏi `switch` đó là sửa logic phân tích lệnh — việc của lane
 *   khác. Hệ quả phải nhớ: thêm hoặc đổi một cờ ở `kubectl.ts` mà quên đây thì
 *   gợi ý lặng lẽ sai, và KHÔNG có gì đỏ. Thiệt hại bị chặn ở mức thấp nhất —
 *   gợi ý sai chỉ mất một gợi ý, lệnh vẫn chạy đúng vì `parseKubectl` mới là bên
 *   phân tích lúc bấm Enter.
 */

import type { KubectlVerb, RolloutSub } from '@devops-platform/games';

export interface Suggestion {
  /** Token thay thế cho phần đang gõ dở. */
  readonly value: string;
  /** Một dòng tiếng Việt hiện cạnh gợi ý. */
  readonly hint: string;
}

/** Lời cho chín động từ. Thiếu một dòng là biên dịch đỏ — xem đầu file. */
export const VERB_HINTS = {
  get: 'Bảng tóm tắt — trạng thái hiện thời',
  describe: 'Chi tiết + Events — chỗ nguyên nhân nằm',
  delete: 'Xoá tài nguyên',
  scale: 'Đổi số bản sao (--replicas=N)',
  apply: 'Áp manifest từ tệp (-f)',
  edit: 'Sửa tài nguyên đang có',
  logs: 'Log container; --previous cho lần chạy trước',
  exec: 'Chạy lệnh bên trong container',
  rollout: 'status · restart · undo · history',
} as const satisfies Record<KubectlVerb, string>;

export const ROLLOUT_HINTS = {
  status: 'Bản cuộn đã xong chưa',
  restart: 'Cuộn lại toàn bộ pod',
  undo: 'Quay về phiên bản trước',
  history: 'Các phiên bản đã cuộn',
} as const satisfies Record<RolloutSub, string>;

export const ROLLOUT_SUBS: readonly Suggestion[] = (
  Object.entries(ROLLOUT_HINTS) as [RolloutSub, string][]
).map(([value, hint]) => ({ value, hint }));

const COMMON_FLAGS: readonly Suggestion[] = [
  { value: '-n', hint: 'Namespace cần xem' },
  { value: '-A', hint: 'Mọi namespace' },
  { value: '-l', hint: 'Lọc theo label, ví dụ -l app=web' },
  { value: '-o', hint: 'Định dạng ra (wide, yaml)' },
  { value: '--show-labels', hint: 'Hiện cột label' },
];

/** Cờ riêng theo động từ. Ghép với `COMMON_FLAGS` ở `flagsFor`. Bản chép — xem đầu file. */
const VERB_FLAGS: Readonly<Record<string, readonly Suggestion[]>> = {
  logs: [
    { value: '--previous', hint: 'Log của LẦN CHẠY TRƯỚC — chỗ duy nhất còn bằng chứng khi pod CrashLoop' },
    { value: '-c', hint: 'Chọn container trong pod nhiều container' },
  ],
  exec: [
    { value: '-it', hint: 'Phiên tương tác' },
    { value: '-c', hint: 'Chọn container' },
    { value: '--', hint: 'Kết thúc phần cờ; sau nó là lệnh cho container' },
  ],
  apply: [{ value: '-f', hint: 'Tệp manifest cần áp' }],
  scale: [{ value: '--replicas', hint: 'Số bản sao mong muốn, dạng --replicas=3' }],
  delete: [
    { value: '--force', hint: 'Xoá ngay, không chờ grace period' },
    { value: '--grace-period', hint: 'Số giây chờ trước khi kết liễu' },
  ],
};

/**
 * Cờ ĂN một token phía sau khi không viết dạng `--cờ=giá-trị`. Bản chép — xem đầu file.
 *
 * Cần bảng này để đếm ĐÚNG vị trí đối số: `kubectl -n prod get pods` hợp lệ, nên
 * "token thứ ba" và "đối số thứ nhất" không phải một thứ, và bỏ qua chuyện này
 * làm gợi ý lệch một ô ngay khi người chơi gõ `-n`.
 */
export const FLAGS_TAKING_VALUE = new Set([
  '-n', '--namespace', '-l', '--selector', '-o', '--output',
  '-c', '--container', '-f', '--filename', '--grace-period', '--wait',
]);

export function flagsFor(verb: string): readonly Suggestion[] {
  return [...(VERB_FLAGS[verb] ?? []), ...COMMON_FLAGS];
}
