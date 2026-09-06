import {
  describeSessionShellFallback,
  type PreferenceNotice,
  type ShellName,
} from '../me/preference-notices';

export interface ShellFallbackInput {
  /** `session.state.sessionId` — `null` khi chưa có phiên nào đang mở. */
  readonly sessionId: string | null;
  /** Cờ server trả lúc mở phiên; `null` = chưa mở phiên nào trong lượt xem này. */
  readonly preferencesApplied: boolean | null;
  /** `me.get().preferences.defaultShell`; `null` = chưa đọc được hồ sơ. */
  readonly shell: ShellName | null;
}

/**
 * Có nên nói "phiên này không nhận được shell bạn chọn" không — HÀM THUẦN.
 *
 * Điều kiện hiện băng nằm ở đây chứ không nằm trong JSX vì đúng cái điều kiện
 * này là thứ phải chứng minh được: một băng cảnh báo hiện SAI lúc còn tệ hơn
 * một băng không hiện, và app này không có runner render component (vitest chỉ
 * quét `src/`, không có jsdom/testing-library) nên thứ gì nằm trong JSX là thứ
 * không test được.
 *
 * Ba nhánh im lặng là BA trạng thái khác nhau, không phải một:
 *
 * · `sessionId === null` — không có phiên nào để nói về. Sau `ENDED`, máy trạng
 *   thái đưa `sessionId` về `null` (`packages/terminal/src/session-machine.ts`
 *   case `'ENDED'`), nên băng tự biến mất thay vì treo lại trên một trang không
 *   còn phiên nào.
 * · `preferencesApplied !== false` — gồm cả `true` (áp được) LẪN `null` (chưa mở
 *   phiên nào nên chưa biết). Một lượt "chưa biết" không phải bằng chứng về một
 *   lượt hỏng — cùng kỷ luật với `activeSessionCount: null` ở `/settings`.
 * · `shell === null` — `me.get` chưa về. Không biết người dùng chọn gì thì không
 *   nói được họ mất gì; đoán "bạn đã chọn bash" là nói sai ở đúng chỗ câu này
 *   cần đúng.
 */
export function resolveShellFallbackNotice(input: ShellFallbackInput): PreferenceNotice | null {
  if (input.sessionId === null || input.preferencesApplied !== false || input.shell === null) {
    return null;
  }
  return describeSessionShellFallback(input.shell);
}
