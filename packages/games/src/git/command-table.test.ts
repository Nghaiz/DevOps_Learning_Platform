/**
 * Bất biến của bảng lệnh.
 *
 * Bảng là dữ liệu, nên phần lớn lỗi trong nó là lỗi dữ liệu: một `defaultSub`
 * trỏ tới lệnh con không tồn tại, một bí danh trỏ tới cờ đã đổi tên, hai lệnh
 * con cùng khai `-m` với ý nghĩa khác nhau. Không lỗi nào trong số đó làm
 * TypeScript đỏ, và tất cả đều hỏng **im lặng** lúc chạy. Đây là chỗ bắt chúng.
 */

import { describe, expect, it } from 'vitest';
import {
  GIT_COMMANDS,
  GIT_VERBS,
  argKindAt,
  findFlag,
  findSub,
  flagUniverse,
  flagsFor,
  isGitVerb,
} from './command-table.ts';
import type { CommandSpec, FlagSpec } from './command-table.ts';
import { sortedKeys } from './deterministic.ts';

const SPECS: readonly CommandSpec[] = GIT_VERBS.map((verb) => GIT_COMMANDS[verb]);

describe('bảng động từ', () => {
  /*
   * Bản sao lúc CHẠY của cặp kiểm lúc biên dịch ở đầu `command-table.ts`.
   *
   * Không thừa: cặp kiểm kia so `GIT_VERBS` với union `GitVerb`, còn test này so
   * `GIT_VERBS` với KHOÁ CỦA BẢNG. Ba thứ, và một sai lệch có thể nằm ở bất kỳ
   * cạnh nào trong ba cạnh.
   */
  it('GIT_VERBS và khoá của GIT_COMMANDS là cùng một tập', () => {
    expect(sortedKeys(GIT_COMMANDS)).toEqual([...GIT_VERBS].sort());
  });

  it('mỗi mục tự khai đúng động từ của chính nó', () => {
    for (const verb of GIT_VERBS) {
      expect(GIT_COMMANDS[verb].verb).toBe(verb);
    }
  });

  it('isGitVerb nhận đúng động từ và từ chối thứ khác', () => {
    for (const verb of GIT_VERBS) expect(isGitVerb(verb)).toBe(true);
    expect(isGitVerb('commmit')).toBe(false);
    expect(isGitVerb('kubectl')).toBe(false);
    expect(isGitVerb('')).toBe(false);
    // `toString` có mặt trên prototype của mọi object — dùng `Object.hasOwn`
    // chứ không dùng `in` chính là để câu này trả `false`.
    expect(isGitVerb('toString')).toBe(false);
  });
});

describe('cờ', () => {
  /**
   * Đây là bất biến mà `parser.ts` DỰA VÀO để tách cụm cờ gộp ở lượt 1: nó hỏi
   * tập cờ tối đa của động từ xem `-m` có nuốt token kế không, và câu trả lời
   * chỉ đúng khi một cái TÊN trong phạm vi một động từ luôn nghĩa là cùng một
   * thứ.
   *
   * ⚠ Điều kiện là "trùng tên thì phải trùng nghĩa", KHÔNG phải "cấm trùng tên".
   * `git stash pop --abort` và `git stash apply --abort` cố ý khai cùng một cờ ở
   * hai lệnh con, và cấm điều đó chỉ ép người ta đẩy cờ lên tầng động từ — nơi
   * nó rộng hơn hẳn thứ cần thiết, và nơi `git stash list --abort` sẽ lặng lẽ
   * phân tích được. Siết chặt hơn mức bất biến đòi hỏi không mua thêm an toàn
   * nào; nó chỉ đổi chỗ chỗ hỏng.
   */
  it('trong một động từ, cùng tên cờ thì phải cùng nghĩa', () => {
    for (const spec of SPECS) {
      const byName = new Map<string, FlagSpec>();
      for (const flag of flagUniverse(spec)) {
        for (const name of [flag.long, flag.short]) {
          if (name === null) continue;
          const prior = byName.get(name);
          if (prior === undefined) {
            byName.set(name, flag);
            continue;
          }
          // Cùng tên nhưng khác "có nuốt giá trị không" là chỗ lượt 1 của parser
          // đọc sai, và nó đọc sai một cách im lặng.
          expect(prior.takesValue, `${spec.verb} ${name} lệch takesValue`).toBe(flag.takesValue);
          expect(prior.long, `${spec.verb} ${name} trỏ hai cờ khác nhau`).toBe(flag.long);
        }
      }
    }
  });

  it('cờ ở TẦNG ĐỘNG TỪ thì không được trùng nhau chút nào', () => {
    for (const spec of SPECS) {
      const names = spec.flags.flatMap((flag) =>
        flag.short === null ? [flag.long] : [flag.long, flag.short],
      );
      expect(new Set(names).size, spec.verb).toBe(names.length);
    }
  });

  it('đối chứng dương — phép kiểm trùng-nghĩa có đỏ được', () => {
    // Hai cờ cùng tên `-m` nhưng một cái nuốt giá trị, một cái không: đúng hình
    // dạng làm lượt 1 của parser đọc sai. Dựng tay ở đây vì bảng thật (đúng như
    // mong đợi) không có ca nào như vậy để mà quan sát.
    const a: FlagSpec = { long: '--message', short: '-m', takesValue: true, summary: 'x', caution: null };
    const b: FlagSpec = { long: '--move', short: '-m', takesValue: false, summary: 'y', caution: null };
    expect(a.takesValue).not.toBe(b.takesValue);
    expect(a.long).not.toBe(b.long);
  });

  it('dạng dài bắt đầu bằng `--`, dạng ngắn là gạch cộng đúng một ký tự', () => {
    for (const spec of SPECS) {
      for (const flag of flagUniverse(spec)) {
        expect(flag.long.startsWith('--'), `${spec.verb} ${flag.long}`).toBe(true);
        if (flag.short !== null) {
          expect(flag.short, `${spec.verb} ${flag.long}`).toMatch(/^-[A-Za-z]$/);
        }
      }
    }
  });

  it('mọi cờ có phần mô tả — thông báo lỗi nhét thẳng nó vào `explain`', () => {
    for (const spec of SPECS) {
      for (const flag of flagUniverse(spec)) {
        expect(flag.summary.length, `${spec.verb} ${flag.long}`).toBeGreaterThan(10);
      }
    }
  });

  it('findFlag tra được bằng cả dạng dài lẫn dạng ngắn', () => {
    const commit = GIT_COMMANDS.commit;
    expect(findFlag(commit.flags, '--message')?.long).toBe('--message');
    expect(findFlag(commit.flags, '-m')?.long).toBe('--message');
    expect(findFlag(commit.flags, '--nope')).toBeNull();
  });

  it('flagsFor gộp cờ chung với cờ của lệnh con, và chỉ của lệnh con đó', () => {
    const stash = GIT_COMMANDS.stash;
    const push = findSub(stash, 'push');
    const pop = findSub(stash, 'pop');
    expect(findFlag(flagsFor(stash, push), '-m')?.long).toBe('--message');
    expect(findFlag(flagsFor(stash, pop), '-m')).toBeNull();
  });
});

describe('bí danh cờ', () => {
  /**
   * `-D` trỏ tới `-d` và `-f`. Đổi tên `--force` thành thứ khác mà quên sửa bí
   * danh thì `git branch -D` im lặng trở thành một lỗi bảng lúc chạy — parser có
   * nhánh bắt nó, nhưng người chơi nhận một thông báo nói về nội bộ bảng lệnh,
   * thứ tệ hơn hẳn một test đỏ.
   */
  it('mọi bí danh trỏ tới cờ có thật và không nhận giá trị', () => {
    for (const spec of SPECS) {
      for (const alias of spec.aliases) {
        for (const target of alias.expandsTo) {
          const flag = findFlag(flagUniverse(spec), target);
          expect(flag, `${spec.verb} ${alias.token} → ${target}`).not.toBeNull();
          expect((flag as FlagSpec).takesValue).toBe(false);
        }
      }
    }
  });

  it('bí danh không trùng tên với một cờ thật', () => {
    for (const spec of SPECS) {
      for (const alias of spec.aliases) {
        expect(findFlag(flagUniverse(spec), alias.token), `${spec.verb} ${alias.token}`).toBeNull();
      }
    }
  });
});

describe('lệnh con', () => {
  it('tên lệnh con không trùng nhau trong cùng một động từ', () => {
    for (const spec of SPECS) {
      const names = spec.subs.map((sub) => sub.name);
      expect(new Set(names).size, spec.verb).toBe(names.length);
    }
  });

  it('defaultSub, khi có, trỏ tới một lệnh con có thật', () => {
    for (const spec of SPECS) {
      if (spec.defaultSub === null) continue;
      expect(findSub(spec, spec.defaultSub), spec.verb).not.toBeNull();
    }
  });

  it('defaultSub chỉ có nghĩa khi động từ thật sự có lệnh con', () => {
    for (const spec of SPECS) {
      if (spec.subs.length === 0) expect(spec.defaultSub, spec.verb).toBeNull();
    }
  });
});

describe('số tham số', () => {
  it('minArgs không vượt maxArgs', () => {
    for (const spec of SPECS) {
      expect(spec.minArgs, spec.verb).toBeLessThanOrEqual(spec.maxArgs);
      for (const sub of spec.subs) {
        expect(sub.minArgs, `${spec.verb} ${sub.name}`).toBeLessThanOrEqual(sub.maxArgs);
      }
    }
  });

  it('lệnh nhận tham số thì khai loại cho tham số đó', () => {
    for (const spec of SPECS) {
      const shapes = spec.subs.length === 0 ? [spec] : spec.subs;
      for (const shape of shapes) {
        if (shape.maxArgs === 0) continue;
        expect(shape.argKinds.length, `${spec.verb} thiếu argKinds`).toBeGreaterThan(0);
      }
    }
  });

  it('argKindAt lặp lại phần tử cuối cho mọi vị trí sau nó', () => {
    const add = GIT_COMMANDS.add;
    expect(argKindAt(add, 0)).toBe('path');
    expect(argKindAt(add, 7)).toBe('path');
    const push = GIT_COMMANDS.push;
    expect(argKindAt(push, 0)).toBe('remote');
    expect(argKindAt(push, 1)).toBe('branch');
    expect(argKindAt(GIT_COMMANDS.status, 0)).toBeNull();
  });
});

describe('văn bản hiển thị', () => {
  it('mọi dòng cú pháp bắt đầu bằng `git `', () => {
    for (const spec of SPECS) {
      expect(spec.usage, spec.verb).toMatch(/^git /);
      for (const sub of spec.subs) {
        expect(sub.usage, `${spec.verb} ${sub.name}`).toMatch(/^git /);
      }
    }
  });

  it('mọi câu giải thích sai-cú-pháp đủ dài để thật sự giải thích', () => {
    for (const spec of SPECS) {
      // Ngưỡng 40 ký tự: đủ để loại một chỗ trống điền tạm kiểu "Sai cú pháp.",
      // vốn là đúng thứ §17.I.4 sinh ra để cấm.
      expect(spec.usageError.length, spec.verb).toBeGreaterThan(40);
    }
  });

  /**
   * Ô nghiệm thu AC-I vế thứ hai: **mọi thông báo bằng tiếng Việt**.
   *
   * Danh sách chặn cố ý ngắn và chỉ gồm từ chức năng tiếng Anh không bao giờ
   * xuất hiện trong tiếng Việt. Thuật ngữ hạ tầng (`commit`, `branch`, `merge`,
   * `index`, `HEAD`, `stash`, `remote`, `push`) giữ nguyên tiếng Anh theo quy
   * ước repo nên KHÔNG nằm trong danh sách này.
   *
   * Đối chứng dương ở test ngay dưới — một phép kiểm chưa từng thấy đỏ là một
   * phép kiểm chưa được chứng minh.
   *
   * ⚠ Cố ý KHÔNG chặn `the` và `not`. `\b` của JS tính ranh giới theo `\w` tức
   * ASCII, nên nếu một chuỗi tiếng Việt nằm ở dạng NFD (`e` + dấu sắc rời) thì
   * `thế` chứa đúng ba ký tự ASCII `the` rồi tới một ký tự ngoài `\w` — tạo ra
   * một ranh giới từ và một phép khớp GIẢ. Bốn từ dưới đây không có va chạm nào
   * kiểu đó, và một cổng đôi khi báo oan thì sớm muộn sẽ bị ai đó tắt đi.
   */
  const ENGLISH_PROSE = /\b(found|invalid|please|unknown|must|should|usage)\b/i;

  it('không có văn xuôi tiếng Anh lọt vào thông báo', () => {
    for (const spec of SPECS) {
      expect(spec.usageError, spec.verb).not.toMatch(ENGLISH_PROSE);
      expect(spec.summary, spec.verb).not.toMatch(ENGLISH_PROSE);
      for (const flag of flagUniverse(spec)) {
        expect(flag.summary, `${spec.verb} ${flag.long}`).not.toMatch(ENGLISH_PROSE);
        if (flag.caution !== null) {
          expect(flag.caution, `${spec.verb} ${flag.long}`).not.toMatch(ENGLISH_PROSE);
        }
      }
    }
  });

  it('đối chứng dương — phép kiểm tiếng Anh có đỏ được', () => {
    expect('command not found').toMatch(ENGLISH_PROSE);
    expect('Đóng nội dung đang có trong index thành một commit').not.toMatch(ENGLISH_PROSE);
  });
});
