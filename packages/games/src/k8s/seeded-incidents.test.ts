import { describe, expect, it } from 'vitest';

import type { Level } from './contract.ts';

import { CHALLENGES } from './challenges.ts';
import { LEVELS } from './levels/index.ts';
import { createCluster } from './model.ts';
import { initialState, replay } from './reducer.ts';

/**
 * Cổng cho một lớp lỗi KHÔNG có gì đỏ để báo: một hàm có mặt, có test riêng của
 * nó, nhưng không nằm trên đường chạy nào.
 *
 * Lỗi thật (2026-09-08): `seedIncidents` được export và được test đầy đủ, nhưng
 * `initialState` không gọi nó. Hệ quả là `state.incidents` luôn rỗng, nên vị từ
 * `no-incident-active` đúng một cách RỖNG NGHĨA và bảy level qua được mục tiêu
 * đó trong khi sự cố chưa từng tồn tại. Typecheck xanh, 299 test xanh, cổng từ
 * vựng xanh. Chỉ có người đọc mã mới thấy.
 */
describe('sự cố gieo sẵn phải THẬT SỰ được gieo', () => {
  const seeded = LEVELS.filter((level) =>
    level.initialState.resources.some((r) => r.seededIncident !== undefined),
  );

  it('có level dùng seededIncident — nếu không, mọi khẳng định dưới đây rỗng nghĩa', () => {
    expect(seeded.length).toBeGreaterThan(0);
  });

  it.each(seeded.map((level) => [level.id, level] as const))(
    '%s — initialState sinh ra ít nhất một sự cố đang hoạt động',
    (_id, level) => {
      expect(initialState(level, 1).incidents.length).toBeGreaterThan(0);
    },
  );

  /**
   * ĐỐI CHỨNG ÂM. Không có nó thì test trên vẫn xanh kể cả khi `createCluster`
   * tự sinh sự cố vì một lý do khác — tức nó sẽ không còn đo cái mối nối nữa.
   */
  it('createCluster MỘT MÌNH không gieo gì — nên phép đo trên đo đúng mối nối', () => {
    const level = seeded[0];
    expect(level).toBeDefined();
    if (level === undefined) return;
    expect(createCluster(level.initialState, 1).incidents).toHaveLength(0);
  });

  /**
   * Đường phát lại phải gieo GIỐNG HỆT đường chơi thật. Lệch nhau thì mọi lượt
   * chơi thật thà đều trượt xác minh, vì trạng thái đầu đã khác trước cả action
   * đầu tiên — và triệu chứng sẽ đọc ra thành "người chơi gian lận".
   */
  it('replay gieo y hệt initialState — nếu lệch, người chơi thật thà bị gắn cờ', () => {
    const level = seeded[0];
    expect(level).toBeDefined();
    if (level === undefined) return;
    expect(replay(level, 7, []).incidents).toEqual(initialState(level, 7).incidents);
  });

  it('challenge cũng vậy — cùng engine, cùng mối nối', () => {
    const template = LEVELS[0];
    expect(template).toBeDefined();
    if (template === undefined) return;

    const withSeed = CHALLENGES.filter((c) =>
      c.initialState.resources.some((r) => r.seededIncident !== undefined),
    );
    for (const challenge of withSeed) {
      /* Mượn vỏ của một level thật rồi thay `initialState`: `initialState()` chỉ
       * đọc đúng field đó, và làm vậy tránh phải dựng một `Level` giả mà mọi
       * field bắt buộc đều là số liệu bịa. */
      const level: Level = { ...template, initialState: challenge.initialState };
      expect(initialState(level, 1).incidents.length).toBeGreaterThan(0);
    }
  });
});
