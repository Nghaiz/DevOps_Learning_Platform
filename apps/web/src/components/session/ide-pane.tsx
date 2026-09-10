'use client';

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ExternalLink, RotateCw } from 'lucide-react';
import { t, err } from '@devops-platform/copy';
import { ARC_VIEWBOX, arcSpinnerProps, arcTrackProps } from '@devops-platform/motion/motif';
import { Button, cn } from '@devops-platform/ui';
import { PaneHeader } from './pane-header';
import { IDE_BOOT_TIMEOUT_MS, ideSessionUrl } from './ide-layout';

/**
 * D8 — khoang IDE (Theia của P6) trong iframe CÙNG ORIGIN.
 *
 * ## P16 · 16.D.3 — file này chuyển từ `app/lessons/[id]/` sang đây
 *
 * Bài nào bật IDE là quyết định NỘI DUNG, không phải quyết định kiến trúc. Chừng
 * nào component còn nằm trong thư mục route của trang bài học thì lab không dùng
 * được nó, và câu "lab không có tab Editor" đọc ra như một giới hạn kỹ thuật
 * trong khi nó chỉ là một chỗ để file. `WorkspacePanel` không đổi một dòng: nó
 * vốn chỉ nhận `editor?: ReactNode`.
 *
 * ## ⛔ LOGIC THĂM DÒ GIỮ NGUYÊN — đo trên cụm 2026-09-07
 *
 * Bản trước gắn iframe NGAY khi có `sessionId` và coi `load` là thành công. Cả
 * hai vế đều hỏng, và hỏng cùng lúc nên che nhau:
 *
 *   1. Phiên trả về lúc t+8s, còn Theia bind cổng 4000 ở ~t+20s (số của P6).
 *      Lượt nạp DUY NHẤT ấy rơi thẳng vào giữa cửa sổ khởi động. Log gateway của
 *      lượt đo: đúng MỘT dòng `dial tcp …:4000: connection refused`, rồi im
 *      lặng, không có lượt thử thứ hai nào.
 *   2. Thân 503 của gateway (`{"code":"IDE_UNAVAILABLE"}`) VẪN bắn `load`, nên
 *      trạng thái nhảy sang "đã nạp", lớp phủ biến mất, hạn 45s không bao giờ
 *      chạm, và người học nhìn một khối JSON thô nằm giữa khoang editor, vĩnh
 *      viễn. Bấm "Tải lại IDE" bằng tay thì Theia lên bình thường.
 *
 * Cách sửa: `fetch` chính URL đó trước, chỉ gắn iframe khi server trả 2xx. Đây
 * là một phép kiểm THẬT, nó đọc MÃ TRẠNG THÁI, thứ `load` không cho ta.
 *
 * ⛔ KHÔNG `onLoad`. `load` chưa bao giờ là bằng chứng thành công, và nay đã có
 * bằng chứng thật nên không cần cái giả.
 *
 * ## Cái ĐỔI ở P16: phần NHÌN của màn chờ
 *
 * Hai mươi giây nhìn một khối xám đọc ra là trang hỏng, không phải là chờ. Ba
 * thứ thay khối xám đó, và mỗi thứ trả lời một câu hỏi khác nhau:
 *
 * | Thứ | Trả lời câu |
 * |---|---|
 * | cung ellipse chạy | "còn đang làm hay đã treo?" |
 * | số giây đã trôi | "bao lâu rồi?" |
 * | câu "thường mất khoảng 20 giây" | "bao lâu nữa thì bất thường?" |
 *
 * Cung là cung KHÔNG XÁC ĐỊNH (`arcSpinnerProps`), không phải một thanh tiến độ
 * chạy tới hạn 45 giây. Một thanh đầy dần tới hạn hứa rằng lúc nó đầy là lúc
 * xong, trong khi lúc nó đầy chính là lúc THẤT BẠI. Đó là một affordance nói
 * dối, và nó nói dối đúng vào phút người dùng cần tin nó nhất.
 *
 * Số giây KHÔNG nằm trong vùng `aria-live`: nó đổi mỗi giây, và một vùng sống
 * cập nhật mỗi giây là trình đọc màn hình đọc liên tục suốt 45 giây. Nó vẫn là
 * một node bình thường nên người dùng bàn phím điều hướng tới đọc được.
 *
 * ## ⚠ `/ide` CHƯA TỪNG đi qua Traefik trong repo này
 *
 * Mọi phép đo IDE của P6 dùng `kubectl port-forward`. Path ingress `/ide` và
 * tier `ratelimit-ide` là SUY LUẬN, chưa đo. Triệu chứng nếu sai không phải một
 * thông báo rate-limit mà là iframe TRẮNG hoặc nạp nửa chừng. Đó là lý do nút
 * "Mở trong tab mới" là đường thoát BẮT BUỘC chứ không phải tiện nghi: khi
 * iframe trắng, đó là chỗ duy nhất người dùng đọc được thông báo thật của máy
 * chủ.
 */

/** Nhịp thăm dò. 2s: đủ thưa để không ồn, đủ dày để không thêm độ trễ cảm nhận được. */
const IDE_PROBE_INTERVAL_MS = 2_000;

/** Nhịp đếm số giây đã chờ. Chỉ chạy trong lúc `probing`. */
const ELAPSED_TICK_MS = 1_000;

type BootState =
  | { readonly kind: 'probing' }
  /** Server ĐÃ trả 2xx — chỉ tới đây iframe mới được gắn. */
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly reason: string };

export interface IdePaneProps {
  readonly sessionId: string | null;
}

export function IdePane({ sessionId }: IdePaneProps): ReactElement {
  const [state, setState] = useState<BootState>({ kind: 'probing' });
  /** Tăng để BUỘC thăm dò + iframe dựng lại — nút "Tải lại IDE". */
  const [reloadKey, setReloadKey] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    // Chốt giá trị vào một hằng cục bộ: TS không thu hẹp được `sessionId` bên
    // trong closure của vòng lặp async, và một `as string` ở đó là chỗ để một
    // `null` thật lọt qua về sau mà không ai thấy.
    const id = sessionId;
    setState({ kind: 'probing' });

    // `cancelled` chứ không chỉ `AbortController`: vòng lặp còn NGỦ giữa hai
    // lượt, và một `setState` sau khi component đã tháo là một cảnh báo React
    // cộng một lần ghi vào state đã chết.
    let cancelled = false;
    const controller = new AbortController();
    const deadline = Date.now() + IDE_BOOT_TIMEOUT_MS;

    async function probe(): Promise<void> {
      while (!cancelled) {
        try {
          const res = await fetch(ideSessionUrl(id), {
            signal: controller.signal,
            cache: 'no-store',
          });
          if (cancelled) return;
          if (res.ok) {
            setState({ kind: 'ready' });
            return;
          }
          // 5xx = upstream chưa lên. Bất kỳ mã nào khác là lỗi cấu hình hoặc uỷ
          // quyền: thử lại 22 lần cũng ra đúng kết quả đó, chỉ chậm hơn, và một
          // câu chung chung sau 45 giây là thứ không ai chẩn đoán được.
          if (res.status < 500) {
            setState({
              kind: 'failed',
              reason: t('session.ide.reason-http', { status: res.status }),
            });
            return;
          }
        } catch {
          if (cancelled) return;
          // Lỗi mạng — cùng nhóm với 5xx: có thể vẫn đang lên.
        }
        if (Date.now() + IDE_PROBE_INTERVAL_MS >= deadline) {
          if (!cancelled) {
            setState({
              kind: 'failed',
              reason: t('session.ide.reason-timeout', {
                seconds: Math.round(IDE_BOOT_TIMEOUT_MS / 1000),
              }),
            });
          }
          return;
        }
        await new Promise((resolve) => {
          timerRef.current = setTimeout(resolve, IDE_PROBE_INTERVAL_MS);
        });
      }
    }

    void probe();

    return () => {
      cancelled = true;
      controller.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sessionId, reloadKey]);

  /*
    Đồng hồ đếm, TÁCH khỏi vòng thăm dò.

    Gộp vào vòng kia thì số giây chỉ nhảy mỗi 2 giây theo nhịp `fetch`, và một
    đồng hồ nhảy hai giây một lần đọc ra là đồng hồ hỏng. Tách ra cũng có nghĩa
    là nó dừng đúng lúc `state` rời `probing`, không cần một cờ riêng.
  */
  useEffect(() => {
    if (state.kind !== 'probing' || sessionId === null) {
      return;
    }
    setElapsedSec(0);
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - started) / 1000));
    }, ELAPSED_TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, [state.kind, sessionId, reloadKey]);

  if (sessionId === null) {
    return (
      <div className="flex h-full w-full flex-col bg-card">
        <PaneHeader icon={<ArcMark />} title={t('session.ide.pane-title')} />
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {t('session.ide.no-session')}
        </div>
      </div>
    );
  }

  const reload = (): void => {
    setReloadKey((n) => n + 1);
  };

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <PaneHeader icon={<ArcMark />} title={t('session.ide.pane-title')}>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<RotateCw aria-hidden="true" className="size-3.5" />}
            onClick={reload}
          >
            {t('session.ide.reload')}
          </Button>
          {/*
            Đường thoát BẮT BUỘC, không phải tiện nghi: khi iframe trắng, đây là
            chỗ duy nhất người dùng đọc được thông báo thật của máy chủ (404 của
            Traefik, lỗi TLS, lỗi cookie). `rel="noreferrer"` giữ nguyên dù cùng
            origin: không có lý do gì để rò Referer vào một tab mới.
          */}
          <a
            href={ideSessionUrl(sessionId)}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary',
              'underline-offset-4 hover:underline',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {t('session.ide.open-new-tab')}
          </a>
        </div>
      </PaneHeader>

      <div className="relative min-h-0 flex-1">
        {/*
          Iframe chỉ được GẮN sau khi thăm dò trả 2xx. Đây là đường DUY NHẤT nó
          được gắn — xem khối đầu file về lý do một lượt nạp duy nhất là sai.
        */}
        {state.kind === 'ready' && (
          <iframe
            key={`${sessionId}:${String(reloadKey)}`}
            src={ideSessionUrl(sessionId)}
            title={t('session.ide.iframe-title')}
            className="h-full w-full border-0"
          />
        )}

        {state.kind === 'probing' && (
          <IdeBootScreen elapsedSec={elapsedSec} />
        )}

        {state.kind === 'failed' && <IdeFailedScreen reason={state.reason} onRetry={reload} />}
      </div>
    </div>
  );
}

/**
 * Dấu nhận diện của khoang: một cung ellipse TĨNH, cùng hình học với cung chạy
 * ở màn chờ. Nó ở thanh nhãn nên nó không được động: bất cứ thứ gì nhấp nháy
 * cạnh một terminal đang gõ là nhiễu.
 */
function ArcMark(): ReactElement {
  return (
    <svg viewBox={ARC_VIEWBOX} aria-hidden="true">
      <path {...arcTrackProps()} />
    </svg>
  );
}

/**
 * Màn chờ. Ba câu trả lời, ba phần tử — xem bảng ở khối đầu file.
 *
 * `role="status"` bọc ĐÚNG phần chữ tĩnh. Số giây nằm ngoài nó: nó đổi mỗi
 * giây, và một vùng sống cập nhật mỗi giây là 45 lượt đọc liên tiếp trong tai
 * người dùng trình đọc màn hình.
 */
function IdeBootScreen({ elapsedSec }: { readonly elapsedSec: number }): ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-card px-6 text-center">
      {/*
        Cung KHÔNG XÁC ĐỊNH. `arcSpinnerProps` dựa vào `@keyframes dlp-arc-sweep`
        đã có trong `globals.css`; ở chế độ giảm chuyển động thì khối
        `prefers-reduced-motion` hạ nó thành một vòng tĩnh vẽ đầy, đúng ý và
        không cần một cổng JS nào.

        `text-primary` chứ không một token màu trong props: `arcSpinnerProps`
        đặt `stroke: currentColor` có chủ ý, nên màu do bề mặt quyết định.
      */}
      <svg
        viewBox={ARC_VIEWBOX}
        aria-hidden="true"
        className="size-16 shrink-0 text-primary"
      >
        <path {...arcTrackProps()} />
        <path {...arcSpinnerProps()} />
      </svg>

      <div role="status" className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{t('session.ide.booting-title')}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t('session.ide.booting-detail')}</p>
      </div>

      {/*
        `tabular-nums` để con số không nhảy ngang khi đi từ 9 sang 10 — cùng lý
        do đồng hồ TTL của `session-controls.tsx` dùng nó.
      */}
      <p className="text-xs text-muted-foreground tabular-nums">
        {t('session.ide.booting-elapsed', { seconds: elapsedSec })}
      </p>
    </div>
  );
}

/**
 * Màn thất bại. Thông báo phải nói CHUYỆN GÌ + LÀM GÌ TIẾP.
 *
 * "Không tải được IDE" một mình là một ngõ cụt: người học không biết mình mất gì
 * (bài vẫn học được bằng terminal) và không biết thử gì tiếp. Hai nửa đó nay
 * tách rời ở TẦNG KIỂU (`ErrorEntry`), nên một bản sau không rút gọn còn một
 * nửa được.
 */
function IdeFailedScreen({
  reason,
  onRetry,
}: {
  readonly reason: string;
  readonly onRetry: () => void;
}): ReactElement {
  const entry = err('session.ide.error.probe', { reason });

  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-6 text-center"
    >
      <p className="text-sm font-medium text-destructive">{entry.what}</p>
      <p className="max-w-md text-xs text-muted-foreground">{entry.next}</p>
      <Button
        size="sm"
        variant="secondary"
        iconLeft={<RotateCw aria-hidden="true" className="size-3.5" />}
        onClick={onRetry}
      >
        {t('session.ide.retry')}
      </Button>
    </div>
  );
}
