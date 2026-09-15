/**
 * Ô gác cho phép chuyển ô-nhập ↔ trường mảng của bản nháp.
 *
 * Ô đắt nhất ở đây là `parseAllowedCommands`: `null` và `[]` mang nghĩa NGƯỢC
 * nhau, và một `textarea` rỗng tự nhiên sinh ra `[]`. Cái bẫy đó đã cắn một lần
 * ở `k8s/problem.ts`, nên nó cần một ô nói thẳng cả hai chiều chứ không chỉ
 * chiều "có nhập gì thì trả ra thứ đó".
 */

import { describe, expect, it } from 'vitest';

import {
  exportFileName,
  formatAllowedCommands,
  linesToList,
  listToLines,
  parseAllowedCommands,
} from './draft-state';
import { emptyDraft } from '@devops-platform/games';

const SPEC = { commits: [] } as const;

describe('linesToList', () => {
  it('bỏ dòng trắng và cắt khoảng trắng hai đầu', () => {
    expect(linesToList('  git add .  \n\n git commit -m x \n')).toEqual([
      'git add .',
      'git commit -m x',
    ]);
  });

  it('chuỗi rỗng ra mảng rỗng, không ra một phần tử rỗng', () => {
    expect(linesToList('')).toEqual([]);
    expect(linesToList('   \n  ')).toEqual([]);
  });

  it('đi vòng qua listToLines giữ nguyên danh sách', () => {
    const list = ['git rebase main', 'git push --force-with-lease'];
    expect(linesToList(listToLines(list))).toEqual(list);
  });
});

describe('parseAllowedCommands — null nghĩa là KHÔNG giới hạn', () => {
  it('ô trắng ra null, KHÔNG ra mảng rỗng', () => {
    /*
     * Đây là toàn bộ lý do hàm này tồn tại. `[]` nghĩa là cấm mọi lệnh, tức một
     * level không chơi được. Nếu ô này đổi thành `[]` thì mọi level dựng bằng
     * Builder mà người soạn không đụng tới ô tập lệnh đều chết, và triệu chứng
     * trên màn là "lệnh nào cũng bị từ chối" — một triệu chứng không chỉ được
     * vào nguyên nhân.
     */
    expect(parseAllowedCommands('')).toBeNull();
    expect(parseAllowedCommands('  \n \n ')).toBeNull();
  });

  it('nhận cả dấu phẩy lẫn xuống dòng', () => {
    expect(parseAllowedCommands('add, commit\nrebase')).toEqual(['add', 'commit', 'rebase']);
  });

  it('formatAllowedCommands dịch ngược null thành ô trắng', () => {
    expect(formatAllowedCommands(null)).toBe('');
    expect(parseAllowedCommands(formatAllowedCommands(['add', 'commit']))).toEqual([
      'add',
      'commit',
    ]);
  });
});

describe('exportFileName', () => {
  it('dùng mã level khi đã có', () => {
    expect(exportFileName({ ...emptyDraft(SPEC), id: 'git-tu-dung-thu-nghiem' })).toBe(
      'git-tu-dung-thu-nghiem.json',
    );
  });

  it('nháp chưa có mã vẫn tải về được', () => {
    expect(exportFileName(emptyDraft(SPEC))).toBe('level-nhap.json');
  });
});
