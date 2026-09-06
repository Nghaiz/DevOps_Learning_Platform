/**
 * Kết quả một lượt `authoring.update` — và vì sao nó cần một hàm riêng.
 *
 * `update` trên một bài **đã xuất bản** KHÔNG sửa bài đó. Nó tạo một **bản nháp
 * kế nhiệm** id `<id>__draft`, giữ nguyên từng byte của bản người học đang chạy,
 * rồi trả `{ id: '<id>__draft', supersedes: '<id>' }`. Xem `authoring.ts`
 * (`draftIdFor`) và `publish.ts` (đường "đổi ngôi").
 *
 * Một chữ "Đã lưu" chung cho cả hai nhánh là nói dối bằng cách bỏ bớt: người
 * soạn đóng tab, mở lại `/lessons`, thấy nội dung CŨ, và kết luận là hệ thống
 * mất bài của họ. Chuyện thật xảy ra sau đó tệ hơn — họ sửa lại lần nữa, lần nữa,
 * mỗi lần đều "thành công", và không lần nào tới được người học.
 *
 * Nên nhánh rẽ nhánh được TÍNH ở đây, có test, và UI chỉ vẽ thứ hàm này trả về.
 */

export interface SaveOutcome {
  /** `warning` cho nhánh tách nháp: đã lưu, nhưng CHƯA tới người học. */
  readonly tone: 'success' | 'warning';
  readonly title: string;
  readonly detail: string | null;
  /**
   * Id mà trang sửa bài phải chuyển tới sau khi lưu.
   *
   * Ở nhánh tách nháp, đây là bản nháp mới — ở lại id cũ nghĩa là ô nhập vẫn
   * đang hiện nội dung ĐÃ XUẤT BẢN trong khi thay đổi nằm ở chỗ khác, và lượt
   * sửa kế tiếp lại ghi đè lên bản nháp qua một đường vòng.
   */
  readonly editId: string;
  /** `true` khi cần điều hướng (id đổi). Suy từ hai id, không lưu riêng. */
  readonly navigate: boolean;
}

/**
 * @param result Nguyên văn thứ `authoring.update` trả về.
 * @param currentId Id đang mở trên trang sửa bài.
 */
export function describeSaveOutcome(
  result: { readonly id: string; readonly supersedes: string | null },
  currentId: string,
): SaveOutcome {
  if (result.supersedes === null) {
    return {
      tone: 'success',
      title: 'Đã lưu bản nháp',
      detail: null,
      editId: result.id,
      navigate: result.id !== currentId,
    };
  }

  return {
    tone: 'warning',
    title: 'Đã tạo bản nháp kế nhiệm — bài đang chạy CHƯA đổi',
    detail:
      `Bài "${result.supersedes}" mà người học đang học giữ nguyên. Thay đổi của bạn nằm ở bản nháp ` +
      `"${result.id}" và chỉ thay thế bản đang chạy khi bạn bấm Xuất bản.`,
    editId: result.id,
    navigate: result.id !== currentId,
  };
}
