import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.tsx';

afterEach(() => {
  cleanup();
});

describe('Card — tương thích ngược', () => {
  it('Card + CardTitle + CardDescription render trực tiếp không cần CardHeader', () => {
    render(
      <Card>
        <CardTitle>Bài học Kubernetes</CardTitle>
        <CardDescription>Triển khai Pod đầu tiên</CardDescription>
      </Card>,
    );
    expect(screen.getByText('Bài học Kubernetes')).toBeDefined();
    expect(screen.getByText('Triển khai Pod đầu tiên')).toBeDefined();
  });
});

describe('Card — bộ compound đầy đủ', () => {
  it('CardHeader/CardContent/CardFooter render đúng thứ tự nội dung', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tiêu đề</CardTitle>
        </CardHeader>
        <CardContent>Nội dung</CardContent>
        <CardFooter>Hành động</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Tiêu đề')).toBeDefined();
    expect(screen.getByText('Nội dung')).toBeDefined();
    expect(screen.getByText('Hành động')).toBeDefined();
  });
});
