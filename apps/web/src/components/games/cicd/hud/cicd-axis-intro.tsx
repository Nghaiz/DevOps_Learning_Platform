'use client';

/**
 * Màn chuyển tiếp giữa hai chương — trục Y ĐỔI NGHĨA (19.D.5.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ RỦI RO THẬT CỦA QUYẾT ĐỊNH #13, KHÔNG PHẢI MỘT MÀN CHÀO MỪNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chương CI đọc trục Y là **thời gian chờ hàng đợi**; chương CD đọc trục Y là
 * **dải môi trường**. Cùng một chiều trên màn hình, hai đại lượng không liên
 * quan. Người chơi đã học "cao = chờ lâu" suốt mười bốn level sẽ bước vào C15 và
 * đọc "cao = prod" bằng đúng cái phản xạ cũ — và không gì trên màn báo cho họ
 * biết là phản xạ đó vừa hết hiệu lực.
 *
 * `phase-19.md` §19.D.4 ghi rõ: **không có phương án lùi**. Nên chỗ duy nhất
 * chặn được nó là một màn nói thẳng ra, đúng một lần, ngay trước level đầu của
 * chương CD.
 *
 * ⚠ **Tự hiện CHỈ ở chương CD.** Chương CI là chương đầu — ở đó không có "nghĩa
 * cũ" nào để học lại, nên một màn chặn đường ở level đầu tiên chỉ là một cú bấm
 * thừa trước khi người ta kịp thấy trò chơi. Mở lại thì mở được ở CẢ HAI chương,
 * từ nút Trợ giúp.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@devops-platform/ui';

import { readHudValue, writeHudValue } from './hud-storage';
import { CICD_HOTKEYS } from './cicd-keymap';

export type CicdChapter = 'ci' | 'cd';

function introSuffix(chapter: CicdChapter): string {
  return `axis-intro:${chapter}`;
}

export interface AxisIntroHandle {
  readonly open: boolean;
  /** Mở lại từ nút Trợ giúp. */
  readonly show: () => void;
  /** Đóng VÀ ghi nhớ là đã xem — cả "Bỏ qua" lẫn "Đã hiểu" đều đi đường này. */
  readonly dismiss: () => void;
}

export function useAxisIntro(chapter: CicdChapter): AxisIntroHandle {
  const [open, setOpen] = useState(false);

  /*
   * Đọc `localStorage` trong effect, không ở lần render đầu: máy chủ không có
   * nó, nên đọc sớm là HTML từ server lệch với cây sau hydrate. Cùng lý lẽ với
   * `use-hud-panels.ts` và `webgl-detect.ts`.
   */
  useEffect(() => {
    if (chapter !== 'cd') return;
    if (readHudValue(introSuffix(chapter)) !== null) return;
    setOpen(true);
  }, [chapter]);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    writeHudValue(introSuffix(chapter), 'seen');
    setOpen(false);
  }, [chapter]);

  return { open, show, dismiss };
}

export interface CicdAxisIntroProps {
  readonly chapter: CicdChapter;
  readonly onDismiss: () => void;
}

/**
 * Hình vẽ hai cách đọc trục dọc.
 *
 * ⛔ Không một mã màu nào: mọi nét lấy `currentColor`, và màu đến từ lớp
 * `text-*` của token. Cổng `pnpm tokens:check` gác điều này, nhưng lý do sâu hơn
 * là hình phải đổi theo theme sáng/tối như mọi thứ khác trên màn.
 */
function AxisFigure({ chapter }: { readonly chapter: CicdChapter }): ReactElement {
  return (
    <svg
      viewBox="0 0 320 120"
      className="h-auto w-full max-w-md"
      role="img"
      aria-label={
        chapter === 'cd'
          ? 'Hình: trục dọc chia thành ba dải môi trường, dải trên cùng là prod'
          : 'Hình: trục dọc là thời gian chờ hàng đợi, job càng cao càng chờ lâu'
      }
    >
      {/* Trục */}
      <g className="text-border" stroke="currentColor" strokeWidth="1">
        <line x1="40" y1="10" x2="40" y2="105" />
        <line x1="40" y1="105" x2="310" y2="105" />
      </g>

      {chapter === 'cd' ? (
        <>
          <g className="text-muted-foreground" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3">
            <line x1="40" y1="35" x2="310" y2="35" />
            <line x1="40" y1="70" x2="310" y2="70" />
          </g>
          <g className="text-muted-foreground" fill="currentColor" fontSize="9">
            <text x="46" y="25">prod</text>
            <text x="46" y="60">staging</text>
            <text x="46" y="95">dev</text>
          </g>
          <g className="text-primary" fill="currentColor">
            <rect x="120" y="82" width="34" height="14" rx="3" />
            <rect x="190" y="47" width="34" height="14" rx="3" />
            <rect x="260" y="12" width="34" height="14" rx="3" />
          </g>
        </>
      ) : (
        <>
          <g className="text-muted-foreground" fill="currentColor" fontSize="9">
            <text x="46" y="22">chờ lâu</text>
            <text x="46" y="99">chạy ngay</text>
          </g>
          <g className="text-primary" fill="currentColor">
            <rect x="120" y="82" width="34" height="14" rx="3" />
            <rect x="190" y="60" width="34" height="14" rx="3" />
            <rect x="260" y="20" width="34" height="14" rx="3" />
          </g>
        </>
      )}
    </svg>
  );
}

export function CicdAxisIntro({ chapter, onDismiss }: CicdAxisIntroProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);

  /*
   * Đưa tiêu điểm vào hộp thoại khi nó mở. Không có bước này thì với người dùng
   * bàn phím, một tấm che vừa phủ kín màn hình mà tiêu điểm vẫn nằm ở nút họ vừa
   * bấm phía sau nó.
   */
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-background/85 p-6 backdrop-blur-sm"
      data-testid="cicd-axis-intro"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cicd-axis-intro-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          /*
           * Nuốt phím tại đây: `Escape` toàn màn là "bỏ chọn job", và để nó chạy
           * tiếp thì một lần bấm vừa đóng hộp thoại vừa xoá lựa chọn phía sau.
           */
          event.stopPropagation();
          event.preventDefault();
          onDismiss();
        }}
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg focus-visible:outline-none"
      >
        <h2 id="cicd-axis-intro-title" className="text-lg font-semibold text-foreground">
          {chapter === 'cd'
            ? 'Chiều dọc vừa đổi nghĩa: từ thời gian chờ sang môi trường'
            : 'Cách đọc không gian ở chương CI'}
        </h2>

        {chapter === 'cd' ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Suốt chương CI, một job nằm càng cao nghĩa là nó <strong>chờ hàng đợi</strong> càng
              lâu. Từ chương CD, chiều dọc không còn nói về thời gian nữa.
            </p>
            <p>
              Giờ nó là <strong>dải môi trường</strong>: dưới cùng là dev, giữa là staging, trên
              cùng là prod. Một job đi lên nghĩa là bản dựng được thăng hạng lên môi trường cao
              hơn — không phải là nó chậm hơn.
            </p>
            <p>
              Chiều ngang thì giữ nguyên ở cả hai chương: càng sang phải, càng phụ thuộc vào nhiều
              thứ phía trước.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              Chiều ngang là thứ tự phụ thuộc: càng sang phải, job càng phải đợi nhiều thứ phía
              trước.
            </p>
            <p>
              Chiều dọc là <strong>thời gian chờ hàng đợi</strong> — job nằm càng cao thì nó sẵn
              sàng từ lâu mà vẫn chưa có máy để chạy. Đó là chỗ thêm máy sẽ cứu được, và cũng là
              chỗ thêm máy sẽ đốt runner-phút.
            </p>
          </div>
        )}

        <AxisFigure chapter={chapter} />

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Phím tắt
          </h3>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {CICD_HOTKEYS.map((hotkey) => (
              <li key={hotkey.label} className="flex items-baseline gap-2 text-xs">
                <kbd className="rounded border border-border px-1 font-mono text-muted-foreground">
                  {hotkey.label}
                </kbd>
                <span className="text-muted-foreground">{hotkey.describe}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Mọi thao tác đều có nút bấm đi được bằng phím Tab — phím tắt chỉ là đường đi ngắn hơn.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onDismiss}>Đã hiểu, vào màn</Button>
          <Button variant="ghost" onClick={onDismiss}>
            Bỏ qua
          </Button>
          <p className="basis-full text-xs text-muted-foreground">
            Mở lại bất cứ lúc nào bằng nút “Trợ giúp” trên thanh trên cùng.
          </p>
        </div>
      </div>
    </div>
  );
}
