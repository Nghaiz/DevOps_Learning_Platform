import type { CSSProperties, ReactElement, SVGProps } from 'react';
import { cn } from '../cn.ts';
import { GLYPHS, type GlyphPrim, type IconName } from './glyphs.ts';

export type IconTint = 'none' | 'acc' | 'topic' | 'neutral';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  readonly name: IconName;
  /** Cạnh vuông, px. Nét luôn 1.75 trên lưới 24 nên co giãn theo cỡ. */
  readonly size?: number;
  /**
   * Màu lớp tô: `neutral` (18% màu nét, mặc định), `acc` (màu mục hiện tại),
   * `topic` (màu chủ đề của phần tử cha có `data-topic`), `none` (chỉ nét).
   */
  readonly tint?: IconTint;
  /** Có `label` thì biểu tượng là hình có nghĩa (role=img); không thì bị ẩn khỏi trợ năng. */
  readonly label?: string;
}

const TINT_VAR: Record<Exclude<IconTint, 'neutral'>, string | undefined> = {
  none: 'transparent',
  acc: 'var(--acc-tint)',
  topic: 'var(--tp-tint)',
};

function renderPrim(prim: GlyphPrim, index: number): ReactElement {
  const kind = prim[0] === 'p' ? prim[2] : prim[0] === 'c' ? prim[4] : prim[6];
  const className = kind === 't' ? 'ds-ic-t' : kind === 'f' ? 'ds-ic-f' : undefined;
  if (prim[0] === 'p') return <path key={index} className={className} d={prim[1]} />;
  if (prim[0] === 'c') return <circle key={index} className={className} cx={prim[1]} cy={prim[2]} r={prim[3]} />;
  return (
    <rect
      key={index}
      className={className}
      x={prim[1]}
      y={prim[2]}
      width={prim[3]}
      height={prim[4]}
      rx={prim[5]}
    />
  );
}

export function Icon({ name, size = 20, tint = 'neutral', label, className, style, ...rest }: IconProps) {
  const tintValue = tint === 'neutral' ? undefined : TINT_VAR[tint];
  const merged: CSSProperties | undefined =
    tintValue === undefined ? style : ({ ...style, '--ic-tint': tintValue } as CSSProperties);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
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
