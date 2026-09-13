import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './table.tsx';

afterEach(() => {
  cleanup();
});

describe('Table', () => {
  it('render đủ header + body + caption, bọc trong container cuộn ngang', () => {
    const { container } = render(
      <Table>
        <TableCaption>Danh sách lượt làm lab</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Lab</TableHead>
            <TableHead>Điểm</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Triển khai Pod</TableCell>
            <TableCell>9/10</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Lab' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Triển khai Pod' })).toBeDefined();
    expect(screen.getByText('Danh sách lượt làm lab')).toBeDefined();
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });

  /**
   * ⛔ Khối cuộn phải ĐƯỢC ĐỊNH VỊ, không chỉ có `overflow-x-auto`.
   *
   * Ô ngay trên chỉ hỏi `.overflow-x-auto` có tồn tại không, và nó XANH suốt
   * thời gian `/me` trôi ngang 308px ở khung 390px — vì lớp cắt có thật, chỉ là
   * nó không cắt được một hậu duệ `position:absolute` khi khối này còn
   * `position:static`. Một ô chỉ khẳng định lớp cắt có mặt thì không phân biệt
   * nổi hai trường hợp đó; ô này thì có.
   *
   * jsdom không tính bố cục nên ở đây chỉ khẳng định được HỢP ĐỒNG LỚP. Phép
   * đo hành vi thật nằm ở `apps/web/e2e/responsive.spec.ts` ("không tràn ngang
   * — /me"), và nó chỉ chạy khi lượt e2e có phiên đăng nhập. Hai ô gác hai
   * tầng khác nhau: ô này đỏ ngay khi ai đó xoá chữ `relative`, kể cả trên một
   * máy không dựng nổi e2e.
   */
  it('khối cuộn mang `relative` — nếu không, hậu duệ absolute thoát vùng cắt', () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">Hành động</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Triển khai Pod</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const scroller = container.querySelector('.overflow-x-auto');
    expect(scroller).not.toBeNull();
    expect(
      scroller?.classList.contains('relative'),
      'Khối bọc <table> phải có `relative`. Thiếu nó, containing block của một ' +
        'hậu duệ `position:absolute` (ví dụ `sr-only` trong <th>) rơi về initial ' +
        'containing block, nên `overflow-x-auto` không cắt được nó và trang tràn ' +
        'ngang. Xem bảng số đo ở chú thích của `Table` trong table.tsx.',
    ).toBe(true);
  });
});
