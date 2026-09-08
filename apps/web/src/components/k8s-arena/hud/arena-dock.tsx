'use client';

import type { ReactElement } from 'react';
import {
  Activity,
  BookOpen,
  Focus,
  LayoutGrid,
  List,
  Map,
  RotateCcw,
  Settings,
  Terminal,
} from 'lucide-react';
import { ARENA_KEYS, type CameraCommand, type OverlayId } from '../arena-contract';
import type { OverlayManager } from './overlay-manager';

const PANELS: readonly { id: OverlayId; label: string; icon: typeof Terminal; key: string }[] = [
  { id: 'terminal', label: 'Terminal', icon: Terminal, key: ARENA_KEYS.toggleTerminal },
  { id: 'metrics', label: 'Số liệu', icon: Activity, key: ARENA_KEYS.toggleMetrics.toUpperCase() },
  { id: 'eventLog', label: 'Sự kiện', icon: List, key: ARENA_KEYS.toggleEventLog.toUpperCase() },
  { id: 'minimap', label: 'Bản đồ', icon: Map, key: '' },
];

export interface ArenaDockProps {
  readonly overlays: OverlayManager;
  readonly onCamera: (kind: CameraCommand['kind']) => void;
  readonly codexAvailable: boolean;
  /** Có tài nguyên nào đang bị kéo lệch khỏi bố cục tự động không. */
  readonly canAutoAlign: boolean;
  readonly onAutoAlign: () => void;
}

/**
 * Thanh công cụ dưới — đường CHUỘT tới mọi thứ vốn chỉ có phím tắt.
 *
 * ⚠ Phím hiện trên `<kbd>` đọc thẳng `ARENA_KEYS`, không gõ tay. Bảng trợ giúp
 * nói một phím còn mã nghe một phím khác là lỗi kinh điển của mọi HUD có phím
 * tắt, và nó im lặng tuyệt đối.
 */
export function ArenaDock({
  overlays,
  onCamera,
  codexAvailable,
  canAutoAlign,
  onAutoAlign,
}: ArenaDockProps): ReactElement {
  return (
    <nav className="arena-dock" aria-label="Điều khiển đấu trường">
      <button
        type="button"
        onClick={() => onCamera('frame-all')}
        title={`Xem toàn cụm (${ARENA_KEYS.frameAll.toUpperCase()})`}
        aria-label="Xem toàn cụm"
      >
        <Focus />
        <span>Toàn cụm</span>
      </button>
      <button
        type="button"
        onClick={() => onCamera('reset')}
        title={`Đặt lại góc nhìn (${ARENA_KEYS.resetCamera.toUpperCase()})`}
        aria-label="Đặt lại góc nhìn"
      >
        <RotateCcw />
        <span>Góc nhìn</span>
      </button>
      <button
        type="button"
        onClick={onAutoAlign}
        disabled={!canAutoAlign}
        title={
          canAutoAlign
            ? `Trả mọi tài nguyên đã kéo về chỗ cũ (${ARENA_KEYS.autoAlign.toUpperCase()})`
            : 'Kéo một tài nguyên đi chỗ khác để bật nút này'
        }
        aria-label="Sắp xếp lại"
      >
        <LayoutGrid />
        <span>Sắp xếp</span>
      </button>
      <span className="arena-dock-divider" />
      {PANELS.map(({ id, label, icon: Icon, key }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={overlays.isOpen(id)}
          onClick={() => overlays.toggle(id)}
          title={`${label}${key === '' ? '' : ` (${key})`}`}
        >
          <Icon />
          <span>{label}</span>
          {key === '' ? null : <kbd>{key}</kbd>}
        </button>
      ))}
      {codexAvailable ? (
        <button
          type="button"
          aria-label="Trợ giúp"
          aria-pressed={overlays.isOpen('codex')}
          onClick={() => overlays.toggle('codex')}
          title={`Tra cứu bài học (${ARENA_KEYS.toggleCodex})`}
        >
          <BookOpen />
          <span>Trợ giúp</span>
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Cài đặt"
        aria-pressed={overlays.isOpen('settings')}
        onClick={() => overlays.toggle('settings')}
        title={`Cài đặt (${ARENA_KEYS.toggleSettings.toUpperCase()})`}
      >
        <Settings />
        <span>Cài đặt</span>
      </button>
    </nav>
  );
}
