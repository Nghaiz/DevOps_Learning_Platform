import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, ctxFor, testDb, uniqueId } from '../../../security/test-helpers';
import { labAttempts, users } from '../../db/schema';
import { appRouter } from './app-router';

/**
 * F4 — `me.listLabAttempts` BỎ QUA dòng có lab không nạp được, nhưng trước bản
 * vá nó không nói ra điều đó ở bất cứ đâu.
 *
 * ## Chế độ hỏng
 *
 * `nextCursor` được tính từ dòng cuối của trang THÔ (trước khi lọc), còn `items`
 * là danh sách SAU khi lọc. Một lab vendored bị gỡ ⇒ trang 1 lọc sạch còn rỗng
 * trong khi `nextCursor` khác `null`. Payload khi đó không phân biệt được với
 * "người này chưa từng thử lab nào", và giao diện — vốn chỉ nhìn
 * `items.length === 0` — hiện "Chưa có lần thử nào" rồi nuốt luôn nút Trang sau.
 * Toàn bộ lịch sử phía sau không còn đường tới.
 *
 * ## Vì sao là `skipped` chứ không phải "nạp bù cho đầy trang"
 *
 * Nạp bù là một vòng lặp không có trần: N dòng hỏng liên tiếp là N lượt đọc DB
 * cho MỘT trang, và không ai biết N. `skipped` là thông tin THẬT mà tầng đọc
 * đang có sẵn và đang vứt đi — nó không suy ra được từ `items` (những dòng bị
 * bỏ không đi qua dây), nên đây không phải một derived field.
 *
 * ⚠ ĐÒI Postgres. `labAttempts.labId` KHÔNG có FK (nội dung lab nằm trên đĩa),
 * nên một labId không tồn tại là chèn được — đó chính là ca đời thật khi tác giả
 * gỡ một lab đã có người làm.
 */

const ME = { id: uniqueId('me-skip'), role: 'user' as const };
/** Có thật trên đĩa (`content/labs/`) — dòng này PHẢI sống sót qua bộ lọc. */
const LAB_CON = 'dlp-linux-triage';
/** Không tồn tại ở bất kỳ nguồn nào ⇒ `getLab` trả null ⇒ dòng bị bỏ. */
const LAB_DA_GO = uniqueId('lab-da-bi-go');

const MOI = new Date('2026-09-06T10:00:00.000Z');
const CU = new Date('2026-09-06T08:00:00.000Z');

const ID_MOI = uniqueId('attempt-moi');
const ID_CU = uniqueId('attempt-cu');

beforeAll(async () => {
  const db = testDb();
  await db.insert(users).values({ id: ME.id, name: ME.id, email: `${ME.id}@test.local`, role: 'user' });
  await db.insert(labAttempts).values([
    // Mới hơn ⇒ nằm ở trang 1 (sắp xếp `startedAt desc`) và bị lọc sạch.
    {
      id: ID_MOI,
      userId: ME.id,
      labId: LAB_DA_GO,
      sessionId: uniqueId('sess'),
      startedAt: MOI,
      submittedAt: MOI,
    },
    // Cũ hơn ⇒ nằm ở trang 2, đọc được bình thường.
    {
      id: ID_CU,
      userId: ME.id,
      labId: LAB_CON,
      sessionId: uniqueId('sess'),
      startedAt: CU,
      submittedAt: CU,
    },
  ]);
});

afterAll(async () => {
  const db = testDb();
  await db.delete(labAttempts).where(eq(labAttempts.userId, ME.id));
  await db.delete(users).where(eq(users.id, ME.id));
  await closeTestDb();
});

describe('me.listLabAttempts — trang bị lọc sạch phải NÓI RA', () => {
  it('trang rỗng vì lọc ≠ trang rỗng vì hết dữ liệu', async () => {
    const out = await appRouter.createCaller(ctxFor(ME)).me.listLabAttempts({ limit: 1 });

    // Bối cảnh của ca: trang này không có dòng nào để hiện, NHƯNG còn trang sau.
    expect(out.items).toHaveLength(0);
    expect(out.nextCursor).toBe(ID_MOI);

    // Và đây là thứ phân biệt hai kiểu rỗng. Không có nó, client chỉ thấy
    // `items: []` và không có cách nào nói đúng chuyện gì vừa xảy ra.
    expect(out.skipped).toBe(1);
  });

  it('ĐỐI CHỨNG DƯƠNG: trang đọc được báo skipped = 0', async () => {
    const caller = appRouter.createCaller(ctxFor(ME));
    const trang2 = await caller.me.listLabAttempts({ limit: 1, cursor: ID_MOI });

    expect(trang2.items).toHaveLength(1);
    expect(trang2.items[0]?.attempt.id).toBe(ID_CU);
    expect(trang2.items[0]?.labId).toBe(LAB_CON);
    expect(trang2.skipped).toBe(0);
    expect(trang2.nextCursor).toBeNull();
  });

  it('payload vẫn sống sót một vòng JSON', async () => {
    const out = await appRouter.createCaller(ctxFor(ME)).me.listLabAttempts({ limit: 5 });
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
