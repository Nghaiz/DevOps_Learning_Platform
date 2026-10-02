import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { parseCheckCriteria, VERIFY_PRELUDE, withVerifyPrelude } from './verify-prelude.ts';

describe('parseCheckCriteria', () => {
  it('tách dòng ✓/✗ thành tiêu chí, giữ phần còn lại làm ghi chú', () => {
    const out = ['✓ Deployment web tồn tại', 'đang đọc trạng thái…', '✗ Có 3 bản sao sẵn sàng (hiện: 1/3)'].join('\n');
    expect(parseCheckCriteria(out)).toEqual({
      criteria: [
        { ok: true, label: 'Deployment web tồn tại' },
        { ok: false, label: 'Có 3 bản sao sẵn sàng (hiện: 1/3)' },
      ],
      notes: 'đang đọc trạng thái…',
    });
  });

  it('dấu ✓ giữa câu là văn xuôi, không phải tiêu chí', () => {
    expect(parseCheckCriteria('xong rồi ✓ nhé').criteria).toEqual([]);
  });

  it('bỏ tiêu chí không có nhãn thay vì vẽ một dòng trống', () => {
    expect(parseCheckCriteria('✓ \n✗   ').criteria).toEqual([]);
  });

  it('chịu được CRLF', () => {
    expect(parseCheckCriteria('✓ một\r\n✗ hai\r\n').criteria).toEqual([
      { ok: true, label: 'một' },
      { ok: false, label: 'hai' },
    ]);
  });

  it('output không có tiêu chí nào trả mảng rỗng và nguyên văn ghi chú', () => {
    expect(parseCheckCriteria('Dat — xong')).toEqual({ criteria: [], notes: 'Dat — xong' });
  });
});

describe('withVerifyPrelude', () => {
  it('đặt prelude lên đầu và bỏ shebang của script', () => {
    const merged = withVerifyPrelude('#!/bin/bash\nset -uo pipefail\nexit 0\n');
    expect(merged.startsWith(VERIFY_PRELUDE)).toBe(true);
    expect(merged).not.toContain('#!/bin/bash');
    expect(merged.endsWith('set -uo pipefail\nexit 0\n')).toBe(true);
  });

  it('chuẩn hoá CRLF của script — bash đọc \\r như một phần của lệnh', () => {
    expect(withVerifyPrelude('exit 0\r\n')).not.toContain('\r');
  });
});

// Hành vi THẬT của prelude dưới bash. Một test chỉ so chuỗi sẽ xanh cả khi trap
// viết sai cú pháp — thứ duy nhất chứng minh "quên exit 1 không thành đỗ giả" là
// chạy nó.
const bash = spawnSync('bash', ['-c', 'exit 0']);
const hasBash = bash.status === 0;

function run(script: string): { code: number | null; out: string } {
  const res = spawnSync('bash', ['-s'], { input: withVerifyPrelude(script), encoding: 'utf8' });
  return { code: res.status, out: res.stdout };
}

describe.skipIf(!hasBash)('prelude chạy dưới bash', () => {
  it('có fail mà quên exit ⇒ vẫn thoát 1', () => {
    const r = run('set -uo pipefail\nfail "chưa có file"\npass "có user"\n');
    expect(r.code).toBe(1);
    expect(parseCheckCriteria(r.out).criteria).toEqual([
      { ok: false, label: 'chưa có file' },
      { ok: true, label: 'có user' },
    ]);
  });

  it('có fail rồi exit 0 tường minh ⇒ vẫn thoát 1', () => {
    expect(run('fail "x"\nexit 0\n').code).toBe(1);
  });

  it('chỉ pass ⇒ thoát 0', () => {
    expect(run('set -uo pipefail\npass "a"\npass "b"\n').code).toBe(0);
  });

  it('không dùng helper ⇒ giữ nguyên exit code của script', () => {
    expect(run('echo Dat\nexit 0\n').code).toBe(0);
    expect(run('echo "Chua dat"\nexit 3\n').code).toBe(3);
  });

  it('check chạy lệnh và chấm theo exit code, nuốt output của lệnh', () => {
    const r = run('check "true đạt" true\ncheck "false trượt" false\ncheck "echo không lộ" echo bi-mat\n');
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('bi-mat');
    expect(parseCheckCriteria(r.out).criteria.map((c) => c.ok)).toEqual([true, false, true]);
  });

  it('script tự đặt trap EXIT riêng thì tự chịu exit code', () => {
    expect(run("trap 'exit 0' EXIT\nfail x\n").code).toBe(0);
  });
});
