import { describe, expect, it } from 'vitest';
import { appRouter } from './app-router';

/**
 * Trần độ dài `actions[]` của `problems.submit` — §18.C.4.
 *
 * ## Vì sao ô này đọc schema TRÊN ROUTER chứ không import một hằng
 *
 * Cùng lý lẽ `authoring-input.test.ts` đã ghi: thứ bảo vệ máy chủ là schema
 * ĐƯỢC ĐĂNG KÝ, không phải một con số nằm đâu đó trong file. Một ô test import
 * `MAX_LOG_ACTIONS` rồi tự so sẽ xanh y nguyên kể cả khi ai đó gỡ `.max(...)`
 * khỏi schema — nó gác một hằng, không gác một cổng.
 *
 * ## Vì sao trần phải ở BIÊN, và vì sao ô này chứng minh được điều đó
 *
 * Một mảng mười triệu phần tử đã được phân tích và cấp phát TRƯỚC khi dòng đầu
 * tiên của `submitProblem` chạy, nên một phép kiểm `actions.length` bên trong
 * hàm đó là phép kiểm sau khi đã trả giá. Ô dưới đây gọi thẳng `parse` của
 * schema, tức đúng chỗ Zod từ chối trước khi handler được gọi.
 */

/** Schema input tầng ngoài của một procedure, lấy từ router đã dựng. */
function inputSchemaOf(name: string): { parse(value: unknown): unknown } {
  const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
  const procedure = procedures[name];
  const inputs = (procedure as { _def?: { inputs?: unknown[] } } | undefined)?._def?.inputs ?? [];
  const schema = inputs[0];
  if (schema === undefined) {
    throw new Error(`${name} không có input schema`);
  }
  return schema as { parse(value: unknown): unknown };
}

function action(tick: number): Record<string, unknown> {
  return { gameId: 'k8s', kind: 'apply', tick };
}

function submitInput(actionCount: number): Record<string, unknown> {
  return {
    code: 'K8S-0001',
    runLog: {
      gameId: 'k8s',
      levelId: 'K8S-0001',
      seed: 12345,
      actions: Array.from({ length: actionCount }, (_unused, index) => action(index)),
    },
    claimed: {
      gameId: 'k8s',
      levelId: 'K8S-0001',
      seed: 12345,
      startedAt: 0,
      finishedAt: 1000,
      objectivesMet: [],
      objectivesTotal: 1,
      commandsUsed: 1,
      hintsUsed: 0,
      score: 0,
    },
  };
}

describe('problems.submit — trần độ dài nhật ký (§18.C.4)', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG, và nó là ô quan trọng hơn ô kia.
   *
   * Một ô chỉ kiểm "mảng quá dài thì đỏ" cũng xanh khi schema từ chối MỌI đầu
   * vào vì một lý do khác (thiếu field, sai `gameId`, sai hình dạng `claimed`).
   * Ô này chốt rằng cùng hình dạng đó ở độ dài bình thường thì ĐI QUA, nên lần
   * đỏ dưới kia chỉ có thể tới từ độ dài.
   */
  it('đối chứng: nhật ký độ dài bình thường đi qua', () => {
    const schema = inputSchemaOf('problems.submit');
    expect(() => schema.parse(submitInput(500))).not.toThrow();
  });

  it('nhật ký dài hơn trần bị TỪ CHỐI ngay ở biên', () => {
    const schema = inputSchemaOf('problems.submit');
    expect(() => schema.parse(submitInput(20_001))).toThrow();
  });

  it('đúng trần thì vẫn đi qua — trần là `<=`, không phải `<`', () => {
    // Một trần lệch một đơn vị từ chối đúng lượt chơi dài nhất còn hợp lệ, và
    // triệu chứng của nó là "bài khó nhất thì không nộp được" — thứ sẽ bị đọc
    // thành lỗi của engine chứ không phải của một con số ở đây.
    const schema = inputSchemaOf('problems.submit');
    expect(() => schema.parse(submitInput(20_000))).not.toThrow();
  });

  it('thông điệp NÓI RA con số, không phải một 400 trần', () => {
    // Một `400` không giải thích đọc ra như "lượt chơi của tôi hỏng", và người
    // chơi sẽ chơi lại rồi hỏng y hệt.
    const schema = inputSchemaOf('problems.submit');
    let message = '';
    try {
      schema.parse(submitInput(20_001));
    } catch (error) {
      message = JSON.stringify(error);
    }
    expect(message).toContain('20000');
  });
});

/**
 * Trần TICK của nhật ký — nửa còn thiếu bên cạnh trần độ dài ở trên.
 *
 * Hai trần gác hai đại lượng khác nhau và không thay nhau được: trần độ dài chặn
 * SỐ hành động, còn `advance()` đốt CPU theo ĐỘ LỚN của tick. Một nhật ký 5 action
 * qua được mọi phép kiểm ở trên và vẫn là hàng chục ngày CPU.
 *
 * Cùng lý lẽ đọc-schema-trên-router: các ô này KHÔNG tự tính lại trần, chúng đẩy
 * một giá trị qua đúng cổng đang phục vụ.
 */
function submitInputWithActions(actions: readonly Record<string, unknown>[]): Record<string, unknown> {
  const base = submitInput(1);
  const runLog = base.runLog as Record<string, unknown>;
  return { ...base, runLog: { ...runLog, actions } };
}

/** Trần đọc từ chính thông điệp cổng trả về — không chép hằng sang đây. */
function rejectionMessage(input: Record<string, unknown>): string {
  try {
    inputSchemaOf('problems.submit').parse(input);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('cổng KHÔNG từ chối — ô này đang gác một thứ không tồn tại');
}

describe('problems.submit — trần tick của nhật ký', () => {
  it('đối chứng: tick bình thường đi qua', () => {
    // Nửa dương. Thiếu nó thì một cổng từ chối MỌI thứ cũng làm các ô dưới xanh,
    // và ta sẽ tin là đã chặn đúng thứ cần chặn trong khi đã chặn cả người chơi.
    expect(() =>
      inputSchemaOf('problems.submit').parse(
        submitInputWithActions([
          { gameId: 'k8s', kind: 'apply', tick: 0 },
          { gameId: 'k8s', kind: 'wait', tick: 10, ticks: 40 },
          { gameId: 'k8s', kind: 'kubectl', tick: 60 },
        ]),
      ),
    ).not.toThrow();
  });

  it('tick khổng lồ bị TỪ CHỐI ở biên, và thông điệp nói ra con số', () => {
    /*
     * `1e12` là con số đo được: `z.number()` trần NHẬN nó (chỉ `Infinity` và
     * `NaN` bị chặn), và ~927.000 tick/giây nghĩa là ~12 ngày CPU cho một lượt.
     */
    const message = rejectionMessage(
      submitInputWithActions([{ gameId: 'k8s', kind: 'kubectl', tick: 1e12 }]),
    );
    expect(message).toContain('vượt trần');
    expect(message).toContain('1000000000000');
  });

  it('`wait.ticks` CỘNG DỒN cũng bị chặn — cửa thứ hai vào `advance()`', () => {
    /*
     * Cửa này không đi qua `action.tick` chút nào: `reducer.apply` cộng thẳng
     * `action.ticks` vào mô phỏng. Mỗi action dưới đây có `tick` nhỏ xíu và
     * `ticks` vừa phải, nhưng TỔNG thì vượt trần — một cổng chỉ đọc
     * `max(action.tick)` sẽ cho cả lô này đi qua.
     */
    const message = rejectionMessage(
      submitInputWithActions(
        Array.from({ length: 20 }, (_unused, index) => ({
          gameId: 'k8s',
          kind: 'wait',
          tick: index,
          ticks: 60_000,
        })),
      ),
    );
    expect(message).toContain('vượt trần');
  });

  it('`wait` thiếu `ticks` hợp lệ bị từ chối, không lọt xuống engine', () => {
    // `looseObject` cho `ticks` đi qua dưới dạng `unknown`. Không kiểm ở đây thì
    // một `ticks: "nhieu"` xuống tới `advance()` và `Math.trunc('nhieu')` ra
    // `NaN` — vòng lặp không chạy lần nào, và lượt chấm âm thầm sai.
    expect(() =>
      inputSchemaOf('problems.submit').parse(
        submitInputWithActions([{ gameId: 'k8s', kind: 'wait', tick: 0, ticks: 'nhieu' }]),
      ),
    ).toThrow();
  });

  it('tick âm và tick thực bị từ chối — `z.number()` trần nhận cả hai', () => {
    for (const tick of [-1, 3.7]) {
      expect(() =>
        inputSchemaOf('problems.submit').parse(
          submitInputWithActions([{ gameId: 'k8s', kind: 'kubectl', tick }]),
        ),
      ).toThrow();
    }
  });
});
