import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LineMarker } from './line-marker.tsx';

afterEach(() => {
  cleanup();
});

function markerClasses(container: HTMLElement): string[] {
  const marker = container.querySelector('[data-slot="line-marker"]') as HTMLElement;
  return marker.className.split(/\s+/);
}

describe('LineMarker', () => {
  it('ô vuông 12px, mặc định `todo` = ô rỗng viền màu tuyến', () => {
    const { container } = render(<LineMarker line="docker" />);
    const classes = markerClasses(container);
    expect(classes).toEqual(expect.arrayContaining(['size-3', 'border-line-docker', 'bg-card']));
    expect(classes).not.toContain('bg-line-docker');
    expect(classes.filter((name) => name.startsWith('rounded'))).toEqual([]);
  });

  it('`done` = ô đặc màu tuyến', () => {
    const { container } = render(<LineMarker line="git" state="done" />);
    expect(markerClasses(container)).toEqual(expect.arrayContaining(['bg-line-git', 'border-line-git']));
  });

  /**
   * Vòng vàng vẽ bằng `outline`, KHÔNG bằng `ring-*`: ring là `box-shadow`, và
   * `animate-pulse-station` animate chính `box-shadow` — đặt cả hai thì nhịp
   * đập ghi đè vòng ring ở mọi khung hình.
   */
  it('`current` = ô đặc + vòng vàng tín hiệu bằng outline + nhịp đập', () => {
    const { container } = render(<LineMarker line="k8s" state="current" />);
    const classes = markerClasses(container);
    expect(classes).toEqual(
      expect.arrayContaining(['bg-line-k8s', 'outline-signal', 'outline-2', 'animate-pulse-station']),
    );
    expect(classes.filter((name) => name.startsWith('ring-'))).toEqual([]);
  });

  it('`locked` = ô rỗng viền xám, không màu tuyến', () => {
    const { container } = render(<LineMarker line="sec" state="locked" />);
    const classes = markerClasses(container);
    expect(classes).toContain('border-muted-foreground');
    expect(classes.filter((name) => name.includes('line-sec'))).toEqual([]);
  });

  it('mặc định là glyph trang trí; có `aria-label` thì thành `role="img"`', () => {
    const { container, rerender } = render(<LineMarker line="net" />);
    expect(container.querySelector('[data-slot="line-marker"]')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<LineMarker line="net" state="done" aria-label="Đã xong" />);
    expect(screen.getByRole('img', { name: 'Đã xong' })).toBeDefined();
  });
});
