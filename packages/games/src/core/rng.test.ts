import { describe, expect, it } from 'vitest';
import { Rng, nextFloat, nextInt, nextUint32, pick, seedRng, shuffle } from './rng.ts';

function draw(seed: number, count: number): readonly number[] {
  let state = seedRng(seed);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const step = nextUint32(state);
    out.push(step.value);
    state = step.state;
  }
  return out;
}

describe('rng', () => {
  it('cùng hạt giống cho cùng dãy', () => {
    expect(draw(12345, 8)).toEqual(draw(12345, 8));
  });

  it('hạt giống khác cho dãy khác', () => {
    expect(draw(1, 8)).not.toEqual(draw(2, 8));
  });

  /**
   * Đối chứng ÂM cho tính thuần: rút từ cùng một `state` hai lần phải ra cùng kết
   * quả. Test "cùng seed cùng dãy" ở trên KHÔNG bắt được lỗi này — một RNG giấu
   * biến đếm ở module scope vẫn qua được nó nếu mỗi lần đo đều bắt đầu từ đầu.
   */
  it('rút hai lần từ cùng một state cho cùng kết quả', () => {
    const state = seedRng(999);
    expect(nextUint32(state)).toEqual(nextUint32(state));
  });

  it('nextFloat nằm trong [0, 1)', () => {
    let state = seedRng(7);
    for (let i = 0; i < 500; i += 1) {
      const step = nextFloat(state);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(1);
      state = step.state;
    }
  });

  it('nextInt nằm trong [0, max)', () => {
    let state = seedRng(42);
    for (let i = 0; i < 500; i += 1) {
      const step = nextInt(state, 6);
      expect(step.value).toBeGreaterThanOrEqual(0);
      expect(step.value).toBeLessThan(6);
      state = step.state;
    }
  });

  it('nextInt với max không hợp lệ trả 0 chứ không ném', () => {
    const state = seedRng(1);
    expect(nextInt(state, 0).value).toBe(0);
    expect(nextInt(state, -3).value).toBe(0);
    expect(nextInt(state, Number.NaN).value).toBe(0);
  });

  it('hạt giống không hữu hạn quy về 0 chứ không ném', () => {
    expect(seedRng(Number.NaN)).toEqual({ seed: 0 });
    expect(seedRng(Number.POSITIVE_INFINITY)).toEqual({ seed: 0 });
  });

  it('hạt giống âm và số thực đều ép về uint32', () => {
    expect(seedRng(-1).seed).toBe(4294967295);
    expect(seedRng(3.9).seed).toBe(3);
  });

  it('pick trên mảng rỗng trả null chứ không ném', () => {
    expect(pick(seedRng(1), []).value).toBeNull();
  });

  it('shuffle giữ nguyên phần tử và không sửa mảng vào', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffle(seedRng(5), input);
    expect([...result.value].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shuffle tất định theo hạt giống', () => {
    expect(shuffle(seedRng(5), [1, 2, 3, 4, 5]).value).toEqual(
      shuffle(seedRng(5), [1, 2, 3, 4, 5]).value,
    );
  });

  it('bọc có trạng thái cho cùng dãy với bản thuần', () => {
    const rng = new Rng(2024);
    const fromClass = [rng.int(100), rng.int(100), rng.int(100)];
    let state = seedRng(2024);
    const fromPure: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const step = nextInt(state, 100);
      fromPure.push(step.value);
      state = step.state;
    }
    expect(fromClass).toEqual(fromPure);
  });
});
