/**
 * Gợi ý Tab.
 *
 * Điều đáng kiểm nhất không phải "có gợi ý không" mà là "gợi ý ĐÚNG BỂ không":
 * `git switch <Tab>` ra tên branch thật hay ra tên lệnh. Bể sai thì gợi ý vẫn
 * hiện ra đầy đủ và trông rất bình thường — đó là kiểu hỏng im lặng mà bộ gợi ý
 * của game K8s đã mang suốt một thời gian trước khi ai đó tình cờ nhận ra.
 */

import { describe, expect, it } from 'vitest';
import { GIT_VERBS } from './command-table.ts';
import type { SuggestContext } from './suggest.ts';
import { applySuggestion, suggest } from './suggest.ts';

const CONTEXT: SuggestContext = {
  branches: ['main', 'tinh-nang/gio-hang', 'sua-loi'],
  tags: ['v1.0', 'v1.1'],
  remotes: ['origin', 'ban-sao'],
  files: ['src/a.ts', 'src/b.ts', 'README.md'],
  allowedCommands: null,
};

describe('vị trí đầu dòng', () => {
  it('dòng rỗng gợi ý `git`', () => {
    expect(suggest('', CONTEXT)).toEqual(['git']);
  });

  it('sau `git ` là danh sách động từ', () => {
    expect(suggest('git ', CONTEXT)).toEqual([...GIT_VERBS].slice(0, 12));
  });

  it('lọc động từ theo phần đã gõ', () => {
    expect(suggest('git sw', CONTEXT)).toEqual(['switch']);
    expect(suggest('git st', CONTEXT)).toEqual(['status', 'stash']);
  });

  it('thứ gì không phải `git` thì không gợi ý gì', () => {
    expect(suggest('kubectl ', CONTEXT)).toEqual([]);
  });

  it('động từ lạ thì không gợi ý bừa cho nó', () => {
    expect(suggest('git zzz ', CONTEXT)).toEqual([]);
  });
});

describe('giới hạn lệnh của level', () => {
  /**
   * ⚠ `null` = cho dùng MỌI lệnh; `[]` = cấm MỌI lệnh. Hai ca này trông giống
   * nhau ở mọi phép gộp bằng `||` hoặc `??`, và đó là cái bẫy đã cắn một lần ở
   * `k8s/problem.ts` — nên chúng có hai test riêng.
   */
  it('`null` là không giới hạn', () => {
    expect(suggest('git ', { ...CONTEXT, allowedCommands: null }).length).toBeGreaterThan(5);
  });

  it('mảng rỗng là cấm tất', () => {
    expect(suggest('git ', { ...CONTEXT, allowedCommands: [] })).toEqual([]);
  });

  it('chỉ gợi ý lệnh level cho phép', () => {
    expect(suggest('git ', { ...CONTEXT, allowedCommands: ['add', 'commit'] })).toEqual([
      'add',
      'commit',
    ]);
  });
});

describe('tham số vị trí gợi ý đúng bể', () => {
  /** Ô nghiệm thu của I.3: branch thật, không phải tên lệnh. */
  it('`git switch ` ra tên branch', () => {
    expect(suggest('git switch ', CONTEXT)).toEqual(CONTEXT.branches);
  });

  it('`git switch ti` lọc theo tiền tố', () => {
    expect(suggest('git switch ti', CONTEXT)).toEqual(['tinh-nang/gio-hang']);
  });

  it('`git merge ` cũng là branch', () => {
    expect(suggest('git merge ', CONTEXT)).toEqual(CONTEXT.branches);
  });

  it('`git reset ` nhận ref nên gộp cả branch lẫn tag', () => {
    expect(suggest('git reset ', CONTEXT)).toEqual([...CONTEXT.branches, ...CONTEXT.tags]);
  });

  it('`git add ` ra đường dẫn', () => {
    expect(suggest('git add ', CONTEXT)).toEqual(CONTEXT.files);
  });

  it('`git push ` ra remote ở vị trí đầu, branch ở vị trí sau', () => {
    expect(suggest('git push ', CONTEXT)).toEqual(CONTEXT.remotes);
    expect(suggest('git push origin ', CONTEXT)).toEqual(CONTEXT.branches);
  });

  it('cờ đứng trước không làm lệch phép đếm vị trí', () => {
    // `kubectl -n prod get pods` là cú pháp hợp lệ, và đọc nhầm "token thứ N"
    // thành "tham số thứ N" chính là chỗ bộ gợi ý của game K8s mất sạch nhóm
    // gợi ý tên. Ở đây `--force` phải hoàn toàn trong suốt với phép đếm.
    expect(suggest('git push --force ', CONTEXT)).toEqual(CONTEXT.remotes);
    expect(suggest('git push --force origin ', CONTEXT)).toEqual(CONTEXT.branches);
  });

  it('hết chỗ nhận tham số thì thôi gợi ý', () => {
    expect(suggest('git switch main ', CONTEXT)).toEqual([]);
    expect(suggest('git status ', CONTEXT)).toEqual([]);
  });

  it('phân biệt hoa thường vì git phân biệt hoa thường', () => {
    expect(suggest('git switch Ma', CONTEXT)).toEqual([]);
  });
});

describe('cờ', () => {
  it('gõ một dấu gạch thì ra cờ của đúng động từ đó', () => {
    const out = suggest('git commit -', CONTEXT);
    expect(out).toContain('--message');
    expect(out).toContain('-m');
    expect(out).not.toContain('--rebase');
  });

  it('bí danh cũng nằm trong danh sách gợi ý', () => {
    expect(suggest('git branch -D', CONTEXT)).toContain('-D');
  });

  it('cờ của lệnh con hiện ra khi lệnh con đã được nêu', () => {
    expect(suggest('git stash push -', CONTEXT)).toContain('--message');
    expect(suggest('git stash pop -', CONTEXT)).not.toContain('--message');
  });

  it('cờ đang chờ giá trị thì không gợi ý gì — giá trị là chuỗi tự do', () => {
    expect(suggest('git commit -m ', CONTEXT)).toEqual([]);
    expect(suggest('git switch -c ', CONTEXT)).toEqual([]);
  });

  it('cờ dài có `=` thì đã tự mang giá trị, phép đếm không bị lệch', () => {
    expect(suggest('git commit --message=xong ', CONTEXT)).toEqual([]);
  });
});

describe('lệnh con', () => {
  it('gợi ý tên lệnh con ở vị trí đầu', () => {
    expect(suggest('git stash ', CONTEXT)).toEqual(['push', 'pop', 'list', 'apply', 'drop']);
    expect(suggest('git bisect ', CONTEXT)).toEqual(['start', 'good', 'bad', 'reset']);
  });

  it('lọc lệnh con theo tiền tố', () => {
    expect(suggest('git pr m', CONTEXT)).toEqual(['merge']);
  });

  it('sau lệnh con thì gợi ý theo bể của lệnh con đó', () => {
    expect(suggest('git remote show ', CONTEXT)).toEqual(CONTEXT.remotes);
    expect(suggest('git bisect good ', CONTEXT)).toEqual([
      ...CONTEXT.branches,
      ...CONTEXT.tags,
    ]);
  });
});

describe('sau dấu `--`', () => {
  it('chỉ còn đường dẫn, kể cả với lệnh vốn nhận ref', () => {
    expect(suggest('git log -- ', CONTEXT)).toEqual(CONTEXT.files);
    expect(suggest('git checkout main -- ', CONTEXT)).toEqual(CONTEXT.files);
  });

  it('lọc đường dẫn theo tiền tố', () => {
    expect(suggest('git log -- src/', CONTEXT)).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('applySuggestion', () => {
  it('nối vào cuối khi đang ở đầu một token mới', () => {
    expect(applySuggestion('git ', 'status')).toBe('git status ');
    expect(applySuggestion('', 'git')).toBe('git ');
  });

  it('thay token đang gõ dở', () => {
    expect(applySuggestion('git sta', 'status')).toBe('git status ');
  });

  /**
   * `search(/\S+$/)` cắt đúng cụm không-trắng CUỐI CÙNG. `lastIndexOf` trên
   * chuỗi con cũng ra đúng ở đây, nhưng chỉ nhờ may — nó đi tìm nội dung chứ
   * không đi tìm vị trí, nên nó sai ngay khi token cuối là tiền tố của một token
   * trước đó.
   */
  it('token cuối trùng chữ với token trước vẫn cắt đúng chỗ', () => {
    expect(applySuggestion('git branch main mai', 'main')).toBe('git branch main main ');
  });
});
