'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { BookOpen, Lightbulb, TriangleAlert } from 'lucide-react';
import type { Level, SessionPhase } from '@devops-platform/games';

/**
 * Tầng dạy học của một level (§`LevelTeaching` trong hợp đồng).
 *
 * Hợp đồng nói `teaching` là BẮT BUỘC với mọi level — "một level không có
 * `teaching` là một câu đố". Nếu giao diện không dựng chỗ cho nó thì lane C viết
 * primer, cheatsheet và takeaways cho 30 level mà không ai đọc được, và ràng
 * buộc "bắt buộc" kia chỉ còn hiệu lực trong TypeScript.
 *
 * ⚠ **Giới hạn đã biết: markdown chỉ hiện thực một phần.** `primer` được khai là
 * markdown, nhưng ở đây chỉ tách đoạn và dựng `<code>` cho đoạn trong dấu huyền.
 * Đậm/nghiêng/danh sách/liên kết sẽ hiện ra dạng ký tự thô.
 *
 * Đó là một lựa chọn, không phải một chỗ quên: bộ vẽ markdown thật của repo
 * (`MarkdownView`) KHÔNG được export khỏi barrel `@devops-platform/ui`, và
 * `ContentView` — thứ được export — nhận `ContentBlock[]` của
 * `@devops-platform/scenario`, tức kéo cả đường ống nội dung bài học vào một
 * route game vốn cố ý không gọi backend. Hai đường sửa đúng đều nằm ngoài lane
 * này: (a) lane A export `MarkdownView`, hoặc (b) hướng dẫn lane C giữ primer ở
 * dạng văn xuôi + dấu huyền. Đã báo lead.
 */

/** Tách văn bản theo dấu huyền, giữ nguyên thứ tự, để dựng `<code>` cho phần lệnh. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, index) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <code key={`${String(index)}-${part}`} className="rounded bg-muted px-1 font-mono text-[0.9em]">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

function Prose({ text }: { readonly text: string }): ReactElement {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== '');
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="text-sm text-muted-foreground">
          {renderInline(paragraph.trim())}
        </p>
      ))}
    </>
  );
}

export interface TeachingPanelProps {
  readonly level: Level | null;
  readonly phase: SessionPhase;
}

export function TeachingPanel({ level, phase }: TeachingPanelProps): ReactElement | null {
  const [showExtras, setShowExtras] = useState(false);

  if (level === null) {
    return null;
  }
  const { teaching } = level;
  const extras = [...(teaching.proTips ?? []), ...(teaching.pitfalls ?? [])];

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <Prose text={teaching.primer} />

      {teaching.cheatsheet.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <BookOpen aria-hidden="true" className="size-3.5" />
            Tra nhanh
          </h3>
          {/*
            `<dl>` chứ không phải hai cột trong một bảng: đây đúng là quan hệ
            thuật ngữ ↔ định nghĩa, và trình đọc màn hình ghép được cặp đó. Một
            `<table>` sẽ bắt người nghe điều hướng theo hàng/cột cho một thứ
            không phải dữ liệu bảng.
          */}
          <dl className="flex flex-col gap-1.5">
            {teaching.cheatsheet.map((entry) => (
              <div key={entry.command} className="flex flex-col gap-0.5">
                <dt>
                  <code className="rounded bg-muted px-1 font-mono text-xs text-foreground">{entry.command}</code>
                </dt>
                <dd className="text-xs text-muted-foreground">{entry.explain}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {/*
        Takeaways CHỈ hiện sau khi thắng. Hợp đồng gọi đây là khoảnh khắc kiến
        thức đóng lại; hiện sẵn từ đầu thì nó thành phần tóm tắt của lời giải, và
        level mất đúng cái nó định dạy.
      */}
      {phase === 'won' && teaching.takeaways.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-foreground">Rút ra được gì</h3>
          <ul role="list" aria-label="Điều rút ra sau level" className="flex flex-col gap-1">
            {teaching.takeaways.map((item) => (
              <li key={item} className="text-sm text-foreground">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {extras.length > 0 ? (
        <div className="border-t border-border pt-3">
          <button
            type="button"
            aria-expanded={showExtras}
            onClick={() => setShowExtras((value) => !value)}
            className="text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {showExtras ? 'Ẩn' : 'Xem'} mẹo thực chiến và sai lầm thường gặp
          </button>
          {showExtras ? (
            <ul role="list" className="mt-2 flex flex-col gap-1.5">
              {(teaching.proTips ?? []).map((tip) => (
                <li key={tip} className="flex gap-2 text-xs text-muted-foreground">
                  <Lightbulb aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-success" />
                  <span className="sr-only">Mẹo:</span>
                  <span>{renderInline(tip)}</span>
                </li>
              ))}
              {(teaching.pitfalls ?? []).map((pitfall) => (
                <li key={pitfall} className="flex gap-2 text-xs text-muted-foreground">
                  <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning" />
                  <span className="sr-only">Sai lầm thường gặp:</span>
                  <span>{renderInline(pitfall)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
