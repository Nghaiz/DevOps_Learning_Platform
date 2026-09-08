'use client';

import { useId, useState, type FormEvent, type ReactElement } from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@devops-platform/ui';
import type { PaletteEntry } from '../arena-contract.ts';
import { checkResourceName, suggestResourceName } from './palette-name.ts';
import { buildManifest } from './palette-manifest.ts';
import { paletteHint } from './palette-entries.ts';

export interface PaletteNameDialogProps {
  /** `null` = đóng. Mở bằng cách truyền ô người chơi vừa bấm. */
  readonly entry: PaletteEntry | null;
  /** Tên đang có CÙNG LOẠI trong cụm — dùng để đề xuất tên chưa trùng. */
  readonly takenNames: readonly string[];
  readonly onCancel: () => void;
  readonly onConfirm: (name: string) => void;
}

/**
 * Hộp đặt tên trước khi tạo tài nguyên.
 *
 * Ba điểm khác có chủ ý so với hộp thoại của k8sgames.com, và cả ba đều là phản
 * ứng với chỗ bản của họ làm người học mất thời gian:
 *
 * 1. **Kiểm tên ngay khi gõ.** Của họ nhận mọi chuỗi rồi để lệnh chết ở tầng
 *    dưới; người học đọc được "tạo thất bại" mà không biết luật nào bị vi phạm.
 * 2. **Hiện trước manifest sẽ được áp.** Bảng bên trái tồn tại để người mới
 *    không phải gõ YAML, nhưng "không phải gõ" khác "không được nhìn thấy" —
 *    thấy YAML là thứ biến một cú bấm thành một bài học đọc hiểu.
 * 3. **Enter là đủ.** Tên đã được điền sẵn hợp lệ, nên đường nhanh nhất từ ý
 *    định tới tài nguyên là bấm ô rồi bấm Enter.
 */
export function PaletteNameDialog({
  entry,
  takenNames,
  onCancel,
  onConfirm,
}: PaletteNameDialogProps): ReactElement | null {
  const inputId = useId();
  const errorId = useId();
  /*
   * Bản nháp mang theo LOẠI mà nó thuộc về, thay vì một `useEffect` điền lại ô
   * mỗi lần `entry` đổi.
   *
   * Hộp thoại này dùng lại cho cả 26 loại, nên "tên đang gõ" phải hết hiệu lực
   * ngay khi người chơi bấm sang ô khác — bấm Pod rồi bấm Service mà vẫn thấy
   * tên của Pod là một lỗi. Gắn loại vào chính bản nháp cho phép so sánh lúc
   * render; một `useEffect` thì phải liệt kê `takenNames` trong mảng phụ thuộc,
   * mà mảng đó đổi tham chiếu mỗi tick — tức ô nhập bị điền đè trong lúc người
   * chơi đang gõ.
   */
  const [draft, setDraft] = useState<{ readonly forKind: string; readonly name: string } | null>(null);

  if (entry === null) {
    return null;
  }

  const name = draft?.forKind === entry.kind ? draft.name : suggestResourceName(entry.short, takenNames);
  const setName = (next: string): void => setDraft({ forKind: entry.kind, name: next });
  const trimmed = name.trim();
  const check = checkResourceName(trimmed);
  // Ô còn trống là trạng thái BÌNH THƯỜNG lúc vừa mở — không bắn lỗi đỏ vào mặt
  // người chưa gõ chữ nào.
  const errorText = !check.ok && trimmed !== '' ? check.reason : null;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (check.ok) {
      onConfirm(trimmed);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Tạo {entry.full}</DialogTitle>
          <DialogDescription>{paletteHint(entry.kind)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>Tên tài nguyên</Label>
            <Input
              id={inputId}
              value={name}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              invalid={errorText !== null}
              aria-describedby={errorText === null ? undefined : errorId}
              onChange={(event) => setName(event.target.value)}
            />
            <p
              id={errorId}
              className={errorText === null ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}
              // `aria-live` để trình đọc màn hình đọc lỗi ngay khi gõ, thay vì
              // chỉ đọc lúc người dùng quay lại ô.
              aria-live="polite"
            >
              {errorText ?? 'Chữ thường, số và dấu gạch nối. Tối đa 63 ký tự.'}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Manifest sẽ được áp</span>
            <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
              {buildManifest(entry.kind, check.ok ? trimmed : entry.short.toLowerCase())}
            </pre>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Huỷ
            </Button>
            <Button type="submit" disabled={!check.ok}>
              Tạo {entry.short}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
