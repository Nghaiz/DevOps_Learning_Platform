import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Level } from './contract.ts';
import { createSession, defaultNamespace, sessionPhase } from './session.ts';
import { TICK_MS } from './tick.ts';

function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 'test-01',
    chapter: 1,
    title: 'Test',
    brief: '',
    difficulty: 'basic',
    initialState: {
      nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
      namespaces: ['hoc-tap'],
      resources: [],
    },
    allowedResources: ['Pod'],
    objectives: [
      {
        id: 'co-pod',
        label: 'Có pod web',
        check: 'resource-exists',
        args: { kind: 'Pod', name: 'web', namespace: 'hoc-tap' },
        required: true,
      },
    ],
    hints: ['gợi ý một', 'gợi ý hai'],
    parMoves: 1,
    teaches: [],
    ...overrides,
  };
}

const POD_YAML = `apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: hoc-tap
spec:
  containers:
    - name: web
      image: nginx:1.27-alpine
`;

afterEach(() => {
  vi.useRealTimers();
});

describe('getView — tham chiếu ổn định', () => {
  /**
   * ⚠ Ô này gác một lỗi KHÔNG có stack trace hữu ích.
   *
   * `useSyncExternalStore` so snapshot bằng `Object.is`. Trả một object mới ở mỗi
   * lần gọi ⇒ React kết luận trạng thái đổi ở mỗi lần render ⇒ vòng lặp render vô
   * hạn, và thông báo lỗi không chỉ về `getView`. Rẻ hơn nhiều khi bắt ở đây.
   */
  it('trả CÙNG một tham chiếu khi trạng thái không đổi', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    expect(session.getView()).toBe(session.getView());
    session.dispose();
  });

  /**
   * Đối chứng ÂM. Thiếu ô này thì một `getView` nhớ vĩnh viễn — không bao giờ
   * dựng lại — vẫn qua được ô trên, và giao diện sẽ đứng hình mãi mãi.
   */
  it('trả tham chiếu MỚI sau khi trạng thái thật sự đổi', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    const before = session.getView();
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    expect(session.getView()).not.toBe(before);
    session.dispose();
  });

  it('hành động KHÔNG đổi trạng thái thì giữ nguyên tham chiếu', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    const before = session.getView();
    session.dispatch({ tick: 0, kind: 'hint', index: 0 });
    expect(session.getView()).toBe(before);
    session.dispose();
  });
});

describe('getStatus', () => {
  it('objectivesMet tính lại, và MẤT lại được khi người chơi xoá đi', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    expect(session.getStatus().objectivesMet).toEqual([]);
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    expect(session.getStatus().objectivesMet).toEqual(['co-pod']);
    expect(session.getStatus().phase).toBe('won');

    // Mục tiêu đã tích QUAY VỀ chưa-tích. Đó là một điều đúng về Kubernetes:
    // trạng thái mong muốn phải được duy trì, không phải đạt một lần rồi thôi.
    session.dispatch({
      tick: 0,
      kind: 'delete',
      target: { kind: 'Pod', namespace: 'hoc-tap', name: 'web' },
    });
    session.dispatch({ tick: 0, kind: 'wait', ticks: 61 });
    expect(session.getStatus().objectivesMet).toEqual([]);
    expect(session.getStatus().phase).toBe('playing');
    session.dispose();
  });

  it('đếm nước đi và gợi ý theo đúng SSOT của reducer', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    session.dispatch({ tick: 0, kind: 'hint', index: 0 });
    session.dispatch({ tick: 0, kind: 'hint', index: 0 });
    session.dispatch({ tick: 0, kind: 'wait', ticks: 2 });
    const status = session.getStatus();
    expect(status.movesUsed).toBe(1);
    expect(status.hintsRevealed).toBe(1);
    session.dispose();
  });
});

describe('log hành động', () => {
  it('ghi tick THẬT của mô phỏng, không phải tick bên gọi truyền vào', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    session.dispatch({ tick: 0, kind: 'wait', ticks: 10 });
    session.dispatch({ tick: 999, kind: 'apply', yaml: POD_YAML });
    const log = session.getLog();
    expect(log.actions[1]?.tick).toBe(10);
    session.dispose();
  });

  it('hành động KHÔNG hợp lệ không vào log — nên không lane nào phải loại nó khi đếm', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    session.dispatch({ tick: 0, kind: 'apply', yaml: 'khong: [phai' });
    expect(session.getLog().actions).toHaveLength(0);
    expect(session.getStatus().movesUsed).toBe(0);
    session.dispose();
  });

  it('log mang levelId và seed, đủ để phát lại từ số không', () => {
    const session = createSession({ level: level(), seed: 4242, autoTick: false });
    const log = session.getLog();
    expect(log.levelId).toBe('test-01');
    expect(log.seed).toBe(4242);
    session.dispose();
  });
});

describe('đồng hồ', () => {
  it('autoTick: false ⇒ mô phỏng KHÔNG tự tiến', () => {
    vi.useFakeTimers();
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    vi.advanceTimersByTime(TICK_MS * 20);
    expect(session.getView().tick).toBe(0);
    session.dispose();
  });

  it('autoTick mặc định BẬT và tiến theo TICK_MS', () => {
    vi.useFakeTimers();
    const session = createSession({ level: level(), seed: 1 });
    vi.advanceTimersByTime(TICK_MS * 5);
    expect(session.getView().tick).toBe(5);
    session.dispose();
  });

  it('dispose dừng đồng hồ và mọi dispatch sau đó là vô hiệu', () => {
    vi.useFakeTimers();
    const session = createSession({ level: level(), seed: 1 });
    vi.advanceTimersByTime(TICK_MS * 3);
    const afterThree = session.getView().tick;
    session.dispose();
    vi.advanceTimersByTime(TICK_MS * 50);
    expect(session.getView().tick).toBe(afterThree);
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    expect(session.getLog().actions).toHaveLength(0);
  });
});

describe('subscribe', () => {
  it('báo khi trạng thái đổi, im khi không đổi, và huỷ đăng ký được', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    let calls = 0;
    const unsubscribe = session.subscribe(() => {
      calls += 1;
    });
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    expect(calls).toBe(1);
    // `hint` không đụng tới cụm — không được đánh thức renderer.
    session.dispatch({ tick: 0, kind: 'hint', index: 0 });
    expect(calls).toBe(1);
    unsubscribe();
    session.dispatch({ tick: 0, kind: 'wait', ticks: 5 });
    expect(calls).toBe(1);
    session.dispose();
  });
});

describe('namespace mặc định', () => {
  it('lấy namespace ĐẦU TIÊN của level, không phải "default"', () => {
    expect(defaultNamespace(level())).toBe('hoc-tap');
  });

  it('level không khai namespace nào thì về "default"', () => {
    const bare = level({
      initialState: { nodes: [], namespaces: [], resources: [] },
    });
    expect(defaultNamespace(bare)).toBe('default');
  });

  it('lệnh không kèm -n chạy trong namespace của level', () => {
    const session = createSession({ level: level(), seed: 1, autoTick: false });
    session.dispatch({ tick: 0, kind: 'apply', yaml: POD_YAML });
    expect(session.getStatus().objectivesMet).toEqual(['co-pod']);
    session.dispose();
  });
});

describe('sessionPhase', () => {
  const required = { id: 'a', label: '', check: 'x', required: true } as const;
  const bonus = { id: 'b', label: '', check: 'y', required: false } as const;

  it('thắng khi đạt hết mục tiêu BẮT BUỘC, mục tiêu thưởng không chặn', () => {
    expect(sessionPhase([required, bonus], ['a'])).toBe('won');
  });

  it('thiếu một mục tiêu bắt buộc thì vẫn đang chơi', () => {
    expect(sessionPhase([required, bonus], ['b'])).toBe('playing');
  });

  /**
   * Level không có mục tiêu bắt buộc nào KHÔNG được tự thắng. `[].every(...)`
   * trả `true`, nên thiếu chặn riêng là một level viết thiếu sẽ thắng ngay ở
   * tick 0 — cùng cái bẫy đã xuất hiện hai lần ở `core/achievements.ts`.
   */
  it('level không có mục tiêu bắt buộc KHÔNG tự thắng', () => {
    expect(sessionPhase([bonus], ['b'])).toBe('playing');
    expect(sessionPhase([], [])).toBe('playing');
  });
});
