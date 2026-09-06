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
 * Nên component này cố ý KHÔNG khẳng định thành công. Sự kiện `load` của iframe
 * chỉ nói "trình duyệt đã nạp XONG MỘT TÀI LIỆU" — một trang 404 của Traefik
 * cũng bắn đúng sự kiện đó. Vì vậy sau khi `load`, thanh công cụ vẫn ở lại với
 * "Mở trong tab mới" (chỗ duy nhất người dùng thấy được lỗi THẬT của máy chủ)
 * và "Tải lại". Đọc `contentDocument` để đoán 404 thì hợp lệ về kỹ thuật (cùng
 * origin) nhưng là đoán mò trên HTML của một thành phần khác — đúng hạng phép
 * kiểm sẽ mục lặng lẽ.
 */

type BootPhase = 'booting' | 'loaded' | 'timeout';

export function IdePane({ sessionId }: { sessionId: string | null }): React.ReactElement {
  const [phase, setPhase] = useState<BootPhase>('booting');
  /** Tăng để BUỘC iframe dựng lại — nút "Tải lại IDE". */
  const [reloadKey, setReloadKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      return;
    }
    setPhase('booting');
    timerRef.current = setTimeout(() => {
      setPhase((current) => (current === 'booting' ? 'timeout' : current));
    }, IDE_BOOT_TIMEOUT_MS);
    return () => {
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
        {phase === 'booting' && (
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
        <iframe
          key={`${sessionId}:${String(reloadKey)}`}
          src={ideSessionUrl(sessionId)}
          title="Trình soạn thảo trong sandbox"
          className="h-full w-full border-0"
          onLoad={() => {
            setPhase('loaded');
          }}
        />

        {phase === 'booting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card px-6 text-center">
            <p className="text-sm font-medium">IDE đang khởi động…</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Lần đầu mở thường mất khoảng 20 giây. Bạn có thể dùng terminal bên cạnh ngay
              trong lúc chờ.
            </p>
          </div>
        )}

        {phase === 'timeout' && (
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
              Sau {Math.round(IDE_BOOT_TIMEOUT_MS / 1000)} giây trình soạn thảo vẫn chưa phản
              hồi. Có thể nó còn đang khởi động, hoặc đường <code>/ide</code> chưa được mở tới
              gateway trên cụm này. <strong>Bài học vẫn làm được bình thường bằng terminal</strong>{' '}
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
