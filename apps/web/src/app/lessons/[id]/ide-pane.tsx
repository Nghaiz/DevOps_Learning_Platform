'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@devops-platform/ui';
import { IDE_BOOT_TIMEOUT_MS, ideSessionUrl } from '../../../components/session';

/**
 * D8 — khoang IDE (Theia của P6) trong iframe CÙNG ORIGIN.
 *
 * ## Vì sao có màn hình "đang khởi động" và một hạn chờ
 *
 * Khởi động nguội Theia đo được ~20s ở P6. Hai mươi giây nhìn một iframe trắng
 * đọc ra là trang hỏng, không phải là chờ — nên trạng thái khởi động phải nói
 * ra, từ giây đầu tiên.
 *
 * ## ⚠ `/ide` CHƯA TỪNG đi qua Traefik trong repo này
 *
 * Mọi phép đo IDE của P6 (6.A/6.B/6.E) dùng `kubectl port-forward`. Path ingress
 * `/ide` và tier `ratelimit-ide` là SUY LUẬN, chưa đo (`phase-13-exec.md` §3bis).
 * Triệu chứng nếu sai không phải một thông báo rate-limit mà là **iframe trắng
 * hoặc nạp nửa chừng**.
 *
 * ## ⛔ MỘT LƯỢT NẠP DUY NHẤT LÀ SAI — đo trên cụm 2026-09-07
 *
 * Bản trước gắn iframe NGAY khi có `sessionId` và coi `load` là thành công.
 * Cả hai vế đều hỏng, và hỏng cùng lúc nên che nhau:
 *
 *   1. Phiên trả về lúc t+8s, còn Theia bind cổng 4000 ở ~t+20s (số của P6).
 *      Nên lượt nạp DUY NHẤT ấy rơi thẳng vào giữa cửa sổ khởi động. Log
 *      gateway của lượt đo: đúng MỘT dòng `dial tcp …:4000: connection
 *      refused`, rồi im lặng — không có lượt thử thứ hai nào.
 *   2. Thân 503 của gateway (`{"code":"IDE_UNAVAILABLE"}`) VẪN bắn `load`, nên
 *      `phase` nhảy sang `loaded`, lớp phủ "đang khởi động" biến mất, hạn 45s
 *      không bao giờ chạm — và người học nhìn một khối JSON thô nằm giữa khoang
 *      editor, vĩnh viễn. Bấm "Tải lại IDE" bằng tay thì Theia lên bình thường
 *      (đã chứng: 97 plugin khởi động).
 *
 * Tức IDE hỏng ở gần như MỌI lần mở đầu tiên, trong khi gateway, ảnh sandbox và
 * cờ layout đều đúng. Chú thích ngay bên trên đã nói "`load` không chứng minh
 * thành công" — nhưng mã vẫn dùng `load` làm bằng chứng thành công. Một lời
 * cảnh báo đúng đặt cạnh một đoạn mã làm ngược lại thì cảnh báo thua.
 *
 * ## Cách sửa: THĂM DÒ trước, gắn iframe sau
 *
 * `fetch` chính URL đó (cùng origin ⇒ `connect-src 'self'` đã phủ; cookie
 * `dlp_sandbox` có `Path=/ide` nên đi kèm) và chỉ gắn iframe khi server trả
 * 2xx. Đây là một phép kiểm THẬT — nó đọc mã trạng thái, thứ `load` không cho
 * ta — và nó thay việc "đoán mò trên HTML của thành phần khác" mà bản trước
 * (đúng đắn) từ chối làm.
 *
 * 5xx / lỗi mạng = "còn đang khởi động" ⇒ thử lại. Mọi mã khác (401/403/404) là
 * lỗi thật ⇒ dừng NGAY và nói ra mã, thay vì đốt 45 giây rồi báo một câu chung
 * chung. Chi phí: ~22 lượt GET trong 45s, dưới xa tier `ratelimit-ide`
 * (600/1m, burst 300).
 */

/** Nhịp thăm dò. 2s: đủ thưa để không ồn, đủ dày để không thêm độ trễ cảm nhận được. */
const IDE_PROBE_INTERVAL_MS = 2_000;

type BootState =
  | { readonly kind: 'probing' }
  /** Server ĐÃ trả 2xx — chỉ tới đây iframe mới được gắn. */
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly reason: string };

export function IdePane({ sessionId }: { sessionId: string | null }): React.ReactElement {
  const [state, setState] = useState<BootState>({ kind: 'probing' });
  /** Tăng để BUỘC thăm dò + iframe dựng lại — nút "Tải lại IDE". */
  const [reloadKey, setReloadKey] = useState(0);
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

    // `cancelled` chứ không chỉ `AbortController`: vòng lặp còn ngủ giữa hai
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
          // 5xx = upstream chưa lên. Bất kỳ mã nào khác là lỗi cấu hình/uỷ
          // quyền — thử lại 22 lần cũng ra đúng kết quả đó, chỉ chậm hơn.
          if (res.status < 500) {
            setState({
              kind: 'failed',
              reason: `máy chủ trả HTTP ${String(res.status)} cho đường /ide`,
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
              reason: `sau ${String(Math.round(IDE_BOOT_TIMEOUT_MS / 1000))} giây trình soạn thảo vẫn chưa phản hồi`,
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

  if (sessionId === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-card px-6 text-center text-sm text-muted-foreground">
        IDE mở cùng sandbox — bấm Bắt đầu để dựng phiên.
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">Trình soạn thảo</span>
        {state.kind === 'probing' && (
          <span role="status" className="text-muted-foreground">
            IDE đang khởi động…
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setReloadKey((n) => n + 1);
            }}
          >
            Tải lại IDE
          </Button>
          {/*
            Đường thoát BẮT BUỘC, không phải tiện nghi: khi iframe trắng, đây là
            chỗ duy nhất người dùng đọc được thông báo thật của máy chủ (404 của
            Traefik, lỗi TLS, lỗi cookie). `rel="noreferrer"` giữ nguyên dù cùng
            origin — không có lý do gì để rò Referer vào một tab mới.
          */}
          <a
            href={ideSessionUrl(sessionId)}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            Mở trong tab mới
          </a>
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {/*
          Iframe chỉ được GẮN sau khi thăm dò trả 2xx. Trước bản vá, nó gắn ngay
          và thân 503 của gateway hiện ra dưới dạng JSON thô — xem khối đầu file.
          Không còn `onLoad`: `load` chưa bao giờ là bằng chứng thành công, và
          nay ta có một bằng chứng thật (mã trạng thái) nên không cần cái giả.
        */}
        {state.kind === 'ready' && (
          <iframe
            key={`${sessionId}:${String(reloadKey)}`}
            src={ideSessionUrl(sessionId)}
            title="Trình soạn thảo trong sandbox"
            className="h-full w-full border-0"
          />
        )}

        {state.kind === 'probing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card px-6 text-center">
            <p className="text-sm font-medium">IDE đang khởi động…</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Lần đầu mở thường mất khoảng 20 giây. Bạn có thể dùng terminal bên cạnh ngay
              trong lúc chờ.
            </p>
          </div>
        )}

        {state.kind === 'failed' && (
          /*
            Thông báo phải nói CHUYỆN GÌ + LÀM GÌ TIẾP. "Không tải được IDE" một
            mình là một ngõ cụt: người học không biết mình mất gì (bài vẫn học
            được bằng terminal) và không biết thử gì tiếp.
          */
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-6 text-center"
          >
            <p className="text-sm font-medium text-destructive">IDE chưa mở được</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Lý do: {state.reason}. <strong>Bài học vẫn làm được bình thường bằng terminal</strong>{' '}
              — chỉ thiếu trình soạn thảo.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setReloadKey((n) => n + 1);
                }}
              >
                Thử lại
              </Button>
              <a
                href={ideSessionUrl(sessionId)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Mở trong tab mới để xem lỗi máy chủ
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
