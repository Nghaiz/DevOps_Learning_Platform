/**
 * Hợp đồng **bài lý thuyết** (`content/games/<game>/theory/*.md`): kiểu của
 * frontmatter, và phép kiểm chéo giữa bài đọc và level.
 *
 * ⚠ File này THUẦN và KHÔNG đọc đĩa. `packages/games` chạy trong bundle trình
 * duyệt và `tsconfig` cố ý bỏ `types: ["node"]`, nên một `import 'node:fs'` lạc
 * vào đây là đỏ ngay ở typecheck. Bộ nạp đọc thư mục, tách frontmatter YAML và
 * *thu hẹp kiểu* từ `unknown` về `TheoryDoc` là việc của `apps/web`; những gì
 * còn lại sau khi đã có `TheoryDoc[]` thì nằm ở đây, để cùng một phép kiểm chạy
 * được ở cả trình duyệt lẫn Node.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI KIỂM CẢ HAI CHIỀU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Một chiều thôi là nửa cổng, và mỗi chiều mù đúng một nửa:
 *
 * - Chỉ kiểm *"mọi `usedByLevels` trỏ tới level có thật"* thì một bài lý thuyết
 *   **chưa ai viết** vẫn xanh. Level vào chơi, bấm "học sâu hơn", và không có gì
 *   mở ra.
 * - Chỉ kiểm *"mọi level đều có bài"* thì một `usedByLevels` gõ sai một ký tự
 *   vẫn xanh miễn là có bài khác phủ level đó. Bài viết xong nằm đó không ai đọc.
 *
 * Và có một chiều thứ ba ít ai nghĩ tới: `GitLevel.theoryId` là **một giá trị
 * đơn** (`string | null`), nên hai bài cùng nhận một level là một mâu thuẫn,
 * không phải một lựa chọn. Một trong hai bài chắc chắn không bao giờ được mở.
 * `level-claimed-twice` gác đúng chỗ đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHẠM VI CỦA `levelIds` LÀ MỘT QUYẾT ĐỊNH CỦA NGƯỜI GỌI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hàm không tự biết nó đang gác game nào, và đó là chủ ý: nó gác đúng tập
 * `levelIds` bạn đưa vào. Hệ quả phải nói thẳng ra vì nó là một lối thoát:
 * thu hẹp `levelIds` lại là cách **làm cổng xanh mà không viết thêm chữ nào**.
 *
 * Nên chỗ gọi thật trong sản phẩm phải truyền **trọn** `GIT_LEVEL_IDS` (cả 32),
 * không phải `CHAPTER_1_LEVEL_IDS`. Gọi theo từng chương chỉ hợp lệ trong test,
 * nơi tập level được dựng ngay tại chỗ và người đọc test nhìn thấy phạm vi.
 *
 * Cũng vì lý do đó, `gameId` KHÔNG tham gia phép kiểm: người gọi lọc theo game
 * trước khi gọi. Đưa `gameId` vào đây sẽ tạo cảm giác hàm tự lo việc phân loại,
 * trong khi thứ nó thật sự gác vẫn chỉ là tập `levelIds` được truyền vào.
 */

import type { GameId } from '../core/types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. FRONTMATTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Frontmatter YAML ở đầu mỗi file `.md`.
 *
 * ```yaml
 * ---
 * id: 01-commit-la-object
 * title: Commit là một object bất biến
 * gameId: git
 * readMinutes: 2
 * usedByLevels:
 *   - git-01-commit-la-object
 * ---
 * ```
 */
export interface TheoryFrontmatter {
  /**
   * Định danh bài đọc, **bằng đúng tên file** (bỏ đuôi `.md`).
   *
   * Với game Git, nó là id level đã bỏ tiền tố `git-` (xem `theoryIdForLevel`
   * ở `level-ids.ts`). Ánh xạ thuần cú pháp đó là chủ ý: một bảng tra thứ hai
   * giữa level và bài đọc là một chỗ nữa để lệch.
   */
  readonly id: string;
  /** Tiêu đề hiển thị. Tiếng Việt, thuật ngữ hạ tầng giữ tiếng Anh. */
  readonly title: string;
  readonly gameId: GameId;
  /**
   * Thời gian đọc ước lượng, phút, số nguyên ≥ 1.
   *
   * ⚠ Đây KHÔNG phải một con số cho đẹp: `validateTheoryDocs` đối chiếu nó với
   * số từ thật của `body`. Xem `expectedReadMinutes`.
   */
  readonly readMinutes: number;
  /**
   * Các level dùng bài đọc này, ghi bằng **id level đầy đủ** (`git-04-...`).
   *
   * Một bài phục vụ được nhiều level. Chiều ngược lại thì không: một level chỉ
   * có một `theoryId`, nên hai bài cùng khai một level là lỗi.
   */
  readonly usedByLevels: readonly string[];
}

/** Một file bài đọc đã tách xong frontmatter. */
export interface TheoryDoc {
  readonly frontmatter: TheoryFrontmatter;
  /** Phần markdown SAU khối frontmatter, nguyên văn. */
  readonly body: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. ĐẾM TỪ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tốc độ đọc quy ước của nền tảng.
 *
 * Một hằng số, không phải một tham số: nếu mỗi bài tự chọn tốc độ của mình thì
 * `readMinutes` lại thành một con số tự do, đúng thứ phép kiểm này sinh ra để
 * chặn.
 */
export const WORDS_PER_MINUTE = 200;

/**
 * Sai số cho phép giữa `readMinutes` khai và `readMinutes` tính ra, tính bằng
 * phút.
 *
 * Có sai số vì phép đếm từ dưới đây là một phép xấp xỉ, không phải một chân lý:
 * nó không biết bảng đọc chậm hơn văn xuôi, không biết người đọc dừng lại ở mỗi
 * đoạn lệnh. Một phút sai số tương đương ~200 từ, đủ rộng để không bắt lỗi vặt
 * và vẫn đủ hẹp để chặn một bài 300 từ tự khai `readMinutes: 10`.
 */
export const READ_MINUTES_SLACK = 1;

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Đếm từ trong phần **văn xuôi** của thân bài.
 *
 * Khối code có rào (``` ) bị bỏ qua, và đó là quyết định đáng nói: `WORDS_PER_MINUTE`
 * là nhịp đọc văn xuôi, còn một sơ đồ ASCII ba vùng có thể đóng góp hàng chục
 * "từ" chỉ gồm ký tự kẻ khung. Để nó vào thì bài nào có sơ đồ cũng tự thổi
 * `readMinutes` lên, tức là phép kiểm thưởng cho đúng thứ nó nên trung lập.
 *
 * Đơn giản hoá đã biết và chấp nhận: `code trong dòng` vẫn được đếm, bảng vẫn
 * được đếm, dấu `#` của heading thì không (nó không chứa chữ hay số). Thuần và
 * tất định: cùng một chuỗi luôn cho cùng một số, ở mọi máy.
 */
export function countProseWords(body: string): number {
  let insideFence = false;
  let words = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;
    for (const token of line.split(/\s+/)) {
      if (HAS_LETTER_OR_DIGIT.test(token)) words += 1;
    }
  }
  return words;
}

/** `readMinutes` mà một thân bài dài `words` từ *nên* khai. Luôn ≥ 1. */
export function expectedReadMinutes(words: number): number {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PHÉP KIỂM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mã lỗi. Đóng, và mỗi mã ứng với đúng một cách hỏng đã nghĩ tới.
 *
 * Ba mã cuối là ba chiều của phép kiểm chéo; sáu mã đầu là hình dạng của chính
 * frontmatter.
 */
export type TheoryIssueCode =
  /** `id` rỗng. Không có gì để level trỏ tới. */
  | 'blank-id'
  /** Hai bài trùng `id`. Bộ nạp sẽ giữ một và im lặng vứt cái kia. */
  | 'duplicate-id'
  | 'blank-title'
  /** Chỉ có frontmatter, không có nội dung. */
  | 'blank-body'
  /** `readMinutes` không phải số nguyên ≥ 1. */
  | 'bad-read-minutes'
  /** `readMinutes` lệch quá `READ_MINUTES_SLACK` so với số từ thật. */
  | 'read-minutes-mismatch'
  /** `usedByLevels` rỗng: bài viết xong mà không level nào mở được nó. */
  | 'no-levels-declared'
  /** CHIỀU 1: bài trỏ tới một level không tồn tại. */
  | 'level-not-found'
  /** Một bài khai cùng một level hai lần. */
  | 'duplicate-level-entry'
  /** CHIỀU 3: hai bài khác nhau cùng khai một level. */
  | 'level-claimed-twice'
  /** CHIỀU 2: level không bài nào trỏ tới. */
  | 'level-uncovered';

export interface TheoryIssue {
  readonly code: TheoryIssueCode;
  /** Bài gây lỗi. `null` khi lỗi thuộc về một level chứ không thuộc bài nào. */
  readonly docId: string | null;
  /** Level liên quan. `null` khi lỗi không nói về level nào cụ thể. */
  readonly levelId: string | null;
  /** Tiếng Việt, một câu, đủ để sửa mà không phải mở mã nguồn ra đọc. */
  readonly message: string;
}

/**
 * Đối chiếu tập bài đọc với tập level. Trả về **danh sách lỗi**, rỗng là đạt.
 *
 * Trả danh sách chứ không ném: chỗ gọi thường muốn in ra HẾT mọi chỗ hỏng trong
 * một lượt chạy, không phải sửa từng cái rồi chạy lại 12 lần.
 *
 * Thứ tự trả về là tất định: lỗi theo bài đi trước, theo đúng thứ tự `docs`;
 * rồi lỗi `level-uncovered` theo đúng thứ tự `levelIds`.
 *
 * ⚠ Phạm vi `levelIds` do người gọi quyết định, và thu hẹp nó lại là cách làm
 * cổng xanh mà không viết thêm gì. Xem chú thích đầu file.
 */
export function validateTheoryDocs(
  docs: readonly TheoryDoc[],
  levelIds: readonly string[],
): readonly TheoryIssue[] {
  const issues: TheoryIssue[] = [];
  const knownLevels = new Set(levelIds);
  const seenDocIds = new Set<string>();
  /** levelId → id của bài ĐẦU TIÊN khai nó. */
  const claimedBy = new Map<string, string>();

  for (const doc of docs) {
    const { id, title, readMinutes, usedByLevels } = doc.frontmatter;

    if (id.trim() === '') {
      issues.push({
        code: 'blank-id',
        docId: null,
        levelId: null,
        message: 'Một bài lý thuyết có `id` rỗng. `id` phải bằng đúng tên file, bỏ đuôi `.md`.',
      });
    } else if (seenDocIds.has(id)) {
      issues.push({
        code: 'duplicate-id',
        docId: id,
        levelId: null,
        message: `Hai bài cùng mang id \`${id}\`. Bộ nạp sẽ giữ một bài và im lặng bỏ bài kia.`,
      });
    } else {
      seenDocIds.add(id);
    }

    if (title.trim() === '') {
      issues.push({
        code: 'blank-title',
        docId: id,
        levelId: null,
        message: `Bài \`${id}\` không có \`title\`.`,
      });
    }

    if (doc.body.trim() === '') {
      issues.push({
        code: 'blank-body',
        docId: id,
        levelId: null,
        message: `Bài \`${id}\` chỉ có frontmatter, không có nội dung.`,
      });
    }

    if (!Number.isInteger(readMinutes) || readMinutes < 1) {
      issues.push({
        code: 'bad-read-minutes',
        docId: id,
        levelId: null,
        message: `Bài \`${id}\` khai \`readMinutes: ${String(readMinutes)}\`; phải là số nguyên ≥ 1.`,
      });
    } else {
      const words = countProseWords(doc.body);
      const expected = expectedReadMinutes(words);
      if (Math.abs(readMinutes - expected) > READ_MINUTES_SLACK) {
        issues.push({
          code: 'read-minutes-mismatch',
          docId: id,
          levelId: null,
          message:
            `Bài \`${id}\` khai \`readMinutes: ${String(readMinutes)}\` nhưng thân bài có ` +
            `${String(words)} từ, tức khoảng ${String(expected)} phút ở ${String(WORDS_PER_MINUTE)} từ/phút. ` +
            'Sửa con số, hoặc sửa độ dài bài.',
        });
      }
    }

    if (usedByLevels.length === 0) {
      issues.push({
        code: 'no-levels-declared',
        docId: id,
        levelId: null,
        message: `Bài \`${id}\` có \`usedByLevels\` rỗng: không level nào mở được nó.`,
      });
    }

    for (const levelId of usedByLevels) {
      if (!knownLevels.has(levelId)) {
        issues.push({
          code: 'level-not-found',
          docId: id,
          levelId,
          message: `Bài \`${id}\` trỏ tới level \`${levelId}\`, nhưng level đó không tồn tại.`,
        });
        continue;
      }

      const firstClaim = claimedBy.get(levelId);
      if (firstClaim === undefined) {
        claimedBy.set(levelId, id);
      } else if (firstClaim === id) {
        issues.push({
          code: 'duplicate-level-entry',
          docId: id,
          levelId,
          message: `Bài \`${id}\` khai level \`${levelId}\` hai lần.`,
        });
      } else {
        issues.push({
          code: 'level-claimed-twice',
          docId: id,
          levelId,
          message:
            `Level \`${levelId}\` được cả \`${firstClaim}\` lẫn \`${id}\` nhận. ` +
            'Một level chỉ có một `theoryId`, nên một trong hai bài sẽ không bao giờ mở ra.',
        });
      }
    }
  }

  for (const levelId of levelIds) {
    if (!claimedBy.has(levelId)) {
      issues.push({
        code: 'level-uncovered',
        docId: null,
        levelId,
        message: `Level \`${levelId}\` không có bài lý thuyết nào khai nó trong \`usedByLevels\`.`,
      });
    }
  }

  return issues;
}
