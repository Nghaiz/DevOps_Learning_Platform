import { describe, expect, it } from 'vitest';
import { combineCatalogPages, type PageQueryLike } from './catalog-pages';

type Q = PageQueryLike<string, string>;

const pending: Q = { isPending: true, isError: false, error: null };
const failed = (error: string): Q => ({ isPending: false, isError: true, error });
const page = (items: string[], nextCursor: string | null): Q => ({
  isPending: false,
  isError: false,
  error: null,
  data: { items, nextCursor },
});

describe('combineCatalogPages · gộp các lượt "Xem thêm" thành một trạng thái', () => {
  it('lượt đầu chưa về ⇒ cả trang đang tải', () => {
    expect(combineCatalogPages([pending]).status).toBe('pending');
    expect(combineCatalogPages([]).status).toBe('pending');
  });

  it('lượt đầu lỗi ⇒ cả trang lỗi, mang đúng lỗi của lượt đó', () => {
    expect(combineCatalogPages([failed('hết chỗ')])).toEqual({ status: 'error', error: 'hết chỗ' });
  });

  it('một lượt, hết danh sách ⇒ không còn nữa', () => {
    const state = combineCatalogPages([page(['a', 'b'], null)]);
    expect(state).toMatchObject({ status: 'success', items: ['a', 'b'], hasNext: false, nextCursor: null });
  });

  it('nhiều lượt nối đúng thứ tự, cursor lấy từ lượt CUỐI', () => {
    const state = combineCatalogPages([page(['a', 'b'], 'b'), page(['c', 'd'], 'd')]);
    expect(state).toMatchObject({ status: 'success', items: ['a', 'b', 'c', 'd'], nextCursor: 'd', hasNext: true });
  });

  it('lượt tải thêm đang chờ ⇒ giữ các mục đã hiện, báo loadingMore, chưa có cursor mới', () => {
    const state = combineCatalogPages([page(['a'], 'a'), pending]);
    expect(state).toMatchObject({ status: 'success', items: ['a'], loadingMore: true, moreError: null, nextCursor: 'a' });
  });

  it('lượt tải thêm lỗi ⇒ các mục đã hiện KHÔNG biến mất, lỗi gắn đúng lượt', () => {
    const state = combineCatalogPages([page(['a'], 'a'), page(['b'], 'b'), failed('timeout')]);
    expect(state).toMatchObject({
      status: 'success',
      items: ['a', 'b'],
      moreError: { error: 'timeout', index: 2, page: 3 },
      loadingMore: false,
    });
  });

  it('đối chứng âm: một lượt rỗng ở cuối với nextCursor null ⇒ hết, không treo "còn nữa"', () => {
    const state = combineCatalogPages([page(['a'], 'a'), page([], null)]);
    expect(state).toMatchObject({ status: 'success', items: ['a'], hasNext: false });
  });
});
