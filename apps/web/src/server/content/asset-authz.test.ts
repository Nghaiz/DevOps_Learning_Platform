import { describe, expect, it } from 'vitest';
import { mayServeContentAsset } from './authz';

/**
 * Cổng phát asset nguồn-DB của route `/api/scenarios/[id]/assets/[...path]`
 * (defense-in-depth, 2026-09-18).
 *
 * ## Vì sao test này là một RÀO HỒI QUY, không phải trang trí
 *
 * Trước bản vá, nhánh nguồn DB chỉ gác đăng nhập — về hiệu lực là
 * `mayServeContentAsset = () => true` cho mọi người đã đăng nhập. Mọi ca `false`
 * dưới đây sẽ ĐỎ với hành vi cũ đó. Đó là điều kiện để test chứng minh được cái
 * lỗ đã khép: một cổng chỉ trả `true` thì mọi khẳng định `true` là vô nghĩa
 * (`green-that-proves-nothing`), nên các ca `false` mới là phần mang tải.
 */

const OWNER = { id: 'author-a', isAdmin: false };
const OTHER_USER = { id: 'kẻ-lạ', isAdmin: false };
const ADMIN = { id: 'admin-b', isAdmin: true };

describe('mayServeContentAsset — bài published phát cho mọi người đã đăng nhập', () => {
  it('người lạ (không chủ, không admin) XEM được asset của bài published', () => {
    expect(mayServeContentAsset({ state: 'published', authorId: 'author-a' }, OTHER_USER)).toBe(
      true,
    );
  });

  it('chủ và admin cũng xem được bài published (đối chứng: không ai bị chặn oan)', () => {
    expect(mayServeContentAsset({ state: 'published', authorId: 'author-a' }, OWNER)).toBe(true);
    expect(mayServeContentAsset({ state: 'published', authorId: 'author-a' }, ADMIN)).toBe(true);
  });
});

describe('mayServeContentAsset — bài CHƯA published chỉ chủ hoặc admin (phần mang tải)', () => {
  // Ba state không-published: đây là các ca sẽ ĐỎ nếu cổng bị tháo về "() => true".
  for (const state of ['draft', 'publishing', 'archived'] as const) {
    it(`người lạ KHÔNG xem được asset của bài ${state}`, () => {
      expect(mayServeContentAsset({ state, authorId: 'author-a' }, OTHER_USER)).toBe(false);
    });

    it(`CHỦ xem được asset bài ${state} của chính mình`, () => {
      expect(mayServeContentAsset({ state, authorId: 'author-a' }, OWNER)).toBe(true);
    });

    it(`ADMIN xem được asset bài ${state} của người khác`, () => {
      expect(mayServeContentAsset({ state, authorId: 'author-a' }, ADMIN)).toBe(true);
    });
  }
});

describe('mayServeContentAsset — fail-closed', () => {
  it('id trùng nhưng KHÁC người thì vẫn theo id, không theo tên', () => {
    // Ownership so bằng id, không bằng bất cứ trường nào khác.
    expect(mayServeContentAsset({ state: 'draft', authorId: 'author-a' }, OWNER)).toBe(true);
    expect(
      mayServeContentAsset({ state: 'draft', authorId: 'author-a' }, { id: 'author-A', isAdmin: false }),
    ).toBe(false); // 'author-A' ≠ 'author-a' — so chuỗi, phân biệt hoa thường
  });
});
