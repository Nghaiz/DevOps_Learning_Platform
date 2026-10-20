import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import { LINE_CLASSES, cn, type LineMarkerState } from '@devops-platform/ui';
import type { TopicLine } from '../../lib/topic-line';

export interface RouteStation {
  readonly id: string;
  readonly label: string;
  readonly line: TopicLine;
  readonly state: LineMarkerState;
  readonly href?: string;
  /** Dòng phụ dưới tên (chỉ hiện ở hướng dọc). */
  readonly sub?: string;
}

function railClass(line: TopicLine): string {
  return line === 'ink' ? 'bg-foreground' : LINE_CLASSES[line].bg;
}

function StationGlyph({ station }: { readonly station: RouteStation }) {
  const rail = railClass(station.line);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 grid size-5 shrink-0 place-items-center border-[3px] border-current bg-background',
        station.line === 'ink' ? 'text-foreground' : LINE_CLASSES[station.line].ink,
        station.state === 'done' && cn(rail, 'border-transparent text-background'),
        station.state === 'current' && 'animate-pulse-station border-foreground bg-signal text-signal-foreground',
        station.state === 'locked' && 'border-dashed opacity-60',
      )}
    >
      {station.state === 'done' && <Check className="size-3" strokeWidth={3} />}
      {station.state === 'locked' && <Lock className="size-2.5" strokeWidth={3} />}
    </span>
  );
}

/**
 * Sơ đồ tuyến (design-brief §4.5): lộ trình vẽ như một tuyến tàu, ga là ô vuông
 * nằm trên đường ray 4px màu chủ đề. Ga xong tô đặc, ga hiện tại vòng vàng nhịp,
 * ga khoá viền đứt. Trạng thái luôn có chữ (sr-only) chứ không chỉ có màu.
 */
export function RouteLine({
  stations,
  orientation = 'horizontal',
  label,
  stateLabel,
}: {
  readonly stations: readonly RouteStation[];
  readonly orientation?: 'horizontal' | 'vertical';
  readonly label: string;
  readonly stateLabel: (state: LineMarkerState) => string;
}) {
  if (orientation === 'horizontal') {
    return (
      <ol aria-label={label} className="relative flex items-start overflow-x-auto pb-2">
        {stations.map((station, index) => {
          const next = stations[index + 1];
          const inner = (
            <>
              <span className="flex w-full items-center">
                <StationGlyph station={station} />
                {next && <span aria-hidden="true" className={cn('h-1 flex-1', railClass(station.line))} />}
              </span>
              <span className="mt-2 block max-w-36 pr-3 text-xs leading-snug text-muted-foreground group-hover:text-foreground">
                {station.label}
                <span className="sr-only">, {stateLabel(station.state)}</span>
              </span>
            </>
          );
          return (
            <li key={station.id} className={cn('group min-w-24', next ? 'flex-1' : 'flex-none')}>
              {station.href ? (
                <Link href={station.href} className="block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol aria-label={label} className="relative">
      {stations.map((station, index) => {
        const next = stations[index + 1];
        const body = (
          <span className="flex min-w-0 flex-1 flex-col pb-8">
            <span className="type-title">{station.label}</span>
            {station.sub && <span className="mt-1 text-sm text-muted-foreground">{station.sub}</span>}
            <span className="mt-1 type-label text-muted-foreground">{stateLabel(station.state)}</span>
          </span>
        );
        return (
          <li key={station.id} className="relative flex gap-5">
            <span className="relative flex w-5 shrink-0 flex-col items-center">
              <StationGlyph station={station} />
              {next && <span aria-hidden="true" className={cn('w-1 flex-1', railClass(station.line))} />}
            </span>
            {station.href ? (
              <Link href={station.href} className="group -mt-0.5 flex min-w-0 flex-1 hover:underline">
                {body}
              </Link>
            ) : (
              <span className="-mt-0.5 flex min-w-0 flex-1">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
