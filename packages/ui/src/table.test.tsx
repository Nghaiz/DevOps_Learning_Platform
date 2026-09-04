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
});
