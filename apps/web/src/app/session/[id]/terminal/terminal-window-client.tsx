'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { LoaderCircle } from 'lucide-react';
import { buildSessionWsUrl, type ServerControl } from '@devops-platform/terminal';
import { Button } from '@devops-platform/ui';
import { useResolvedTerminalTheme } from '../../../../components/session/use-resolved-terminal-theme';

/**
 * C7 — cửa sổ terminal TOÀN MÀN HÌNH cho `/session/<id>/terminal`.
 *
 * ## Vì sao dùng lại `terminal-surface-lazy`, không viết đường nạp thứ hai
 *
 * `@xterm/xterm` chạm `document` ngay lúc import module, nên nó phải đi qua
 * `next/dynamic({ ssr: false })`, và `ssr: false` PHẢI nằm trong một Client
 * Component (Next 16 ném khi thấy nó trong Server Component). Khuôn đúng đã có
 * ở `components/session/terminal-pane.tsx`; đích nạp là MỘT file dùng chung
 * (`terminal-surface-lazy.tsx`) đúng để bốn route chia nhau một chunk xterm.
 * Thêm một đích thứ hai ở đây là thêm một bản sao vài trăm KB, và một chỗ nữa
 * để `onEscapeFocus` mặc định trôi khỏi bản gốc.
 *
 * ## Vì sao `fixed inset-0` chứ không phải một layout riêng
 *
 * "Không vỏ ứng dụng, không nav" — nhưng vỏ nằm ở `app/layout.tsx` (root
 * layout), và App Router KHÔNG cho một route bỏ qua root layout trừ khi cả cây
 * được tách thành nhiều root layout. Đó là một sửa đổi ở `app/layout.tsx`, thứ
 * lane này không sở hữu. Lớp phủ `fixed inset-0 z-50` che kín viewport và nằm
 * TRÊN thanh đầu trang (`z-40`), nên kết quả nhìn thấy đúng như yêu cầu.
 *
 * ⚠ Giới hạn đã biết của cách này: thanh đầu trang vẫn còn trong DOM, nên nó
 * vẫn nằm trong vòng `Tab` phía sau lớp phủ. Đã ghi vào report cho lead — sửa
 * đúng là tách root layout, và đó là việc của lane sở hữu vỏ.
 *
 * ## ⚠ Một phiên chỉ có MỘT WebSocket
 *
 * `GATEWAY_MAX_WS_PER_SESSION = 1` (§C6). Trang này mở kết nối của riêng nó,
 * nên mở nó trong lúc tab bài học vẫn đang nối là hai client tranh một khe.
 * Đây là ràng buộc hạ tầng, không phải thứ trang này che được — nên khi kết nối
 * đóng, màn hình dưới đây nói thẳng lý do đó thay vì lặng lẽ thử lại mãi.
 */
const TerminalSurfaceLazy = dynamic(
  () => import('../../../../components/session/terminal-surface-lazy'),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        Đang mở terminal…
      </p>
    ),
  },
);

const ARIA_LABEL = 'Terminal sandbox toàn màn hình. Nhấn Esc hai lần để rời khỏi terminal.';

type WindowPhase =
  | { readonly kind: 'connecting' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'stopped'; readonly detail: string };

export function TerminalWindowClient({ sessionId }: { readonly sessionId: string }): ReactElement {
  const theme = useResolvedTerminalTheme(undefined);
  const [phase, setPhase] = useState<WindowPhase>({ kind: 'connecting' });

  /**
   * `wsUrl` tính trong effect, không tính lúc dựng state: `globalThis.location`
   * không tồn tại ở lượt render phía server, và một giá trị khác nhau giữa
   * server với client cho cùng một cây là lỗi hydrate.
   *
   * `connectionKey` là cần câu nối lại (xem `TerminalSurfaceProps`): `null` =
   * chưa nối. Tăng giá trị = yêu cầu mở lại.
   */
  const [wsUrl, setWsUrl] = useState('');
  const [connectionKey, setConnectionKey] = useState<number | null>(null);

  useEffect(() => {
    setWsUrl(buildSessionWsUrl(globalThis.location.origin, sessionId));
    setConnectionKey(1);
  }, [sessionId]);

  const onControl = useCallback((message: ServerControl) => {
    switch (message.type) {
      case 'ready':
        setPhase({ kind: 'ready' });
        return;
      case 'error':
        // Contract §5: KHÔNG parse chuỗi này — chỉ hiện lại cho người đọc.
        setPhase({ kind: 'stopped', detail: message.message });
        return;
      case 'exit':
        setPhase({ kind: 'stopped', detail: `Shell đã thoát (mã ${String(message.exitCode)}).` });
        return;
      default:
        // 'expiring' — cửa sổ này không quản vòng đời phiên, tab bài học mới có
        // nút gia hạn. Không dựng một đồng hồ thứ hai ở đây: hai nơi cùng đếm
        // một hạn là hai con số sẽ lệch nhau.
        return;
    }
  }, []);

  const onClose = useCallback((code: number) => {
    setConnectionKey(null);
    setPhase({
      kind: 'stopped',
      detail:
        `Kết nối đã đóng (mã ${String(code)}). ` +
        'Mỗi phiên chỉ giữ được MỘT kết nối terminal, nên nếu bạn vừa mở lại ' +
        'terminal ở tab bài học thì cửa sổ này đã bị thay chỗ.',
    });
  }, []);

  const reconnect = useCallback(() => {
    setPhase({ kind: 'connecting' });
    setConnectionKey((key) => (key ?? 0) + 1);
  }, []);

  return (
    // `fixed inset-0 z-50` — che kín viewport, nằm trên thanh đầu trang (z-40).
    // Xem lý lẽ đầy đủ ở chú thích đầu file.
    <div className="fixed inset-0 z-50 flex flex-col bg-card">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        <span className="truncate font-medium text-foreground">Terminal — phiên {sessionId}</span>
        {phase.kind === 'connecting' ? (
          <span role="status" className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
            Đang kết nối…
          </span>
        ) : null}
      </div>

      {phase.kind === 'stopped' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p role="status" className="max-w-md text-sm text-muted-foreground">
            {phase.detail}
          </p>
          <Button size="sm" variant="outline" onClick={reconnect}>
            Thử nối lại
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {/* `connectionKey === null` ⇒ chưa/không nối; surface tự hiểu giá trị này. */}
          <TerminalSurfaceLazy
            wsUrl={wsUrl}
            connectionKey={connectionKey}
            theme={theme}
            ariaLabel={ARIA_LABEL}
            onControl={onControl}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
