import { describe, expect, it } from 'vitest';
import { LEVELS, createSession, parseKubectl, type ObjectView } from '@devops-platform/games';
import { ARENA_ACTIONS, availableActions, buildAction, commandFor } from './inspector-action-list';

const SEED = 11;

/**
 * Mọi object có thật trong cả 36 level — tập hình dạng rộng nhất repo này có.
 *
 * `autoTick: false` là bắt buộc: mỗi phiên bật một `setInterval`, và 36 phiên
 * chạy nền trong một file test là 36 bộ hẹn giờ không ai dừng.
 */
function everyObject(): readonly { readonly level: string; readonly object: ObjectView }[] {
  const all: { level: string; object: ObjectView }[] = [];
  for (const level of LEVELS) {
    const session = createSession({ level, seed: SEED, autoTick: false });
    for (const object of session.getView().objects) {
      all.push({ level: level.id, object });
    }
    session.dispose();
  }
  return all;
}

describe('inspector-action-list', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG cho cả file. Không có ô này, mọi vòng `for` dưới đây xanh
   * một cách rỗng nghĩa nếu `everyObject()` trả mảng rỗng.
   */
  it('có đủ object để đo, phủ nhiều loại', () => {
    const all = everyObject();
    expect(all.length).toBeGreaterThan(50);
    expect(new Set(all.map(({ object }) => object.kind)).size).toBeGreaterThan(5);
  });

  /**
   * CỔNG TRUNG TÂM: mọi câu lệnh mà menu có thể phát ra đều phải được engine
   * phân tích được.
   *
   * Một mục menu phát ra lệnh engine không hiểu thì tệ hơn hẳn việc không có mục
   * đó: người chơi bấm, terminal trả về một câu lỗi cú pháp, và họ kết luận là
   * mình gõ sai chứ không phải giao diện sai.
   */
  it('mọi lệnh của kênh terminal đều được engine chấp nhận', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const { level, object } of everyObject()) {
      for (const action of availableActions(object)) {
        if (action.channel !== 'terminal') continue;
        const command = commandFor(action.id, object);
        expect(command, `${level} · ${object.kind}/${object.name} · ${action.id}`).not.toBeNull();
        if (command === null) continue;
        checked += 1;
        const parsed = parseKubectl(command);
        if (!parsed.ok) {
          failures.push(`${level} · ${action.id} · "${command}" → ${parsed.error}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(failures).toEqual([]);
  });

  it('hành động kênh engine dựng được GameAction, kênh terminal thì không', () => {
    for (const { object } of everyObject()) {
      for (const action of availableActions(object)) {
        const built = buildAction(action.id, object, 0, 3);
        if (action.channel === 'engine') {
          expect(built, `${object.kind} · ${action.id}`).not.toBeNull();
        } else {
          expect(built, `${object.kind} · ${action.id}`).toBeNull();
        }
      }
    }
  });

  it('Node không có mục xoá', () => {
    const node = everyObject().find(({ object }) => object.kind === 'Node');
    expect(node).toBeDefined();
    if (node === undefined) return;
    expect(availableActions(node.object).map((a) => a.id)).not.toContain('delete');
    expect(buildAction('delete', node.object, 0, 1)).toBeNull();
  });

  /** Pod chưa từng restart thì không có log lần trước để mà xem. */
  it('mục log-lần-trước chỉ hiện khi container đã chết ít nhất một lần', () => {
    for (const { object } of everyObject()) {
      if (object.kind !== 'Pod') continue;
      const has = availableActions(object).some((a) => a.id === 'logs-previous');
      expect(has, `${object.name} restarts=${String(object.restartCount)}`).toBe(
        (object.restartCount ?? 0) > 0,
      );
    }
  });

  it('mỗi loại tài nguyên có một tập hành động khác nhau', () => {
    const byKind = new Map<string, string>();
    for (const { object } of everyObject()) {
      byKind.set(
        object.kind,
        availableActions(object)
          .map((a) => a.id)
          .join(','),
      );
    }
    // Nếu mọi loại ra cùng một tập thì việc lọc theo loại đã hỏng — và đó chính
    // là lời phàn nàn "chuột phải chưa khác biệt cho từng resource".
    expect(new Set(byKind.values()).size).toBeGreaterThan(2);
  });

  it('mọi hành động đều khai kênh', () => {
    for (const action of ARENA_ACTIONS) {
      expect(['engine', 'terminal']).toContain(action.channel);
    }
  });
});
