/**
 * Phép chuyển giữa Ô NHẬP NHIỀU DÒNG và các trường mảng của `LevelDraft` — §18.E.
 *
 * Tách khỏi component vì đây là chỗ một cái bẫy đã được ghi sẵn ở
 * `git/level-draft.ts`: với `allowedCommands`, **`null` nghĩa là cho dùng mọi
 * lệnh, còn `[]` nghĩa NGƯỢC LẠI — cấm mọi lệnh**. Một `textarea` rỗng sinh ra
 * `''`, và `''.split('\n').filter(...)` trả `[]`, tức đúng cái nghĩa ngược. Bẫy
 * đó đã cắn một lần ở `k8s/problem.ts`, nên phép chuyển ở đây phải là một hàm có
 * tên, có test, chứ không phải một biểu thức nội tuyến trong JSX.
 *
 * Ba trường mảng còn lại (`hints`, `solutionCommands`, `altSolutionCommands`)
 * KHÔNG mang nghĩa ngược đó: rỗng là rỗng. Nên chúng dùng `linesToList`, và sự
 * khác nhau giữa hai hàm là cố ý chứ không phải trùng lặp chưa gộp.
 */

import type { LevelDraft } from '@devops-platform/games';

/** Mỗi dòng khác rỗng là một phần tử. Khoảng trắng hai đầu bị cắt. */
export function linesToList(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function listToLines(list: readonly string[]): string {
  return list.join('\n');
}

/**
 * Ô "tập lệnh cho phép": TRẮNG ⇒ `null` (không giới hạn), chứ không phải `[]`.
 *
 * Người soạn muốn cấm mọi lệnh thì không có đường nào gõ ra được điều đó ở đây,
 * và điều đó là CỐ Ý: một level cấm mọi lệnh là một level không chơi được, và
 * `levelDraftIssues` đã từ chối `[]` vì cùng lý do. Đường duy nhất tới `[]` là
 * nhập một JSON đã mang sẵn nó, và lúc đó phép kiểm sẽ nói ra.
 */
export function parseAllowedCommands(text: string): readonly string[] | null {
  const list = linesToList(text.replaceAll(',', '\n'));
  return list.length === 0 ? null : list;
}

export function formatAllowedCommands(value: readonly string[] | null): string {
  return value === null ? '' : value.join('\n');
}

/**
 * Tên tệp khi tải bản xuất về.
 *
 * Dựa vào `id` vì `id` đã bị `levelDraftIssues` ép về slug thường không dấu, nên
 * nó an toàn cho mọi hệ tệp. Nháp chưa có id thì rơi về một tên chung: người soạn
 * đang thử, không phải đang lưu trữ.
 */
export function exportFileName(draft: LevelDraft): string {
  const id = draft.id.trim();
  return id === '' ? 'level-nhap.json' : `${id}.json`;
}
