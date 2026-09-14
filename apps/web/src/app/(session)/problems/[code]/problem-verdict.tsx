import type { ReactElement } from 'react';
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Badge } from '@devops-platform/ui';
import type { VerdictView } from '@devops-platform/games';

/**
 * Verdict của một lượt nộp — §18.B.3 và §18.B.5.
 *
 * ⛔ Component KHÔNG tự suy verdict và KHÔNG tự tính phân số. Nó nhận
 * `VerdictView` đã dựng sẵn ở `packages/games/src/core/verdict-view.ts`, nơi
 * duy nhất gọi `problemVerdictOf`. Viết `passed === total` ở đây sẽ
 * làm phép so verdict client-với-server của §18.C.3 nói về hai hàm thay vì nói
 * về engine.
 *
 * ⛔ `CE` KHÔNG in phân số, và kiểu `VerdictView` đã ép điều đó: `fraction` là
 * `null` ở nhánh đó, nên không có số nào để in kể cả khi ai đó muốn. Đây là cả
 * điểm của §18.B.5, lượt chơi không chạy tới nơi thì `passed`/`total` không nói
 * lên gì và `0/5` là một lời nói dối.
 *
 * ── ĐÃ CÓ CHỖ GỌI kể từ 2026-09-14 ──
 *
 * ⛔ ĐÍNH CHÍNH. Bản trước của khối này nói "không màn nào trong `apps/web` gọi
 * `problems.submit`" và "component này có test nhưng chưa có màn hình". Cả hai
 * câu đã hết đúng trong cùng ngày: `use-problem-submit.ts` nộp lượt chơi từ đấu
 * trường và dựng `VerdictView` từ kết quả máy chủ trả. Giữ lại lời đính chính
 * thay vì xoá lặng, vì một chú thích sai nguy hiểm hơn một chú thích thiếu.
 *
 * Câu thứ ba của bản cũ cũng đã hết đúng: `problem_submissions` NAY CÓ
 * `passed text[]` + `total integer`. Nhưng kết luận rút ra từ nó thì vẫn nguyên
 * giá trị, nên đọc kỹ chỗ này: lịch sử nộp bài KHÔNG vẽ verdict từ cột `solved`.
 * `solved` đếm theo mục tiêu BẮT BUỘC còn verdict đếm theo MỌI testcase, nên ở
 * bài có mục tiêu thưởng hai số lệch nhau một cách hợp lệ. Lịch sử vẽ verdict
 * qua `submissionVerdictLabel` ở `./submission-verdict.ts`, đọc thẳng hai cột
 * mới, và đó cũng là nơi `total === 0` được dịch thành một nhãn KHÁC `CE`.
 */
export function ProblemVerdict({ view }: { readonly view: VerdictView }): ReactElement {
  return (
    <section
      className="flex flex-col gap-3"
      aria-label={t('catalog.problem.verdict-region')}
    >
      <div className="flex items-center gap-3">
        <VerdictBadge view={view} />
        <p className="text-sm text-muted-foreground">{noteFor(view)}</p>
      </div>

      {view.failed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {view.failed.map((testcase) => (
            <li
              key={testcase.id}
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              {/*
                Một testcase ẩn mà nhãn vẫn `null` ở đây nghĩa là chỗ gọi truyền
                nhầm bộ teaser chưa mở khoá. Vẽ một câu nói ra điều đó thay vì
                `!` hay chuỗi rỗng: một dòng trống trong danh sách "cái này sai"
                là thứ tệ nhất có thể hiện cho người đang tìm lỗi.
              */}
              <span className="text-sm text-foreground">
                {testcase.label ?? t('catalog.problem.verdict-unnamed')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Nhãn verdict.
 *
 * Chữ `AC` / `WA (4/5)` / `CE` nằm TRONG badge, không phải một màu nền mang
 * nghĩa: một người không phân biệt được màu vẫn phải đọc được kết quả, và biểu
 * tượng đi kèm luôn `aria-hidden` vì nó chỉ lặp lại thứ chữ đã nói.
 */
function VerdictBadge({ view }: { readonly view: VerdictView }): ReactElement {
  if (view.verdict === 'AC') {
    return (
      <Badge variant="status-done" icon={null}>
        <CircleCheck aria-hidden className="size-3" />
        {t('catalog.problem.verdict-ac')}
      </Badge>
    );
  }
  if (view.verdict === 'CE') {
    return (
      <Badge variant="outline" icon={null}>
        <CircleAlert aria-hidden className="size-3" />
        {t('catalog.problem.verdict-ce')}
      </Badge>
    );
  }
  return (
    <Badge variant="status-todo" icon={null}>
      <CircleX aria-hidden className="size-3" />
      {/*
        Cả `WA (4/5)` là MỘT khoá, không phải `WA` ghép với một phân số dựng ở
        JSX. Mẫu số là thứ nói cho người làm biết họ còn cách bao xa, nên nó
        không được rơi ra khỏi nhãn khi ai đó sửa layout.

        `view.fraction` khác `null` ở mọi nhánh không phải `CE` theo kiểu, nhưng
        TypeScript không thu hẹp được điều đó từ `verdict` nên vẫn phải có nhánh
        dự phòng. Dùng 0/0 chứ không `!`: một khẳng định sai ở đây sẽ nổ lúc
        chạy, còn `0/0` chỉ là một con số vô nghĩa hiện ra.
      */}
      {t('catalog.problem.verdict-wa', {
        passed: view.fraction?.passed ?? 0,
        total: view.fraction?.total ?? 0,
      })}
    </Badge>
  );
}

function noteFor(view: VerdictView): string {
  if (view.verdict === 'AC') {
    return t('catalog.problem.verdict-ac-note');
  }
  if (view.verdict === 'CE') {
    // Câu cụ thể của máy chủ nói lỗi ở ĐÂU; câu chung chỉ nói rằng lượt không
    // chạy tới nơi. Ưu tiên câu cụ thể, giữ câu chung làm nền khi máy chủ không
    // gửi lý do.
    return view.failedReason ?? t('catalog.problem.verdict-ce-note');
  }
  return t('catalog.problem.verdict-wa-note', { failed: view.failed.length });
}
