'use client';

import { type ReactElement, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import type { ClusterView, Level, SessionStatus } from '@devops-platform/games';
import { Button, cn } from '@devops-platform/ui';
import { percent, summarize } from './cluster-summary';

/**
 * Các vùng chrome nổi trên canvas (§12.5).
 *
 * Mọi thứ ở đây là **overlay định vị tuyệt đối**: canvas nằm dưới và không bao
 * giờ bị thu nhỏ để nhường chỗ. Đó là toàn bộ khác biệt giữa bản này và bản bị
 * bác — bản trước chia đôi bề ngang, nên canvas nhỏ dần theo mỗi panel thêm vào.
 *
 * Lớp nền dùng chung: nền mờ + `backdrop-blur` để chữ đọc được trên mọi khung
 * hình 3D bên dưới, viền mảnh để tách khỏi cảnh mà không thành một cái hộp đặc.
 */
const PANEL = 'rounded-lg border border-border/60 bg-card/80 shadow-elevation-2 backdrop-blur-md';

export { PANEL as HUD_PANEL };

/** Panel dính vào mép màn hình — bỏ bo góc phía mép, theo đúng quy tắc của bản gốc. */
export const HUD_PANEL_FLUSH = 'border-border/60 bg-card/80 shadow-elevation-2 backdrop-blur-md';

/**
 * Thang z — SÁU nấc, đặt tên theo VAI TRÒ chứ không theo số.
 *
 * Lấy nguyên ý tưởng của bản gốc (nghiên cứu §3): rất ít nấc, mỗi nấc một nghĩa
 * rõ. §12 trước đây không có thang nào và các vùng tự chọn `z-20`/`z-30`/`z-40`
 * rời rạc — đó là chỗ vỡ đầu tiên khi có tám overlay, và nó đã vỡ thật (thẻ level
 * chui xuống dưới rail, mất hẳn mép trái).
 *
 * Số ở đây nằm TRONG lớp overlay (bản thân lớp đó là `z-10` so với canvas), nên
 * chúng chỉ so với nhau, không so với phần còn lại của trang.
 */
export const Z = {
  /** Trang trí thụ động — che được, không sao. */
  decoration: 'z-20',
  /** Panel làm việc: rail, thẻ level, inspector. */
  panel: 'z-30',
  /** HUD luôn nằm trên panel. */
  hud: 'z-40',
  /** Thứ chiếm bàn phím: ô lệnh, lớp phủ thắng. */
  input: 'z-50',
} as const;

function Meter({ label, value }: { readonly label: string; readonly value: number }): ReactElement {
  const pct = percent(value);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      {/*
        `<progress>` gốc: nó tự mang role `progressbar`, tự đọc giá trị, và
        không cần một cây div + aria-* dựng tay. Bề rộng cố định nên nó không
        gây layout shift khi số nhảy.
      */}
      <progress
        value={pct}
        max={100}
        aria-label={`${label} ${String(pct)} phần trăm`}
        className="h-1.5 w-12 overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-status-progress"
      />
      <span className="w-8 font-mono text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

function Counter({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground">{value}</span>
    </span>
  );
}

export const SPEEDS: readonly number[] = [1, 2, 4];

export interface TopBarProps {
  readonly view: ClusterView;
  readonly level: Level | null;
  readonly speed: number;
  readonly onSpeed: (multiplier: number) => void;
  readonly settings: ReactNode;
}

/**
 * Thanh trên — mỏng, tràn ngang, nổi.
 *
 * Điều khiển tốc độ 1x/2x/4x gọi `session.setSpeed()`, KHÔNG phát một
 * `GameAction`. Đó là quyết định của hợp đồng và nó đúng: tốc độ đổi nhịp đồng
 * hồ treo tường chứ không đổi chuỗi tick, nên cùng chuỗi action ở 1x và 4x cho ra
 * đúng một trạng thái. Ghi nó vào `RunLog` sẽ nhét vào bản phát lại một chỉ thị
 * vô nghĩa — phát lại chạy nhanh hết mức có thể, không theo đồng hồ nào.
 *
 * Bản trước KHÔNG dựng vùng này, vì lúc đó `setSpeed` chưa tồn tại và ba cái nút
 * không nối vào đâu là đồ trang trí.
 */
export function TopBar({ view, level, speed, onSpeed, settings }: TopBarProps): ReactElement {
  const s = summarize(view);
  return (
    <header
      className={cn('absolute inset-x-0 top-0 flex h-12 items-center gap-3 border-b px-3', Z.hud, HUD_PANEL_FLUSH)}
    >
      <Button asChild variant="ghost" size="sm" className="shrink-0">
        <Link href="/games">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Thoát
        </Link>
      </Button>

      <h1 className="shrink-0 text-sm font-semibold tracking-tight text-foreground">Kubernetes Game</h1>

      {/*
        Thanh cuộn ngang bị ẩn: ở màn hẹp bộ đếm tràn và trình duyệt vẽ một thanh
        cuộn xám ngay dưới hàng số, trông như một thanh tiến độ hỏng. Nội dung
        vẫn cuộn được bằng chuột/vuốt, chỉ là không vẽ thanh.
      */}
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Counter label="Nodes" value={`${String(s.nodesReady)}/${String(s.nodesTotal)}`} />
        <Counter label="Pods ready" value={`${String(s.podsReady)}/${String(s.podsTotal)}`} />
        <Counter label="Deploy" value={String(s.deployments)} />
        <Counter label="Svc" value={String(s.services)} />
        <Meter label="CPU" value={s.cpu} />
        <Meter label="MEM" value={s.memory} />
        {level !== null ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            L{level.chapter}
          </span>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Tốc độ mô phỏng"
        className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 p-0.5"
      >
        {SPEEDS.map((multiplier) => (
          <button
            key={multiplier}
            type="button"
            aria-pressed={speed === multiplier}
            onClick={() => onSpeed(multiplier)}
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors duration-[var(--motion-fast)]',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              speed === multiplier ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {multiplier}x
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">{settings}</div>
    </header>
  );
}

export interface MiniMapProps {
  readonly view: ClusterView;
  readonly focusedNode: string | null;
  readonly onFocusNode: (name: string) => void;
  /** Vỏ quyết định vị trí — nó biết inspector đang mở hay không, bản đồ thì không. */
  readonly className?: string;
}

/**
 * Bản đồ thu nhỏ, dưới-phải — vẽ bằng **DOM**, không phải canvas thứ hai.
 *
 * Hai lý do, và cả hai đều quan trọng hơn vẻ đẹp: một canvas thứ hai là một
 * context WebGL thứ hai (trình duyệt giới hạn số context đồng thời, và mất
 * context là mất cả cảnh chính); và DOM thì bấm được bằng bàn phím, còn hình vẽ
 * trong canvas thì không — §12.4 không cho phép một vùng chỉ dùng được bằng chuột.
 */
export function MiniMap({ view, focusedNode, onFocusNode, className }: MiniMapProps): ReactElement | null {
  if (view.nodes.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="k8s-minimap-heading" className={cn('absolute p-2', Z.decoration, PANEL, className)}>
      <h2 id="k8s-minimap-heading" className="sr-only">
        Bản đồ thu nhỏ của cluster
      </h2>
      <ul role="list" className="flex items-end gap-1.5">
        {view.nodes.map((node) => {
          const pods = view.objects.filter((o) => o.kind === 'Pod' && o.nodeName === node.name);
          const focused = node.name === focusedNode;
          return (
            <li key={node.name}>
              <button
                type="button"
                onClick={() => onFocusNode(node.name)}
                aria-pressed={focused}
                className={cn(
                  'flex w-20 flex-col items-center gap-1 rounded px-1 py-1 transition-colors',
                  'duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  focused ? 'bg-accent' : 'hover:bg-muted',
                )}
              >
                <span aria-hidden="true" className="flex flex-wrap justify-center gap-0.5">
                  {pods.slice(0, 8).map((pod) => (
                    <span
                      key={pod.uid}
                      className={cn(
                        'size-1.5 rounded-full',
                        pod.statusToken === 'destructive'
                          ? 'bg-destructive'
                          : pod.statusToken === 'warning'
                            ? 'bg-warning'
                            : 'bg-success',
                      )}
                    />
                  ))}
                </span>
                <span
                  aria-hidden="true"
                  className={cn('h-1 w-full rounded-full', node.ready ? 'bg-muted-foreground' : 'bg-destructive')}
                />
                <span className="sr-only">
                  Đưa góc nhìn tới node {node.name}, {node.ready ? 'đang sẵn sàng' : 'NotReady'}, {pods.length} pod
                </span>
                {/*
                  Tên node cắt cụt đọc ra như một lỗi vẽ ("may-ch…"), nên ô rộng
                  hơn (80px) và chữ được phép xuống dòng. Tên node tiếng Việt dài
                  hơn hẳn "node-1" của bản gốc — đây là chỗ chép nguyên kích thước
                  của họ sẽ hỏng.
                */}
                <span aria-hidden="true" className="w-full text-center font-mono text-[9px] leading-tight break-all text-muted-foreground">
                  {node.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface WinOverlayProps {
  readonly status: SessionStatus;
  readonly level: Level;
  readonly onDismiss: () => void;
}

/**
 * Đúc kết giữa màn hình khi thắng (§12.5, hàng cuối).
 *
 * Hợp đồng gọi đây là khoảnh khắc "à ra thế", và nó chiếm giữa màn hình một lúc
 * vì đó chính là điểm khác nhau giữa "qua được level" và "nhớ được điều gì".
 *
 * ⚠ KHÔNG phải `<dialog>` modal và KHÔNG bẫy focus: người chơi vẫn được xem lại
 * cụm mình vừa cứu trong lúc đọc phần đúc kết. Nó là một vùng thông báo nổi lên,
 * không phải một cánh cửa chặn đường.
 */
export function WinOverlay({ status, level, onDismiss }: WinOverlayProps): ReactElement | null {
  if (status.phase !== 'won') {
    return null;
  }
  return (
    <section
      aria-labelledby="k8s-win-heading"
      className={cn(
        'absolute top-1/2 left-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-5',
        Z.input,
        PANEL,
      )}
    >
      <h2 id="k8s-win-heading" className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Sparkles aria-hidden="true" className="size-5 text-success" />
        Hoàn thành: {level.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {status.movesUsed} nước đi · {status.hintsRevealed} gợi ý đã mở
      </p>
      {level.teaching.takeaways.length > 0 ? (
        <ul role="list" aria-label="Điều rút ra sau level" className="mt-3 flex flex-col gap-2">
          {level.teaching.takeaways.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-foreground">
              <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" size="sm" className="mt-4" onClick={onDismiss}>
        Đóng
      </Button>
    </section>
  );
}
