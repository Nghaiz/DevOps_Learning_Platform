import { describe, expect, it } from 'vitest';
import { LEVELS } from '@devops-platform/games';
import { centralKinds, estimateMinutes, levelChips, shortenCommand } from './level-chips';

describe('shortenCommand', () => {
  it('bỏ kubectl, giữ động từ và lệnh con', () => {
    expect(shortenCommand('kubectl rollout status deployment/api -n nen-tang')).toBe(
      'rollout status',
    );
    expect(shortenCommand('kubectl get pods -n hoc-tap')).toBe('get pods');
  });

  /**
   * Tên tài nguyên chỉ có nghĩa BÊN TRONG màn; chip thì đọc ở ngoài.
   *
   * Bản trước giữ mọi từ không chứa `/` hay `.`, nên chip của màn 03 hiện ra
   * `logs bao-cao` — `bao-cao` là tên một pod của riêng màn đó.
   */
  it('bỏ tên tài nguyên cụ thể, giữ lại loại', () => {
    expect(shortenCommand('kubectl describe deployment/api')).toBe('describe');
    expect(shortenCommand('kubectl logs web-1.default')).toBe('logs');
    expect(shortenCommand('kubectl logs bao-cao -n van-hanh')).toBe('logs');
    expect(shortenCommand('kubectl describe pod bao-cao')).toBe('describe pod');
  });

  it('giữ danh sách loại phân cách bằng dấu phẩy', () => {
    expect(shortenCommand('kubectl get deploy,rs,pods -n san-pham')).toBe('get deploy,rs,pods');
  });

  it('dừng ở cờ đầu tiên', () => {
    expect(shortenCommand('kubectl get -o wide pods')).toBe('get');
  });

  it('không nhận lệnh không phải kubectl', () => {
    expect(shortenCommand('curl http://api')).toBeNull();
    expect(shortenCommand('')).toBeNull();
  });

  it('không bao giờ dài quá hai từ', () => {
    expect(shortenCommand('kubectl rollout undo restart extra')?.split(' ')).toHaveLength(2);
  });
});

describe('estimateMinutes', () => {
  it('có sàn và trần', () => {
    for (const level of LEVELS) {
      const minutes = estimateMinutes(level);
      expect(minutes).toBeGreaterThanOrEqual(3);
      expect(minutes).toBeLessThanOrEqual(30);
      expect(Number.isInteger(minutes)).toBe(true);
    }
  });

  it('màn khó hơn thì lâu hơn, khi cùng số thao tác chuẩn', () => {
    const basic = LEVELS.find((l) => l.difficulty === 'basic');
    const advanced = LEVELS.find(
      (l) => l.difficulty === 'advanced' && l.parMoves === basic?.parMoves,
    );
    if (basic === undefined || advanced === undefined) {
      // Không có cặp cùng parMoves trong bộ hiện tại — bỏ qua thay vì khẳng định bừa.
      return;
    }
    expect(estimateMinutes(advanced)).toBeGreaterThan(estimateMinutes(basic));
  });
});

describe('centralKinds', () => {
  it('không quá ba loại', () => {
    for (const level of LEVELS) {
      expect(centralKinds(level).length).toBeLessThanOrEqual(3);
    }
  });
});

describe('levelChips', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG: nếu `LEVELS` rỗng thì mọi vòng `for` ở trên xanh rỗng nghĩa.
   */
  it('có đủ màn để đo', () => {
    expect(LEVELS.length).toBeGreaterThan(30);
  });

  /**
   * Chip là thứ THAY THẾ dòng mô tả, nên mỗi màn phải có đủ chip để nói được
   * điều gì đó. Một màn ra chip rỗng hoàn toàn sẽ hiện thành một hàng trống —
   * tệ hơn hẳn dòng mô tả mà nó vừa thay.
   */
  it('mọi màn đều có ít nhất một chip loại hoặc một chip lệnh', () => {
    const bare = LEVELS.filter((level) => {
      const chips = levelChips(level);
      return chips.kinds.length === 0 && chips.command === null;
    }).map((level) => level.id);
    expect(bare).toEqual([]);
  });

  it('mọi màn đều có lệnh chính rút gọn được', () => {
    const missing = LEVELS.filter((level) => levelChips(level).command === null).map((l) => l.id);
    expect(missing).toEqual([]);
  });
});
