'use client';

import { useState, type ReactElement } from 'react';
import { CornerDownLeft, X } from 'lucide-react';
import { MarkdownView, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@devops-platform/ui';
import type { CheatSheetEntry, LevelTeaching } from '@devops-platform/games';

export interface CodexDrawerProps {
  readonly open: boolean;
  readonly teaching: LevelTeaching;
  /**
   * `true` chỉ khi đã thắng (`SessionStatus.phase === 'won'`).
   *
   * `takeaways` theo hợp đồng là thứ hiện SAU khi thắng — nó đúc kết bài học, và
   * đúc kết trước khi người chơi tự làm ra kết quả là lộ đáp án. Ngăn tra cứu mở
   * được bất cứ lúc nào, nên nó phải tự biết giấu phần này.
   */
  readonly showTakeaways: boolean;
  readonly onClose: () => void;
  /** Chèn lệnh mẫu vào terminal. Bên gọi chịu trách nhiệm mở terminal nếu đang đóng. */
  readonly onInsertCommand: (command: string) => void;
}

/**
 * Ngăn tra cứu — nơi chứa kiến thức nền đã bị đuổi khỏi thẻ nhiệm vụ.
 *
 * Đây là nửa còn lại của quyết định "mô tả level rút về một dòng": chữ không bị
 * xoá, nó bị DỜI CHỖ. Người chơi chưa cần thì không thấy; cần thì bấm `?` và nó
 * trượt vào, đầy đủ, không phải một tóm tắt cụt.
 *
 * ⚠ Lớp này nhận tương tác nên nó `pointer-events-auto`; phần còn lại của HUD
 * để canvas nhận chuột. Lúc đóng thì `inert` — không chỉ dịch ra khỏi màn: một
 * ngăn nằm ngoài khung nhìn mà vẫn Tab vào được là một chuỗi điểm dừng vô hình,
 * đúng loại lỗi bàn phím repo đã đo được ở `/me` (2026-09-07).
 */
export function CodexDrawer({
  open,
  teaching,
  showTakeaways,
  onClose,
  onInsertCommand,
}: CodexDrawerProps): ReactElement {
  const [tab, setTab] = useState('khai-niem');
  const pitfalls = teaching.pitfalls ?? [];
  const proTips = teaching.proTips ?? [];

  return (
    <aside
      aria-label="Ngăn tra cứu"
      inert={!open}
      className={cn(
        'absolute top-0 right-0 bottom-0 z-30 flex w-96 max-w-full flex-col',
        'border-l border-border bg-card/95 shadow-elevation-3 backdrop-blur-sm',
        'transition-transform duration-(--motion-base) ease-out',
        open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full',
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">Tra cứu</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng ngăn tra cứu"
          className="ml-auto rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid grid-cols-3">
          <TabsTrigger value="khai-niem">Khái niệm</TabsTrigger>
          <TabsTrigger value="lenh-mau">Lệnh mẫu</TabsTrigger>
          <TabsTrigger value="bay">Bẫy</TabsTrigger>
        </TabsList>

        <TabsContent value="khai-niem" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {/* Không có ảnh trong primer của level — trả `null` để component tự vẽ placeholder thay vì chế một URL. */}
          <MarkdownView markdown={teaching.primer} resolveAssetUrl={() => null} />
          {showTakeaways && teaching.takeaways.length > 0 ? (
            <section className="mt-4 rounded-md border border-status-done/40 bg-muted p-3">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Đúc kết
              </h3>
              <ul className="flex flex-col gap-1.5">
                {teaching.takeaways.map((item) => (
                  <li key={item} className="text-sm leading-snug text-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="lenh-mau" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <ul className="flex flex-col gap-2">
            {teaching.cheatsheet.map((item) => (
              <CheatRow key={item.command} item={item} onInsert={onInsertCommand} />
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="bay" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <NoteList title="Sai lầm phổ biến" items={pitfalls} tone="warning" />
          <NoteList title="Mẹo thực chiến" items={proTips} tone="muted" />
          {pitfalls.length === 0 && proTips.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Bài này chưa ghi bẫy nào.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

/**
 * Một dòng tra nhanh: lệnh bấm được, giải thích ở dưới.
 *
 * Bấm là CHÈN chứ không phải CHẠY — người chơi thấy lệnh nằm trong terminal,
 * đọc lại, sửa nếu cần, rồi mới Enter. Chạy thẳng biến bảng tra cứu thành một
 * dãy nút phép thuật, và người học không nhớ được lệnh mình chưa từng gõ.
 */
function CheatRow({
  item,
  onInsert,
}: {
  readonly item: CheatSheetEntry;
  readonly onInsert: (command: string) => void;
}): ReactElement {
  return (
    <li>
      <button
        type="button"
        onClick={() => onInsert(item.command)}
        title="Chèn vào terminal"
        className={cn(
          'group flex w-full items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5',
          'text-left font-mono text-xs text-foreground outline-none transition-colors',
          'hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{item.command}</span>
        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <p className="mt-1 px-1 text-xs leading-snug text-muted-foreground">{item.explain}</p>
    </li>
  );
}

function NoteList({
  title,
  items,
  tone,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly tone: 'warning' | 'muted';
}): ReactElement | null {
  if (items.length === 0) {
    return null;
  }
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              'rounded-md border-l-2 py-1 pl-2 text-sm leading-snug text-foreground',
              tone === 'warning' ? 'border-warning bg-warning/10' : 'border-border bg-muted',
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
