import type { CopyRef } from '@devops-platform/copy';
import type { PreviewPayload } from './draft-from-preview';

/**
 * Các phần xem trước được của một bài, theo đúng thứ tự người học gặp.
 *
 * Hàm thuần, tách khỏi JSX để có test — và vì nó mang một quyết định dễ sai:
 * **nhãn phải nói đúng thứ ta biết**. Một bài học có `intro` + 3 bước + `finish`
 * là 5 phần; đánh số chúng 1..5 sẽ làm người soạn tưởng bài có 5 bước. Nên phần
 * mở đầu/kết thúc mang nhãn chữ, còn số chỉ dùng cho bước thật.
 */
export interface PreviewPhase {
  readonly key: string;
  /**
   * Chuỗi khi nhãn là RUỘT (tiêu đề tác giả tự gõ cho một phase hay một task),
   * `CopyRef` khi nhãn là VỎ (mở đầu, kết thúc, `Bước N`).
   *
   * Hai kiểu chứ không một, và đó chính là ranh giới §5.1: một tiêu đề tác giả
   * gõ bị chặn bởi số MỤC NỘI DUNG nên nó không bao giờ thành khoá, còn ba nhãn
   * mặc định bị chặn bởi số MÀN HÌNH nên chúng phải là mục tĩnh trong bản đồ.
   *
   * ⚠ Nói ra giới hạn: hợp nhất kiểu như vậy KHÔNG thêm được rào biên dịch nào,
   * vì một câu tiếng Việt viết thẳng vẫn là `string` và vẫn gán được. Thứ gác
   * nhánh đó là cổng T4 xuôi (`ui-source-coverage.test.ts` quét đúng thư mục
   * này). Cái union mua được là chỗ DỰNG câu: nhánh vỏ dựng ở nơi hiển thị, nên
   * ba khoá mặc định không bị ghép sẵn thành chuỗi trong một hàm thuần.
   */
  readonly label: string | CopyRef;
  readonly markdown: string;
}

export function previewPhases(payload: PreviewPayload): readonly PreviewPhase[] {
  switch (payload.kind) {
    case 'lesson': {
      const lesson = payload.lesson;
      if (lesson === null) {
        return [];
      }
      const phases: PreviewPhase[] = [];
      if (lesson.intro !== null) {
        phases.push({
          key: 'intro',
          label: lesson.intro.title ?? { key: 'author.draft-form-view-mo-dau' },
          markdown: lesson.intro.markdown,
        });
      }
      for (const step of lesson.steps) {
        phases.push({
          key: `step-${String(step.index)}`,
          // `index + 1` cho người đọc, `index` cho máy: `progress.step_index` là
          // 0-based và không được đổi ở đây.
          label: step.title ?? {
            key: 'author.preview-phases-buoc',
            params: { stepIndex1: String(step.index + 1) },
          },
          markdown: step.markdown,
        });
      }
      if (lesson.finish !== null) {
        phases.push({
          key: 'finish',
          label: lesson.finish.title ?? { key: 'author.draft-form-view-ket-thuc' },
          markdown: lesson.finish.markdown,
        });
      }
      return phases;
    }
    case 'lab': {
      const lab = payload.lab;
      if (lab === null) {
        return [];
      }
      return lab.tasks.map((task) => ({
        // Khoá là id BỀN của task, không phải vị trí: đổi thứ tự task không được
        // làm khung xem trước nhảy sang nội dung của task khác.
        key: `task-${task.id}`,
        label: task.title,
        markdown: task.markdown,
      }));
    }
    case 'playground':
      // Playground không có thân. Trả mảng rỗng, và trang phải nói ra điều đó
      // thay vì hiện một khung trắng trông như đang tải.
      return [];
  }
}

/**
 * Đường dẫn ảnh tương đối trong markdown thành URL tải được.
 *
 * ⛔ Phải khớp TỪNG BƯỚC với `resolveAssetUrl` của `lessons/[id]/lesson-client.tsx`:
 * xem trước mà giải đường dẫn khác trình học nghĩa là ảnh hiện ở một chỗ và mất
 * ở chỗ kia. Route `/api/scenarios/<id>/assets/<...>` phân biệt nguồn đĩa với
 * nguồn DB bằng HÌNH DẠNG segment (32 ký tự hex = `storageKey` của DB), nên chỉ
 * cần một hàm cho cả hai nguồn.
 *
 * Trả `null` cho đường dẫn không nằm dưới `assets/`: thư mục đó cũng chứa
 * `start.sh`, `common.sh` — script để đẩy vào sandbox, không phải để tải về
 * trình duyệt.
 */
export function resolveContentAssetUrl(contentId: string, relative: string): string | null {
  const cleaned = relative.replace(/^\.?\//, '');
  if (!cleaned.startsWith('assets/')) {
    return null;
  }
  return `/api/scenarios/${encodeURIComponent(contentId)}/${cleaned}`;
}
