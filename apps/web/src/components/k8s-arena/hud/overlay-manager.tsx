'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ARENA_KEYS, DEFAULT_OVERLAYS, type OverlayId } from '../arena-contract.ts';
import { isDialogOpen, isTypingTarget } from './overlay-manager-keys.ts';

/**
 * Lớp nào Esc đóng được.
 *
 * `palette` / `mission` / `minimap` cố ý VẮNG MẶT: chúng là lớp thường trực của
 * mặt chơi, bật tắt bằng nút chứ không phải bằng phím thoát. Nếu Esc gỡ được cả
 * chúng thì một người bấm Esc mấy lần cho chắc sẽ tự làm trống màn hình của mình
 * rồi không biết đường lấy lại — và bảng tạo tài nguyên là thứ họ cần nhất.
 */
const ESC_DISMISSES: readonly OverlayId[] = [
  'terminal',
  'codex',
  'metrics',
  'incidents',
  'eventLog',
  'settings',
];

/** Phím → lớp. Đọc thẳng `ARENA_KEYS` nên bảng trợ giúp và mã không bao giờ nói hai phím khác nhau. */
const KEY_TO_OVERLAY: Readonly<Record<string, OverlayId>> = {
  [ARENA_KEYS.toggleTerminal]: 'terminal',
  [ARENA_KEYS.toggleMetrics]: 'metrics',
  [ARENA_KEYS.toggleIncidents]: 'incidents',
  [ARENA_KEYS.toggleCodex]: 'codex',
  [ARENA_KEYS.toggleEventLog]: 'eventLog',
  [ARENA_KEYS.toggleSettings]: 'settings',
};

export interface OverlayManagerOptions {
  /** `false` = ngừng nghe phím (ví dụ lúc hiện màn hình kết thúc bài). */
  readonly enabled?: boolean;
  /**
   * `ArenaModeContext.codexAvailable`. `false` ⇒ phím `?` KHÔNG làm gì.
   *
   * Đọc từ ngữ cảnh chế độ chứ không suy ra: hợp đồng nói thẳng rằng một
   * component thấy `problemCode == null` rồi tự kết luận đang ở chế độ level sẽ
   * hiểu sai ngay khi bài đang tải.
   */
  readonly codexAvailable?: boolean;
  readonly onCamera?: (kind: 'reset' | 'frame-all') => void;
  readonly onPauseResume?: () => void;
  /** Trả mọi tài nguyên đã kéo về chỗ bố cục tự động tính. */
  readonly onAutoAlign?: () => void;
  readonly onCommandPalette?: () => void;
}

export interface OverlayManager {
  readonly isOpen: (id: OverlayId) => boolean;
  readonly toggle: (id: OverlayId) => void;
  readonly show: (id: OverlayId) => void;
  readonly hide: (id: OverlayId) => void;
  /** Đóng lớp mở gần nhất trong số lớp Esc đóng được. Không có lớp nào thì không làm gì. */
  readonly closeTopmost: () => void;
}

/**
 * Quản lý lớp nổi và phím tắt của đấu trường.
 *
 * ## Vì sao trạng thái là một NGĂN XẾP chứ không phải `Record<OverlayId, boolean>`
 *
 * "Esc đóng lớp trên cùng" đòi biết THỨ TỰ mở, mà một bảng cờ bật/tắt không mang
 * thứ tự. Giữ cả hai — bảng cờ cộng một ngăn xếp — là lưu một thứ suy ra được từ
 * thứ kia (`open(id) === stack.includes(id)`), đúng cái quy ước của repo cấm, và
 * nó sẽ lệch ở đường nào đó quên đẩy/rút. Nên chỉ có ngăn xếp; "đang mở" là một
 * phép hỏi, không phải một ô nhớ.
 */
export function useOverlayManager(options: OverlayManagerOptions = {}): OverlayManager {
  const { enabled = true, codexAvailable = true } = options;
  const [stack, setStack] = useState<readonly OverlayId[]>(initialStack);

  /*
   * Callback đi qua ref chứ không qua mảng phụ thuộc: bên gọi hầu như luôn viết
   * hàm inline, nên để chúng trong mảng phụ thuộc là gỡ và gắn lại bộ nghe phím
   * ở MỌI lần render — và một phím bấm rơi đúng khe giữa hai lần đó sẽ mất.
   */
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const show = useCallback((id: OverlayId): void => {
    setStack((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const hide = useCallback((id: OverlayId): void => {
    setStack((current) => current.filter((item) => item !== id));
  }, []);

  const toggle = useCallback((id: OverlayId): void => {
    setStack((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const closeTopmost = useCallback((): void => {
    setStack((current) => {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        const candidate = current[index];
        if (candidate !== undefined && ESC_DISMISSES.includes(candidate)) {
          return current.filter((item) => item !== candidate);
        }
      }
      return current;
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      // Đang gõ, hoặc hộp thoại đang mở → hai nơi đó tự lo phím của mình. Terminal
      // chặn lan Escape ở chính ô nhập, hộp thoại Radix chặn ở lớp của nó.
      if (isTypingTarget(event.target) || isDialogOpen()) {
        return;
      }
      if (event.key === ARENA_KEYS.closeTopmost) {
        closeTopmost();
        return;
      }
      /*
       * Dấu cách và Enter thuộc về phần tử đang có focus khi đó là một nút — bấm
       * "Tra cứu" rồi bấm dấu cách phải bấm lại nút đó, không phải tạm dừng mô
       * phỏng. Đây là chỗ phím tắt toàn cục hay giẫm lên bàn phím nhất.
       */
      const onControl =
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, [role="button"], summary') !== null;
      if (event.key === ARENA_KEYS.pauseResume) {
        if (onControl) {
          return;
        }
        // Chặn mặc định: dấu cách cuộn trang, và cảnh 3D nhảy một nấc là lỗi thấy được.
        event.preventDefault();
        optionsRef.current.onPauseResume?.();
        return;
      }
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === ARENA_KEYS.resetCamera) {
        optionsRef.current.onCamera?.('reset');
        return;
      }
      if (key === ARENA_KEYS.frameAll) {
        optionsRef.current.onCamera?.('frame-all');
        return;
      }
      if (key === ARENA_KEYS.autoAlign) {
        optionsRef.current.onAutoAlign?.();
        return;
      }
      if (key === ARENA_KEYS.commandPalette) {
        event.preventDefault();
        optionsRef.current.onCommandPalette?.();
        return;
      }
      const overlay = KEY_TO_OVERLAY[key];
      // Ngăn tra cứu không tồn tại ở chế độ `problem` — phím mở nó phải im lặng,
      // không phải bật một lớp rỗng.
      if (overlay === 'codex' && !codexAvailable) {
        return;
      }
      if (overlay !== undefined) {
        event.preventDefault();
        toggle(overlay);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, codexAvailable, closeTopmost, toggle]);

  const openSet = useMemo(() => new Set(stack), [stack]);
  const isOpen = useCallback((id: OverlayId): boolean => openSet.has(id), [openSet]);

  return useMemo(
    () => ({ isOpen, toggle, show, hide, closeTopmost }),
    [isOpen, toggle, show, hide, closeTopmost],
  );
}

/** Lớp bật sẵn, theo đúng thứ tự khai báo trong `DEFAULT_OVERLAYS`. */
function initialStack(): readonly OverlayId[] {
  return (Object.entries(DEFAULT_OVERLAYS) as [OverlayId, boolean][])
    .filter(([, open]) => open)
    .map(([id]) => id);
}
