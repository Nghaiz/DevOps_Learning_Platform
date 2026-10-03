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
import { t } from '@devops-platform/copy';

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
          ? t('games.cicd.intro.figure-cd')
          : t('games.cicd.intro.figure-ci')
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
            <text x="46" y="22">{t('games.cicd.intro.figure-slow')}</text>
            <text x="46" y="99">{t('games.cicd.intro.figure-fast')}</text>
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
      className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-background p-6"
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
        className="flex max-h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto border border-border bg-card p-6 shadow-float focus-visible:outline-none"
      >
        <h2 id="cicd-axis-intro-title" className="text-lg font-semibold text-foreground">
          {chapter === 'cd'
            ? t('games.cicd.intro.title-cd')
            : t('games.cicd.intro.title-ci')}
        </h2>

        {chapter === 'cd' ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>
              {t('games.cicd.intro.cd-p1-before')} <strong>{t('games.cicd.intro.cd-p1-strong')}</strong>{' '}
              {t('games.cicd.intro.cd-p1-after')}
            </p>
            <p>
              {t('games.cicd.intro.cd-p2-before')} <strong>{t('games.cicd.intro.cd-p2-strong')}</strong>
              {t('games.cicd.intro.cd-p2-after')}
            </p>
            <p>{t('games.cicd.intro.cd-p3')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>{t('games.cicd.intro.ci-p1')}</p>
            <p>
              {t('games.cicd.intro.ci-p2-before')} <strong>{t('games.cicd.intro.ci-p2-strong')}</strong>
              {t('games.cicd.intro.ci-p2-after')}
            </p>
          </div>
        )}

        <AxisFigure chapter={chapter} />

        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t('games.cicd.intro.keys-title')}
          </h3>
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {CICD_HOTKEYS.map((hotkey) => (
              <li key={hotkey.label} className="flex items-baseline gap-2 text-xs">
                <kbd className="border border-border px-1 font-mono text-muted-foreground">
                  {hotkey.label}
                </kbd>
                <span className="text-muted-foreground">{hotkey.describe}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t('games.cicd.intro.keys-note')}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onDismiss}>{t('games.cicd.intro.start')}</Button>
          <Button variant="ghost" onClick={onDismiss}>
            {t('games.cicd.intro.skip')}
          </Button>
          <p className="basis-full text-xs text-muted-foreground">{t('games.cicd.intro.reopen')}</p>
        </div>
      </div>
    </div>
  );
}
