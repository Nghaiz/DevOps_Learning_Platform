import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
import { problemHintReveals } from '../db/schema';

/**
 * Những gợi ý mà NGƯỜI ĐANG XEM đã mở, theo từng bài.
 *
 * Một truy vấn cho cả trang thay vì một truy vấn mỗi bài: trang danh sách trả
 * tối đa 100 dòng, và 100 lượt round-trip để điền một cờ boolean là hình dạng
 * N+1 kinh điển. `IN (…)` trên khoá chính gộp đi thẳng vào chỉ mục.
 */
export async function revealedHintsFor(
  db: DbOrTx,
  userId: string,
  problemCodes: readonly string[],
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const byCode = new Map<string, Set<string>>();
  if (problemCodes.length === 0) {
    return byCode;
  }
  const rows = await db
    .select({ problemCode: problemHintReveals.problemCode, hintId: problemHintReveals.hintId })
    .from(problemHintReveals)
    .where(
      and(
        eq(problemHintReveals.userId, userId),
        inArray(problemHintReveals.problemCode, [...problemCodes]),
      ),
    );
  for (const row of rows) {
    const set = byCode.get(row.problemCode) ?? new Set<string>();
    set.add(row.hintId);
    byCode.set(row.problemCode, set);
  }
  return byCode;
}

/** Tập gợi ý đã mở của một bài. Rỗng khi chưa mở cái nào. */
export async function revealedHintsForOne(
  db: DbOrTx,
  userId: string,
  problemCode: string,
): Promise<ReadonlySet<string>> {
  const byCode = await revealedHintsFor(db, userId, [problemCode]);
  return byCode.get(problemCode) ?? new Set<string>();
}

/**
 * Ghi nhận một lượt mở gợi ý. Idempotent.
 *
 * `onConflictDoNothing` chứ không phải "đọc rồi ghi nếu chưa có": hai tab cùng
 * bấm mở một gợi ý là chuyện thường, và phép đọc-rồi-ghi có một khe giữa hai
 * bước để cả hai cùng thấy "chưa có". Khoá chính gộp là trọng tài, không phải
 * câu `SELECT`.
 *
 * Mở lại một gợi ý đã mở KHÔNG trừ điểm lần hai, vì điểm trừ tính trên TẬP id ở
 * `submit.ts` chứ không tính trên số dòng — một tập không có phần tử trùng.
 */
export async function recordHintReveal(
  db: DbOrTx,
  userId: string,
  problemCode: string,
  hintId: string,
): Promise<void> {
  await db
    .insert(problemHintReveals)
    .values({ userId, problemCode, hintId })
    .onConflictDoNothing();
}
