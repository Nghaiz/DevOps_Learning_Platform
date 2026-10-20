import type { CSSProperties, ReactElement, SVGProps } from 'react';
import { cn } from '../cn.ts';
import { GLYPHS, type GlyphPrim, type IconName } from './glyphs.ts';

export type IconTint = 'none' | 'acc' | 'topic' | 'neutral';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  readonly name: IconName;
  /** Cạnh vuông, px. Nét luôn 2 trên lưới 24 nên co giãn theo cỡ. */
  readonly size?: number;
  /**
   * Màu lớp tô lệch: `acc` (màu mục hiện tại, mặc định), `topic` (màu chủ đề của phần tử cha
   * có `data-topic`), `neutral` (18% màu nét), `none` (chỉ nét).
   */
  readonly tint?: IconTint;
  /** Có `label` thì biểu tượng là hình có nghĩa (role=img); không thì bị ẩn khỏi trợ năng. */
  readonly label?: string;
}

const TINT_VAR: Record<Exclude<IconTint, 'acc'>, string> = {
  none: 'transparent',
  neutral: 'color-mix(in oklch, currentColor 18%, transparent)',
  topic: 'var(--tp-tint)',
};

/**
 * Lớp tô in LỆCH xuống phải so với nét, như hai lượt in chồng không khít. Đây là thứ làm bộ
 * glyph không đọc ra như một bộ icon nét đều dựng sẵn; cùng với nét 2, đầu vuông và góc nhọn.
 */
const TINT_SHIFT = 'translate(1.6 1.6)';

function renderPrim(prim: GlyphPrim, index: number): ReactElement {
  const kind = prim[0] === 'p' ? prim[2] : prim[0] === 'c' ? prim[4] : prim[6];
  const className = kind === 't' ? 'ds-ic-t' : kind === 'f' ? 'ds-ic-f' : undefined;
  const transform = kind === 't' ? TINT_SHIFT : undefined;
  if (prim[0] === 'p') return <path key={index} className={className} transform={transform} d={prim[1]} />;
  if (prim[0] === 'c') {
    return <circle key={index} className={className} transform={transform} cx={prim[1]} cy={prim[2]} r={prim[3]} />;
  }
  return (
    <rect
      key={index}
      className={className}
      transform={transform}
      x={prim[1]}
      y={prim[2]}
      width={prim[3]}
      height={prim[4]}
      rx={prim[5]}
    />
  );
}

export function Icon({ name, size = 20, tint = 'acc', label, className, style, ...rest }: IconProps) {
  const tintValue = tint === 'acc' ? undefined : TINT_VAR[tint];
  const merged: CSSProperties | undefined =
    tintValue === undefined ? style : ({ ...style, '--ic-tint': tintValue } as CSSProperties);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeMiterlimit={2}
      focusable="false"
      data-icon={name}
      className={cn('shrink-0', className)}
      style={merged}
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      {...rest}
    >
      {GLYPHS[name].map(renderPrim)}
    </svg>
  );
}
