/**
 * Ô gác cho bốn LỜI HỨA của panel lưu bài (§18.E.5).
 *
 * Cùng lý lẽ và cùng hình dạng với `builder-promises.test.ts` ngay cạnh: thứ cần
 * gác ở đây không phải "nút bấm có chạy không" (hỏng thì lộ ngay lượt thử đầu)
 * mà là những tính chất **hỏng trong im lặng** — chúng vẫn chạy, mọi test vẫn
 * xanh, và thứ mất đi chỉ lộ ra rất lâu sau.
 *
 * Bốn lời hứa:
 *
 *  1. **Panel KHÔNG nhập tĩnh `lib/trpc`.** `app/games/layout.tsx` cố ý không
 *     cấp `TrpcQueryProvider` vì *"game phải chạy với 0 lời gọi backend"*. Đổi
 *     `await import()` thành một `import` ở đầu file không làm test nào đỏ, không
 *     làm e2e đỏ (nó không bấm nút này), và không làm `tsc` đỏ — nó chỉ lặng lẽ
 *     đẩy `@trpc/client` vào bundle đầu của `/games/git` và biến "không gọi mạng"
 *     từ tính chất cấu trúc thành tính chất tình cờ.
 *  2. **Panel được NỐI vào Builder.** Một component đúng đắn mà không ai render
 *     là mã chết, và mã chết không đỏ ở đâu cả — đúng bài học `CHALLENGES` mà
 *     `packages/games/src/index.ts` ghi lại (10 bài chạy được, có test, không bao
 *     giờ vào barrel, người dùng chưa từng thấy).
 *  3. **Câu phạm vi hiện TRÊN MÀN.** Nút này là lời gọi mạng duy nhất của cả trụ
 *     cột game và nó đòi tài khoản soạn bài; giấu hai điều đó là để người soạn
 *     soạn xong rồi mới biết mình không lưu được.
 *  4. **Nhánh UNAUTHORIZED có câu tiếng Việt riêng.** `/games` không bắt đăng
 *     nhập mà `problems.create` là `authorProcedure`, nên khách vãng lai CHẮC
 *     CHẮN gặp nhánh này. Rơi về `describeTrpcError` sẽ in ra câu của server,
 *     thứ không nói được rằng bản nháp của họ vẫn còn nguyên.
 *
 * ## Vì sao ô này TĨNH chứ không render component
 *
 * Ba trong bốn lời hứa là về HÌNH DẠNG NGUỒN (nhập động, có chỗ gọi, có nhánh),
 * và không phép render nào phân biệt được `await import()` với `import`. Render
 * rồi tìm chuỗi cũng xanh khi chuỗi tới từ một hằng chép tay, tức xanh ở đúng
 * trường hợp sai.
 *
 * ## Đối chứng dương đã chạy
 *
 * 2026-09-15, từng phép một, khôi phục sau mỗi lần: đổi `await import` thành
 * `import` tĩnh ⇒ ô 1 đỏ · gỡ `<SaveProblemPanel` khỏi `git-builder.tsx` ⇒ ô 2
 * đỏ · xoá dòng `author.builder.save.scope` ⇒ ô 3 đỏ · đổi nhánh
 * `UNAUTHORIZED` thành `describeTrpcError` ⇒ ô 4 đỏ.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';

import { SAVE_ISSUE_TEXT } from './builder-copy';
import type { ProblemSaveIssueCode } from './draft-to-problem';

const PANEL = join(import.meta.dirname, 'save-problem-panel.tsx');
const BUILDER = join(import.meta.dirname, 'git-builder.tsx');

const panelSource = readFileSync(PANEL, 'utf8');
const builderSource = readFileSync(BUILDER, 'utf8');

describe('bộ quét đọc được file thật', () => {
  it('hai file nguồn khác rỗng — mọi ô dưới đây đọc chuỗi rỗng sẽ xanh vô nghĩa', () => {
    expect(panelSource.length).toBeGreaterThan(1000);
    expect(builderSource.length).toBeGreaterThan(1000);
  });
});

describe('lời hứa 1 · tầng mạng không tồn tại cho tới lúc bấm nút', () => {
  it('nhập lib/trpc bằng await import(), KHÔNG bằng import tĩnh', () => {
    expect(
      panelSource,
      'Panel đang nhập `lib/trpc` ở đầu file. `@trpc/client` sẽ nằm trong bundle ' +
        'đầu của /games/git, và ô e2e "0 lời gọi backend" vẫn xanh vì nó không bấm ' +
        'nút này — tức lời hứa mất hiệu lực mà không cổng nào đỏ.',
    ).toMatch(/await import\((['"])[^'"]*lib\/trpc\1\)/u);
  });

  it('không có dòng import tĩnh nào trỏ vào lib/trpc', () => {
    expect(/^import[^\n]*lib\/trpc/mu.test(panelSource)).toBe(false);
  });
});

describe('lời hứa 2 · panel được nối vào Builder', () => {
  it('git-builder.tsx render <SaveProblemPanel>', () => {
    expect(builderSource).toContain('<SaveProblemPanel');
  });

  it('và truyền bản nháp vào — một panel không có draft thì không lưu được gì', () => {
    expect(builderSource).toMatch(/<SaveProblemPanel\s+draft=\{draft\}/u);
  });
});

describe('lời hứa 3 · câu phạm vi hiện trên màn', () => {
  it('panel gọi author.builder.save.scope', () => {
    expect(panelSource).toContain("t('author.builder.save.scope')");
  });

  it('và câu đó nói ra cả lời gọi máy chủ lẫn yêu cầu tài khoản', () => {
    const scope = t('author.builder.save.scope');
    expect(scope).toContain('máy chủ');
    expect(scope).toContain('soạn bài');
  });
});

describe('lời hứa 4 · nhánh chưa đăng nhập có câu riêng', () => {
  it('panel phân biệt UNAUTHORIZED thay vì in thẳng câu của server', () => {
    expect(panelSource).toContain("trpcErrorCode(error) === 'UNAUTHORIZED'");
    expect(panelSource).toContain("t('author.builder.save.unauthorized')");
  });

  it('câu đó nói rõ bản nháp không mất — đó là thứ người soạn lo nhất lúc đó', () => {
    expect(t('author.builder.save.unauthorized')).toContain('nguyên');
  });
});

describe('bảng mã lỗi phủ đủ, và panel đi qua bảng chứ không ghép chuỗi', () => {
  it('mọi mã trong SAVE_ISSUE_TEXT tra ra một câu khác rỗng', () => {
    const codes = Object.keys(SAVE_ISSUE_TEXT) as readonly ProblemSaveIssueCode[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(t(SAVE_ISSUE_TEXT[code]), code).not.toBe('');
    }
  });

  it('panel tra qua SAVE_ISSUE_TEXT, không dựng khoá bằng template', () => {
    /*
     * `t(`author.builder.save.issue.${code}`)` ngắn hơn bảng và vứt đi cả lý do
     * bảng tồn tại: một mã thứ mười thêm vào `ProblemSaveIssueCode` sẽ dựng một
     * khoá không có trong bản đồ, `t()` trả `undefined`, và người soạn nhận một
     * dòng TRỐNG ở chỗ đáng lẽ là câu giải thích. Không cổng nào đỏ.
     */
    expect(panelSource).toContain('SAVE_ISSUE_TEXT[issue.code]');
    expect(panelSource).not.toContain('author.builder.save.issue.${');
  });
});
