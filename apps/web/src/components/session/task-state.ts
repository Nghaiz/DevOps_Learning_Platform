/**
 * P16 · 16.D.4 — trạng thái HIỂN THỊ của một nhiệm vụ lab, tách khỏi React.
 *
 * ⚠ TÊN FILE: `task-state.ts`, KHÔNG phải `task-checklist.ts`.
 *
 * Lượt đầu đặt tên nó trùng với `task-checklist.tsx` và chỉ khác đuôi. `tsc`
 * xanh sạch, `eslint` sạch, 242 ô test xanh — rồi `next build` ĐỎ với
 * `Export outcomeKind doesn't exist in target module`. Hai bộ phân giải chọn
 * hai file khác nhau cho cùng một chuỗi `'./task-checklist'`: `tsc` lấy bản
 * `.ts`, còn Turbopack lấy bản `.tsx`.
 *
 * Nên trong thư mục này KHÔNG được có hai file cùng tên gốc khác đuôi
 * `.ts`/`.tsx`. Repo vốn đã theo quy ước đó (`workspace-tabs.ts` +
 * `workspace-panel.tsx`); lượt này phá nó ở HAI chỗ và cả hai được đổi tên
 * (`workspace-split.ts` cũng thành `split-shape.ts`).
 *
 * ## Vấn đề: tầng dữ liệu đã phân biệt đúng, phần nhìn thì chưa
 *
 * `lab-client.tsx` tách nhánh `kind:'error'` khỏi `passed:false` từ lâu, và
 * `CheckResultPanel` vẽ hai nhánh đó bằng hai CẤU TRÚC khác hẳn nhau. Nhưng
 * DANH SÁCH nhiệm vụ thì chỉ đọc `TaskDisplay.state`, mà kiểu đó chỉ có ba giá
 * trị (`not-attempted` / `passed` / `failed`) và không mang thông tin về lượt
 * chấm đang chạy hay lượt chấm không chạy được.
 *
 * Hệ quả trên màn hình: một lượt chấm hỏng vì cụm hiện ra trong danh sách y hệt
 * một bài làm sai. Người học sẽ đi sửa một thứ không sai, rất lâu, và không có
 * gì trong giao diện nói cho họ biết là họ đang sửa nhầm chỗ.
 *
 * ## Vì sao là một hàm THUẦN chứ không phải một trường mới trong `TaskDisplay`
 *
 * `rules/code-conventions.md` § "No Derived Fields": trạng thái hiển thị TÍNH
 * ĐƯỢC từ hai thứ đã lưu (kết quả server ghi lại, và kết quả lượt chấm hiện
 * thời trong state của trang). Lưu thêm một trường thứ ba là dựng một nguồn sự
 * thật thứ hai, và nó sẽ lệch đúng vào lúc hai nguồn kia đổi không cùng nhịp.
 *
 * Là hàm thuần thì bảng vào/ra khẳng định thẳng được, không phải suy ngược từ
 * DOM.
 */

/** Trạng thái đã LƯU của một nhiệm vụ, do server ghi lại (`task-status.ts`). */
export type StoredTaskState = 'not-attempted' | 'passed' | 'failed';

/** Nhánh của lượt chấm ĐANG diễn ra trong trang. `null` = phiên này chưa chấm. */
export type TaskOutcomeKind = 'running' | 'passed' | 'failed' | 'error' | null;

/**
 * BỐN trạng thái nhìn được, cộng `running`.
 *
 * `infra` là giá trị mà cả lane này tồn tại để thêm vào: nó KHÁC HẲN `failed`,
 * và trước P16 hai thứ đó vẽ ra cùng một viên badge.
 */
export type TaskVisualState = 'not-attempted' | 'running' | 'passed' | 'failed' | 'infra';

/**
 * Gộp "server đã ghi gì" với "lượt chấm vừa rồi ra sao" thành đúng MỘT trạng
 * thái để vẽ.
 *
 * Thứ tự ưu tiên, và mỗi bậc là một quyết định chứ không phải một tiện tay:
 *
 * 1. **`running` thắng tất cả.** Một lượt chấm đang bay là thứ mới nhất người
 *    học vừa làm; hiện trạng thái cũ trong lúc đó đọc ra là nút bấm không ăn.
 * 2. **`passed` đã ghi thắng `infra`.** Một lượt chấm ĐẠT là sự thật server đã
 *    lưu; một lượt chấm sau đó không chạy được KHÔNG xoá được sự thật ấy. Vẽ
 *    `infra` đè lên sẽ làm người học tưởng mình vừa mất điểm. Lỗi hạ tầng vẫn
 *    hiện đầy đủ ở `CheckResultPanel` của nhiệm vụ đang chọn, nên nó không bị
 *    giấu, chỉ là không được phép ghi đè một kết quả tốt.
 * 3. **`infra`** khi lượt chấm gần nhất không chạy được.
 * 4. Còn lại thì lấy trạng thái đã lưu.
 *
 * ⚠ Vế `passed` của `outcome` KHÔNG được đọc trực tiếp thành `passed` ở đây,
 * và đó là chủ ý: sau một lượt chấm thành công, `lab-client` nạp lại
 * `getAttempt` nên trạng thái ĐÃ LƯU là nguồn đúng. Đọc từ outcome sẽ cho một
 * cửa sổ vài trăm mili giây mà hai nguồn nói hai điều khác nhau, và cửa sổ đó
 * đúng bằng thời gian người học đang nhìn chằm chằm vào dòng ấy.
 */
export function resolveTaskVisualState(
  stored: StoredTaskState,
  outcome: TaskOutcomeKind,
): TaskVisualState {
  if (outcome === 'running') {
    return 'running';
  }
  if (stored === 'passed') {
    return 'passed';
  }
  if (outcome === 'error') {
    return 'infra';
  }
  return stored;
}

/**
 * Nhánh của một `CheckOutcome` dưới dạng chuỗi phẳng.
 *
 * Tách ra để `resolveTaskVisualState` KHÔNG phải import kiểu `CheckOutcome` từ
 * thư mục route của trang bài học: hàm thuần này sống ở `components/session/`
 * và cả lab lẫn lesson đều gọi, nên nó không được biết gì về hình dạng cụ thể
 * của một outcome.
 */
export function outcomeKind(
  outcome: { readonly kind: 'running' | 'result' | 'error'; readonly passed?: boolean } | null,
): TaskOutcomeKind {
  if (outcome === null) {
    return null;
  }
  if (outcome.kind === 'running') {
    return 'running';
  }
  if (outcome.kind === 'error') {
    return 'error';
  }
  return outcome.passed === true ? 'passed' : 'failed';
}

/**
 * Đếm nhiệm vụ theo trạng thái nhìn được, cho dòng tóm tắt trên đầu danh sách.
 *
 * Trả về một `Record` ĐỦ năm khoá kể cả khi giá trị là 0: một bảng đếm thiếu
 * khoá bắt mọi nơi gọi phải `?? 0`, và chỗ nào quên thì in ra `undefined`.
 */
export function countByVisualState(
  states: readonly TaskVisualState[],
): Readonly<Record<TaskVisualState, number>> {
  const out: Record<TaskVisualState, number> = {
    'not-attempted': 0,
    running: 0,
    passed: 0,
    failed: 0,
    infra: 0,
  };
  for (const state of states) {
    out[state] += 1;
  }
  return out;
}
