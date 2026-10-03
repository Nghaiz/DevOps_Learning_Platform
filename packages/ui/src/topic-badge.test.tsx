import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TopicBadge } from './topic-badge.tsx';
import { Badge } from './badge.tsx';
import { LINE_CODE, LINE_IDS } from './lines.ts';

afterEach(() => {
  cleanup();
});

describe('TopicBadge', () => {
  it.each(LINE_IDS)('line=%s in đúng mã và tô đúng cặp màu tuyến', (line) => {
    const { container } = render(<TopicBadge line={line} />);
    const code = container.querySelector('[data-slot="topic-badge-code"]') as HTMLElement;
    expect(code.textContent).toBe(LINE_CODE[line]);
    const classes = code.className.split(/\s+/);
    expect(classes).toContain(`bg-line-${line}`);
    expect(classes).toContain(`text-line-${line}-foreground`);
  });

  it('không có `label` ⇒ mã là chữ duy nhất và được đọc', () => {
    render(<TopicBadge line="docker" />);
    expect(screen.getByText('DKR').getAttribute('aria-hidden')).toBeNull();
  });

  it('có `label` ⇒ hiện tên, mã bị ẩn khỏi cây trợ năng (khỏi đọc "D K R Docker")', () => {
    render(<TopicBadge line="docker" label="Docker & container" />);
    expect(screen.getByText('Docker & container')).toBeDefined();
    expect(screen.getByText('DKR').getAttribute('aria-hidden')).toBe('true');
  });

  it('cỡ sm dùng nhãn mono 11px của hệ (`type-label`)', () => {
    render(<TopicBadge line="git" size="sm" />);
    expect(screen.getByText('GIT').className).toContain('type-label');
  });
});

describe('Badge variant="line"', () => {
  it('tô màu tuyến từ prop `line`', () => {
    render(
      <Badge variant="line" line="sec">
        Bảo mật
      </Badge>,
    );
    const badge = screen.getByText('Bảo mật');
    expect(badge.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['bg-line-sec', 'text-line-sec-foreground']),
    );
    expect(badge.getAttribute('data-line')).toBe('sec');
  });

  it('thiếu `line` ⇒ tuyến mực trung tính, không phải badge không màu', () => {
    render(<Badge variant="line">Khác</Badge>);
    const badge = screen.getByText('Khác');
    expect(badge.className.split(/\s+/)).toEqual(expect.arrayContaining(['bg-ink', 'text-ink-foreground']));
    expect(badge.getAttribute('data-line')).toBe('ink');
  });

  it('`line` bị bỏ qua ở biến thể khác', () => {
    render(
      <Badge variant="outline" line="sec">
        Viền
      </Badge>,
    );
    const badge = screen.getByText('Viền');
    expect(badge.className).not.toContain('bg-line-sec');
    expect(badge.getAttribute('data-line')).toBeNull();
  });

  it('badge vuông qua `rounded-control`', () => {
    render(<Badge>Nhãn</Badge>);
    expect(screen.getByText('Nhãn').className.split(/\s+/)).toContain('rounded-control');
  });
});
