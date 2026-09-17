import { describe, expect, it } from 'vitest';
import { K8S_PREDICATE_ARGS, PROBLEM_PLUGINS, type GameId } from '@devops-platform/games';

import {
  coerceGenericArg,
  genericArgs,
  isPredicateOfGame,
  k8sArgAsGeneric,
  k8sSpec,
  predicateOptions,
} from './predicate-catalog';
import { PREDICATE_SPECS } from './predicate-spec';

/**
 * Bộ tra vị từ theo game — P20, và cổng đối chiếu hai bảng K8s.
 *
 * ⛔ Lỗi mà file này gác đã SỐNG THẬT (đo 2026-09-17): trang soạn bài dựng ô
 * chọn bằng `PREDICATE_NAMES` của riêng K8s, nên **không soạn được testcase cho
 * bất kỳ game nào khác** — bài Git lẫn CI/CD đều dừng ở "Chưa chọn vị từ kiểm
 * tra". Không ô test nào bắt được vì không ô nào soạn bài cho game khác K8s.
 */

const GAMES = Object.keys(PROBLEM_PLUGINS) as GameId[];

describe('ô chọn vị từ biết mọi game', () => {
  it('có ít nhất ba game — nếu không, vòng dưới không đo gì', () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(3);
    expect(GAMES).toContain('git');
    expect(GAMES).toContain('cicd');
  });

  for (const gameId of GAMES) {
    it(`"${gameId}": ô chọn liệt kê ĐÚNG tập vị từ của game`, () => {
      const options = predicateOptions(gameId).map((o) => o.value).sort();
      const names = [...(PROBLEM_PLUGINS[gameId]?.predicateNames ?? [])].sort();
      expect(options).toEqual(names);
      expect(options.length).toBeGreaterThan(0);
    });

    it(`"${gameId}": mọi vị từ của game đều được nhận là hợp lệ`, () => {
      for (const name of PROBLEM_PLUGINS[gameId]?.predicateNames ?? []) {
        expect(isPredicateOfGame(gameId, name), `${gameId}: ${name}`).toBe(true);
      }
    });

    /*
     * ĐỐI CHỨNG ÂM, và nó là vế đã hỏng: trước P20 mọi vị từ của Git/CI-CD rơi
     * vào nhánh "không có trong bảng tra". Vị từ của game KHÁC phải bị từ chối,
     * nếu không cổng này không gác gì.
     */
    it(`"${gameId}": vị từ của game khác bị từ chối`, () => {
      const khac = GAMES.filter((g) => g !== gameId).flatMap(
        (g) => PROBLEM_PLUGINS[g]?.predicateNames ?? [],
      );
      const rieng = khac.filter((n) => !(PROBLEM_PLUGINS[gameId]?.predicateNames ?? []).includes(n));
      expect(rieng.length, 'phải có vị từ chỉ thuộc game khác').toBeGreaterThan(0);
      for (const name of rieng) {
        expect(isPredicateOfGame(gameId, name), `${gameId} không được nhận ${name}`).toBe(false);
      }
    });
  }

  it('`k8sSpec` CHỈ trả đặc tả giàu cho K8s', () => {
    expect(k8sSpec('k8s', 'resource-exists')).not.toBeNull();
    // Game khác đi bảng chung, kể cả khi tên vị từ tình cờ trùng.
    expect(k8sSpec('git', 'refExists')).toBeNull();
    expect(k8sSpec('cicd', 'rollbackUnder')).toBeNull();
  });

  it('`genericArgs` trả bảng của ĐÚNG game', () => {
    const lui = genericArgs('cicd', 'rollbackUnder');
    expect(lui.map((s) => s.name)).toEqual(['seconds']);
    expect(lui[0]?.kind).toBe('number');

    const ref = genericArgs('git', 'refPointsAtMessage');
    expect(ref.map((s) => s.name).sort()).toEqual(['message', 'ref']);
  });
});

describe('hai bảng K8s phải khớp nhau', () => {
  /*
   * `PREDICATE_SPECS` (tầng web, giàu: khoá chữ + kiểu ô riêng) và
   * `K8S_PREDICATE_ARGS` (hợp đồng plugin, phần chung) là HAI bản của cùng một
   * sự thật. Bản sao có chủ ý — kéo bản giàu xuống `packages/games` sẽ lôi tầng
   * trình bày vào một package cấm React — nên cái giá là ô này.
   */
  it('phủ cùng một tập vị từ', () => {
    expect(Object.keys(K8S_PREDICATE_ARGS).sort()).toEqual(Object.keys(PREDICATE_SPECS).sort());
  });

  it('từng vị từ khớp cả TÊN tham số, KIỂU và tính bắt buộc', () => {
    for (const [name, rich] of Object.entries(PREDICATE_SPECS)) {
      const chung = K8S_PREDICATE_ARGS[name];
      expect(chung, `thiếu ${name} ở bảng chung`).toBeDefined();
      if (chung === undefined) continue;
      expect(chung, name).toEqual(rich.args.map(k8sArgAsGeneric));
    }
  });
});

describe('ép kiểu tham số theo bảng chung', () => {
  const num = { name: 'seconds', kind: 'number', optional: false } as const;
  const bool = { name: 'detached', kind: 'boolean', optional: true } as const;
  const lines = { name: 'lines', kind: 'lines', optional: false } as const;
  const str = { name: 'ref', kind: 'string', optional: false } as const;

  it('ô trống ⇒ bỏ hẳn khoá, không gửi chuỗi rỗng', () => {
    expect(coerceGenericArg(num, '   ')).toEqual({ kind: 'bo-trong' });
  });

  it('số hợp lệ ⇒ số THẬT, không phải chuỗi', () => {
    /*
     * Ô đắt nhất: `Testcase.args` là `unknown`, nên `'120'` lưu xuống được và
     * chỉ hỏng lúc chấm — `argNumber` trả `null`, vị từ trả `false`, bài không
     * bao giờ qua được.
     */
    expect(coerceGenericArg(num, ' 120 ')).toEqual({ kind: 'ok', value: 120 });
    expect(coerceGenericArg(num, 'mười')).toEqual({ kind: 'sai-kieu' });
  });

  it('boolean chỉ nhận đúng hai chữ', () => {
    expect(coerceGenericArg(bool, 'true')).toEqual({ kind: 'ok', value: true });
    expect(coerceGenericArg(bool, 'false')).toEqual({ kind: 'ok', value: false });
    expect(coerceGenericArg(bool, 'True')).toEqual({ kind: 'sai-kieu' });
  });

  it('lines cắt theo dòng và BỎ `\r` của CRLF', () => {
    /*
     * Ô soạn trên Windows gửi CRLF. Một dòng còn `\r` ở cuối sẽ KHÔNG khớp chuỗi
     * mà engine so, và người soạn thấy một mục tiêu đúng-mà-trượt.
     */
    /*
     * ⚠ KHÔNG có phần tử rỗng ở cuối: `coerceGenericArg` cắt khoảng trắng hai
     * đầu TRƯỚC khi tách dòng, nên `\r\n` cuối chuỗi biến mất cùng lượt trim.
     * Kỳ vọng đầu của ô này ghi `['a','b','']` và SAI — mã đúng, ô sai.
     */
    expect(coerceGenericArg(lines, 'a\r\nb\r\n')).toEqual({ kind: 'ok', value: ['a', 'b'] });
    // Dòng rỗng Ở GIỮA thì phải giữ — nó là một phần tử thật.
    expect(coerceGenericArg(lines, 'a\r\n\r\nb')).toEqual({ kind: 'ok', value: ['a', '', 'b'] });
  });

  it('chuỗi giữ nguyên sau khi cắt khoảng trắng hai đầu', () => {
    expect(coerceGenericArg(str, '  main  ')).toEqual({ kind: 'ok', value: 'main' });
  });
});
