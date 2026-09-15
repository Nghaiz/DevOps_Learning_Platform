import { describe, expect, it } from 'vitest';
import { PROBLEM_PLUGINS } from '@devops-platform/games';
import {
  ANY_PROBLEM_CODE_PATTERN,
  PROBLEM_CODE_PREFIXES,
  codePrefixFor,
  isAnyProblemCode,
  isProblemCodeOf,
} from './problem-code';
import { problemCodeSchema } from './validate';

/**
 * Ô gác của khuôn mã bài đa-game.
 *
 * ⛔ Mọi khẳng định ở đây so với `PROBLEM_PLUGINS`, KHÔNG so với một mảng
 * `['GIT', 'K8S']` chép tay. Một ô test chép tay danh sách sẽ xanh mãi mãi kể cả
 * khi `PROBLEM_CODE_PREFIXES` ngừng đọc plugin và quay lại khoá cứng — tức nó
 * gác đúng cái nó không gác được. Chỗ duy nhất được viết chuỗi thẳng là hai ca
 * ĐỐI CHỨNG bên dưới, nơi chuỗi là DỮ LIỆU vào chứ không phải lời khai về tập.
 */
describe('khuôn mã bài đa-game', () => {
  it('tập tiền tố đúng bằng tập plugin đang có, không thừa không thiếu', () => {
    const fromPlugins = Object.values(PROBLEM_PLUGINS)
      .filter((plugin) => plugin !== undefined)
      .map((plugin) => plugin.codePrefix)
      .sort((a, b) => a.localeCompare(b));
    expect(PROBLEM_CODE_PREFIXES).toEqual(fromPlugins);
    // Tiền đề: bảng plugin không rỗng. `toEqual([])` trên hai mảng rỗng xanh mà
    // không chứng minh gì — đúng hình dạng `green-that-proves-nothing.md`.
    expect(fromPlugins.length).toBeGreaterThan(1);
  });

  it('nhận mã của MỌI game có plugin', () => {
    for (const prefix of PROBLEM_CODE_PREFIXES) {
      expect(isAnyProblemCode(`${prefix}-0001`), prefix).toBe(true);
      expect(isAnyProblemCode(`${prefix}-9999`), prefix).toBe(true);
    }
  });

  /*
   * Đối chứng ÂM. Không có ô này thì một regex `.` bất kỳ (ví dụ `^.*$` do ghép
   * nhầm) vẫn làm ô trên xanh.
   */
  it('từ chối tiền tố lạ, sai số chữ số, sai hoa thường, và mọi thứ quanh mã', () => {
    for (const bad of [
      'LAB-0042',
      'K8S-42',
      'K8S-00042',
      'k8s-0042',
      'git-0001',
      'GIT-000',
      '',
      'K8S-0042 ',
      'xxGIT-0001',
      'GIT-0001xx',
    ]) {
      expect(isAnyProblemCode(bad), bad).toBe(false);
    }
  });

  it('regex không mang cờ global — một RegExp dùng lại có lastIndex sẽ trả false xen kẽ', () => {
    expect(ANY_PROBLEM_CODE_PATTERN.global).toBe(false);
    expect(isAnyProblemCode('GIT-0001')).toBe(true);
    expect(isAnyProblemCode('GIT-0001')).toBe(true);
  });

  it('isProblemCodeOf hẹp theo đúng một game, không nhận mã của game khác', () => {
    expect(isProblemCodeOf('GIT-0001', 'GIT')).toBe(true);
    expect(isProblemCodeOf('K8S-0001', 'GIT')).toBe(false);
    expect(isProblemCodeOf('GIT-0001', 'K8S')).toBe(false);
  });

  it('tiền tố tra theo gameId, và game chưa có plugin thì NÉM chứ không rơi về K8S', () => {
    expect(codePrefixFor('git')).toBe('GIT');
    expect(codePrefixFor('k8s')).toBe('K8S');
    // `pipeline` là `GameId` hợp lệ mà chưa có engine chấm. Rơi về một mặc định
    // ở đây sẽ cấp cho nó một mã `K8S-`, và không cổng nào đỏ.
    expect(() => codePrefixFor('pipeline')).toThrow(/chưa có plugin/u);
  });

  /*
   * Ô này là lý do cả file tồn tại: `problemCodeSchema` là input của `byCode`,
   * `publish`, `archive`, `delete`, `forEdit`. Trước 2026-09-15 nó khoá vào
   * `^K8S-\d{4}$`, nên một bài Git lưu xuống được rồi không mở nổi.
   */
  it('problemCodeSchema nhận mã Git — nếu không thì bài Git lưu được mà không mở được', () => {
    expect(problemCodeSchema.safeParse('GIT-0001').success).toBe(true);
    expect(problemCodeSchema.safeParse('K8S-0042').success).toBe(true);
    expect(problemCodeSchema.safeParse('LAB-0042').success).toBe(false);
  });
});
