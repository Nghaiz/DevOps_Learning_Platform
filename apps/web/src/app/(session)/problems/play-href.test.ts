/**
 * Ô gác: trang chi tiết bài tra đường chơi theo `gameId` của CHÍNH BÀI, và không
 * kéo engine vào bundle khi làm việc đó.
 *
 * ## Lỗi mà ô này gác
 *
 * `problem-overview.tsx` từng dựng link bằng một chuỗi chốt cứng
 * `/games/k8s?problem=`. Điều đó đúng cho tới migration 0015 — trước đó mọi bài
 * đều là K8s. Từ 0015 kho lưu chở được bài của game khác, và một bài Git ở trang
 * đó mở sang đấu trường **K8s**: không 404, không lỗi, chỉ là một ván K8s mặc
 * định. Người học kết luận bài hỏng, người soạn kết luận mình lưu nhầm.
 *
 * ## Hai vế, và vế thứ hai mới là vế dễ mất
 *
 * Vế một là phép tra đúng. Vế hai là **tra mà không rò engine**: bảng
 * `problemPreviewHref` từng sống trong `author/problems/game-plugin-view.ts`,
 * module có nhập `PROBLEM_PLUGINS` — và bảng plugin kéo `createSession` +
 * `createGitSession`. Nhập nó từ đây để dùng chung một bảng tra sẽ đẩy **cả hai
 * engine** vào bundle của mọi trang danh mục bài (PR #124 đo được 369.938 B ở
 * 7/38 route).
 *
 * ⚠ `engine-leak.test.ts` KHÔNG bắt được lượt rò đó — nó chỉ đi trong đồ thị nhập
 * của `packages/games`, không đi trong `apps/web`. Cổng duy nhất thấy được là
 * `bundle:check`, và nó chạy SAU `next build`. Ô này báo NGAY.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '@devops-platform/games';

import { problemPreviewHref } from '../../../lib/problem-preview-href';

const OVERVIEW = join(import.meta.dirname, '[code]', 'problem-overview.tsx');

describe('đường chơi tra theo gameId của bài', () => {
  const source = readFileSync(OVERVIEW, 'utf8');

  it('KHÔNG chốt cứng một route game nào trong mã', () => {
    /*
     * Dò `/games/<tên game>` theo ĐÚNG danh sách game, không theo một chuỗi
     * `'k8s'` lẻ: chốt cứng `/games/git` sau này cũng sai y hệt, và một ô chỉ
     * cấm đúng cái tên đã từng sai là một ô chỉ gác quá khứ.
     *
     * Chú thích trong file cố ý nhắc `/games/k8s` để giải thích lỗi cũ, nên phép
     * dò đòi một dấu nháy ngược hoặc nháy đơn ngay trước — tức một chuỗi mã thật,
     * không phải chữ trong chú thích. Đây là chiều ngược của cái bẫy
     * `objective-source.test.ts` đã ghi.
     */
    for (const gameId of GAME_IDS) {
      // ⚠ KHÔNG dùng `String.raw` ở đây: nó giữ nguyên `\`` và trong một lớp ký
      // tự dưới cờ `u` thì đó là escape KHÔNG hợp lệ — `RegExp` ném
      // `SyntaxError` và ô đỏ vì lý do sai. Template literal thường biến `\``
      // thành một dấu nháy ngược thật trước khi regex nhìn thấy nó.
      expect(source, `chốt cứng route của game ${gameId}`).not.toMatch(
        new RegExp(`['\`]/games/${gameId}\\?problem=`, 'u'),
      );
    }
  });

  it('gọi problemPreviewHref với gameId của chính bài', () => {
    expect(source).toMatch(/problemPreviewHref\(problem\.gameId/u);
  });

  it('nhập bảng tra từ lib/, KHÔNG từ game-plugin-view (nơi có PROBLEM_PLUGINS)', () => {
    expect(source).toMatch(/from '[./]*lib\/problem-preview-href'/u);
    expect(source).not.toMatch(/from '[^']*game-plugin-view'/u);
  });

  it('nút ẩn khi game chưa có đường vào — một nút dẫn tới 404 tệ hơn một nút vắng', () => {
    expect(problemPreviewHref('pipeline', 'X-0001')).toBeNull();
    expect(source).toMatch(/playHref !== null/u);
  });
});

describe('bảng tra tự nó', () => {
  it('hai game có đường vào, bốn game còn lại không', () => {
    const co = GAME_IDS.filter((gameId) => problemPreviewHref(gameId, 'X-0001') !== null);
    expect([...co]).toEqual(['k8s', 'git']);
  });

  it('mã bài được escape — mã không bao giờ có khoảng trắng, nhưng link thì không đoán', () => {
    expect(problemPreviewHref('git', 'A B')).toBe('/games/git?problem=A%20B');
  });
});
