/**
 * Ô gác giữ `PREDICATE_ARGS` khớp với thứ ENGINE thật sự đọc.
 *
 * `PREDICATE_ARGS` là một bản sao có chủ ý (xem khối đầu `predicate-args.ts`).
 * Ô này là cái giá phải trả cho bản sao đó: nó mở thẳng
 * `packages/games/src/git/predicates.ts`, bóc mọi lời gọi `arg*(args, '<tên>')`
 * trong từng nhánh `case`, rồi đòi hai bên khớp cả TÊN, cả KIỂU, cả tính bắt
 * buộc. Đổi engine mà quên bảng ⇒ đỏ, nêu đích danh vị từ.
 *
 * ## Vì sao đọc mã nguồn chứ không đọc chú thích JSDoc
 *
 * `contract.ts` có sẵn một dòng ``args: `{ ref, message }` `` cho gần như mọi vị
 * từ, và bóc nó dễ hơn nhiều. Nhưng chú thích là thứ NGƯỜI viết, và nó trôi khỏi
 * mã đúng theo cách mà một bảng chép tay trôi — tức ô gác sẽ so một bản sao với
 * một bản sao khác. Mã thực thi là thứ quyết định vị từ trả `true` hay `false`,
 * nên nó là thứ phải so.
 *
 * ## Vì sao KHÔNG so thứ tự
 *
 * Thứ tự trong `PREDICATE_ARGS` là thứ tự hiện trên biểu mẫu, và nó chỉ tình cờ
 * trùng thứ tự đọc trong engine. Ép khớp thứ tự sẽ làm ô này đỏ vì một lượt sắp
 * lại dòng không đổi hành vi gì, tức đỏ vì lý do sai.
 *
 * ## Phép đối chứng dương đã chạy
 *
 * 2026-09-15, ba lượt, mỗi lượt khôi phục ngay sau đó:
 *
 *  · `refExists: [REF]` → `[]` ⇒ ĐỎ, `vị từ refExists: expected [] to deeply
 *    equal [ 'ref:string' ]`.
 *  · `stashCount` đổi `number` → `string` ⇒ ĐỎ, `expected [ 'count:string' ] to
 *    deeply equal [ 'count:number' ]`.
 *  · hỏng chính bộ bóc (`case` → `caseXX` trong regex cắt nhánh) ⇒ ĐỎ CẢ BA ô,
 *    ô đối chứng rỗng đi trước. Lượt này là lượt đáng giá nhất: không có nó thì
 *    một regex hỏng sẽ so `[]` với `[]` cho cả 25 vị từ và xanh vĩnh viễn.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { GIT_PREDICATE_NAMES } from '@devops-platform/games';

import { PREDICATE_ARGS, type ArgKind } from './predicate-args';

/** Đi ngược lên tới gốc workspace. Đếm `..` bằng tay là một con số sẽ sai lúc ai đó đổi cây. */
function workspaceRoot(): string {
  let at = import.meta.dirname;
  while (!existsSync(join(at, 'pnpm-workspace.yaml'))) {
    const up = dirname(at);
    if (up === at) throw new Error('không tìm thấy gốc workspace');
    at = up;
  }
  return at;
}

const SOURCE = join(workspaceRoot(), 'packages/games/src/git/predicates.ts');

const KIND_OF: Readonly<Record<string, ArgKind>> = {
  argString: 'string',
  argNumber: 'number',
  argBoolean: 'boolean',
  argLines: 'lines',
};

interface ReadArg {
  readonly name: string;
  readonly kind: ArgKind;
  readonly optional: boolean;
}

/**
 * Cắt `evaluatePredicate` thành từng nhánh `case`, rồi bóc lời gọi `arg*` trong
 * mỗi nhánh.
 *
 * Tính "tuỳ chọn" đọc từ `?? ` ngay sau lời gọi: `argBoolean(args, 'detached') ??
 * true` nghĩa là engine có mặc định, nên bỏ trống vẫn chấm được.
 */
function argsReadByEngine(source: string): ReadonlyMap<string, readonly ReadArg[]> {
  const out = new Map<string, ReadArg[]>();
  // Cắt theo `case '<tên>':`, giữ tên của nhánh và thân tới `case` kế tiếp.
  const parts = source.split(/case '([A-Za-z]+)':/);
  // parts[0] là phần trước case đầu tiên; sau đó lần lượt (tên, thân).
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i] as string;
    const body = parts[i + 1] ?? '';
    const read: ReadArg[] = [];
    const call = /\b(argString|argNumber|argBoolean|argLines)\(args, '([A-Za-z]+)'\)(\s*\?\?)?/g;
    let hit: RegExpExecArray | null = call.exec(body);
    while (hit !== null) {
      read.push({
        name: hit[2] as string,
        kind: KIND_OF[hit[1] as string] as ArgKind,
        optional: hit[3] !== undefined,
      });
      hit = call.exec(body);
    }
    out.set(name, read);
  }
  return out;
}

function fingerprint(specs: readonly ReadArg[]): readonly string[] {
  return specs.map((s) => `${s.name}:${s.kind}${s.optional ? '?' : ''}`).sort();
}

describe('PREDICATE_ARGS khớp thứ engine thật sự đọc', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const byEngine = argsReadByEngine(source);

  it('bộ bóc nhìn thấy CẢ 25 vị từ, không phải một tập rỗng xanh giả', () => {
    /*
     * Đối chứng rỗng. Một regex hỏng sẽ trả Map rỗng, và lúc đó mọi khẳng định
     * dưới thành `[] === []` — ô gác xanh vĩnh viễn trong khi nó không đo gì cả
     * (`rules/green-that-proves-nothing.md`).
     */
    for (const name of GIT_PREDICATE_NAMES) {
      expect(byEngine.has(name), `bộ bóc không thấy nhánh case cho ${name}`).toBe(true);
    }
    expect([...byEngine.values()].flat().length).toBeGreaterThan(20);
  });

  it('mỗi vị từ khai đúng tên, kiểu và tính bắt buộc của tham số', () => {
    for (const name of GIT_PREDICATE_NAMES) {
      expect(fingerprint(PREDICATE_ARGS[name]), `vị từ ${name}`).toEqual(
        fingerprint(byEngine.get(name) ?? []),
      );
    }
  });

  it('graphShapeMatches không nhận tham số nào, vì nó so với cây đích', () => {
    expect(PREDICATE_ARGS.graphShapeMatches).toEqual([]);
    expect(byEngine.get('graphShapeMatches')).toEqual([]);
  });
});
