'use client';

import { useCallback, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { CornerDownLeft, FileUp } from 'lucide-react';
import { Button, Input, Label, Textarea } from '@devops-platform/ui';

export interface CommandBarProps {
  readonly onSubmit: (command: string) => void;
  readonly disabled?: boolean;
}

/** Bao nhiêu lệnh gần nhất giữ lại cho mũi tên lên. */
const HISTORY_LIMIT = 50;

/**
 * Thanh lệnh `kubectl` — đường vạn năng của §4.4.
 *
 * Đây là hành động chơi được QUAN TRỌNG NHẤT: mọi thứ người chơi làm với một
 * cluster thật đều đi qua đây, và nó là một `<input>` có `<label>` thật, nên nó
 * đi được bằng bàn phím theo đúng định nghĩa. Các nút trong inspector là lối
 * tắt cho thao tác hay dùng, không phải lối duy nhất — và ngược lại, không thao
 * tác nào chỉ làm được bằng chuột trên canvas.
 *
 * Lịch sử theo mũi tên lên/xuống không phải trang trí: gõ lại một lệnh dài để
 * sửa một ký tự là thứ làm người ta bỏ bàn phím quay sang chuột.
 */
export function CommandBar({ onSubmit, disabled = false }: CommandBarProps): ReactElement {
  const inputId = useId();
  const [value, setValue] = useState('');
  const historyRef = useRef<string[]>([]);
  // `null` = đang ở dòng đang soạn, không ở trong lịch sử.
  const cursorRef = useRef<number | null>(null);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const command = value.trim();
      if (command === '' || disabled) {
        return;
      }
      historyRef.current = [command, ...historyRef.current].slice(0, HISTORY_LIMIT);
      cursorRef.current = null;
      setValue('');
      onSubmit(command);
    },
    [value, disabled, onSubmit],
  );

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    const history = historyRef.current;
    if (history.length === 0) {
      return;
    }
    event.preventDefault();
    const current = cursorRef.current;
    if (event.key === 'ArrowUp') {
      const next = current === null ? 0 : Math.min(current + 1, history.length - 1);
      cursorRef.current = next;
      setValue(history[next] ?? '');
      return;
    }
    if (current === null) {
      return;
    }
    if (current === 0) {
      cursorRef.current = null;
      setValue('');
      return;
    }
    const next = current - 1;
    cursorRef.current = next;
    setValue(history[next] ?? '');
  }, []);

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-border bg-card px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          Thanh lệnh kubectl
        </Label>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="font-mono text-sm text-muted-foreground">
            $
          </span>
          <Input
            id={inputId}
            value={value}
            disabled={disabled}
            onChange={(event) => {
              cursorRef.current = null;
              setValue(event.target.value);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
            placeholder="kubectl get pods"
            className="font-mono text-sm"
            /*
              Mô tả nằm ở `aria-describedby` chứ không nhồi vào `<label>`: nhãn
              được đọc lại mỗi lần focus quay về ô, còn mẹo dùng phím thì chỉ cần
              nghe một lần.
            */
            aria-describedby={`${inputId}-hint`}
          />
        </div>
        <p id={`${inputId}-hint`} className="text-[11px] text-muted-foreground">
          Enter để chạy. Mũi tên lên/xuống để lấy lại lệnh đã gõ.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={disabled || value.trim() === ''} className="mb-5">
        <CornerDownLeft aria-hidden="true" className="size-4" />
        Chạy
      </Button>
    </form>
  );
}

export interface ManifestEditorProps {
  readonly onApply: (yaml: string) => void;
  readonly disabled?: boolean;
}

/**
 * Ô soạn manifest cho hành động `apply`.
 *
 * Tách khỏi thanh lệnh vì `apply` là hành động DUY NHẤT không có tài nguyên đích
 * — danh tính nằm trong chính YAML (hợp đồng `GameAction`). Gộp nó vào ô một
 * dòng sẽ buộc người chơi viết YAML nhiều dòng trên một dòng, thứ không ai làm
 * với `kubectl` thật.
 *
 * ## Vì sao KHÔNG dùng `<details>`
 *
 * `<details>`/`<summary>` là lựa chọn đầu tiên và đã bị bỏ, vì hai lý do đo được
 * chứ không phải sở thích:
 *
 * 1. **Không kiểm được.** jsdom không hiện thực đầy đủ hành vi kích hoạt của
 *    `<summary>`, nên một test bàn phím cho ô này sẽ phải bấm chuột để mở — tức
 *    ô AC "chơi được chỉ bằng bàn phím" sẽ được chứng minh bằng một cú CLICK.
 *    Một phép đo tự mâu thuẫn thì thà không có.
 * 2. **`aria-expanded` là thứ ta muốn nói.** Nút + `aria-controls` nói thẳng
 *    trạng thái gập cho trình đọc màn hình, thay vì phụ thuộc vào mức hỗ trợ
 *    `<details>` vốn còn lệch giữa các bộ đọc.
 */
export function ManifestEditor({ onApply, disabled = false }: ManifestEditorProps): ReactElement {
  const areaId = useId();
  const panelId = `${areaId}-panel`;
  const [yaml, setYaml] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="w-full px-3 py-2 text-left text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Áp dụng manifest YAML
      </button>
      <div id={panelId} hidden={!open} className="flex flex-col gap-2 px-3 pb-3">
        <Label htmlFor={areaId} className="sr-only">
          Nội dung manifest YAML
        </Label>
        <Textarea
          id={areaId}
          value={yaml}
          disabled={disabled}
          onChange={(event) => setYaml(event.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'apiVersion: v1\nkind: Pod\nmetadata:\n  name: web'}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={disabled || yaml.trim() === ''}
          onClick={() => {
            onApply(yaml);
            setYaml('');
          }}
        >
          <FileUp aria-hidden="true" className="size-4" />
          Áp dụng
        </Button>
      </div>
    </div>
  );
}
