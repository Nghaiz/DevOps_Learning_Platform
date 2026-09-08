'use client';

import { useState, type ReactElement } from 'react';
import { BookOpen, Lightbulb, TriangleAlert } from 'lucide-react';
import type { LevelTeaching } from '@devops-platform/games';
import { MarkdownView } from '@devops-platform/ui';

/**
 * Tầng dạy học của một level, phần hiện TRƯỚC và TRONG khi chơi.
 *
 * `takeaways` KHÔNG ở đây — nó sống ở `WinOverlay` (§12.5 hàng cuối), vì hợp
 * đồng nói rõ nó chỉ xuất hiện sau khi thắng. Hiện sớm thì nó thành bản tóm tắt
 * lời giải và level mất đúng cái nó định dạy.
 *
 * `primer` vẽ bằng `MarkdownView` của hệ thiết kế. Bản trước tự cắt đoạn và tự
 * dựng `<code>` cho dấu huyền vì `MarkdownView` chưa được export khỏi barrel
 * `@devops-platform/ui`; lane A đã mở export 2026-09-08, nên bản tự chế đó bị
 * xoá — hai bộ vẽ markdown trong một repo là hai bộ sẽ trôi khỏi nhau.
 *
 * `resolveAssetUrl` luôn trả `null`: primer của game không có ảnh, và game chạy
 * với 0 lời gọi backend nên nó cũng không được phép có. `MarkdownView` tự vẽ
 * placeholder khi gặp ảnh, chứ không bịa URL hay bỏ qua trong im lặng.
 */
const NO_ASSETS = (): null => null;

export interface TeachingPanelProps {
  readonly teaching: LevelTeaching;
}

export function TeachingPanel({ teaching }: TeachingPanelProps): ReactElement {
  const [showExtras, setShowExtras] = useState(false);
  const hasExtras = (teaching.proTips ?? []).length > 0 || (teaching.pitfalls ?? []).length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted-foreground">
        <MarkdownView markdown={teaching.primer} resolveAssetUrl={NO_ASSETS} />
      </div>

      {teaching.cheatsheet.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
          <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <BookOpen aria-hidden="true" className="size-3.5" />
            Tra nhanh
          </h4>
          {/*
            `<dl>` chứ không phải bảng: đây đúng là quan hệ thuật ngữ ↔ định
            nghĩa và trình đọc màn hình ghép được cặp đó. `<table>` sẽ bắt người
            nghe điều hướng theo hàng/cột cho một thứ không phải dữ liệu bảng.
          */}
          <dl className="flex flex-col gap-1.5">
            {teaching.cheatsheet.map((entry) => (
              <div key={entry.command} className="flex flex-col gap-0.5">
                <dt>
                  <code className="rounded bg-muted px-1 font-mono text-[11px] text-foreground">{entry.command}</code>
                </dt>
                <dd className="text-[11px] text-muted-foreground">{entry.explain}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {hasExtras ? (
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            aria-expanded={showExtras}
            onClick={() => setShowExtras((value) => !value)}
            className="text-[11px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {showExtras ? 'Ẩn' : 'Xem'} mẹo thực chiến và sai lầm thường gặp
          </button>
          {showExtras ? (
            <ul role="list" className="mt-2 flex flex-col gap-1.5">
              {(teaching.proTips ?? []).map((tip) => (
                <li key={tip} className="flex gap-2 text-[11px] text-muted-foreground">
                  <Lightbulb aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <span className="sr-only">Mẹo:</span>
                  <span>{tip}</span>
                </li>
              ))}
              {(teaching.pitfalls ?? []).map((pitfall) => (
                <li key={pitfall} className="flex gap-2 text-[11px] text-muted-foreground">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span className="sr-only">Sai lầm thường gặp:</span>
                  <span>{pitfall}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
