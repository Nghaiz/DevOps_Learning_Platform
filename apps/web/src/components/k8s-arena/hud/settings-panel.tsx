'use client';

import type { ReactElement } from 'react';
import { Gauge, LayoutGrid, Pause, Play, Signpost, Spline, Tags, X } from 'lucide-react';
import { Switch } from '@devops-platform/ui';
import { ARENA_KEYS, type QualityTier } from '../arena-contract.ts';

/**
 * Nấc tốc độ mô phỏng.
 *
 * `0.25×` có mặt vì nó là thứ thanh trên cùng KHÔNG có: đọc một chuỗi sự kiện
 * đang chạy (rollout, backoff luỹ thừa) ở 1× vẫn quá nhanh để theo kịp, và tạm
 * dừng thì mất luôn phần chuyển động. Trần 8× là trần của chính
 * `K8sSession.setSpeed` — bày ra một nấc mà engine kẹp lại là bày ra một nút
 * nói dối.
 */
const SPEEDS: readonly number[] = [0.25, 0.5, 1, 2, 4, 8];

const TIERS: readonly {
  readonly id: QualityTier;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: 'low', label: 'Nhẹ', hint: 'Tắt bóng đổ và hậu kỳ. Dành cho máy yếu hoặc GPU phần mềm.' },
  { id: 'medium', label: 'Vừa', hint: 'Có bóng đổ, không hậu kỳ.' },
  { id: 'high', label: 'Cao', hint: 'Bóng mềm, hậu kỳ, phản chiếu môi trường.' },
];

export interface SettingsPanelProps {
  readonly open: boolean;
  /** Nhịp mô phỏng người dùng đã chọn. Giữ nguyên khi tạm dừng — xem `arena-session.ts`. */
  readonly speed: number;
  readonly paused: boolean;
  readonly onSpeed: (multiplier: number) => void;
  readonly onTogglePause: () => void;
  readonly quality: QualityTier;
  readonly onQuality: (tier: QualityTier) => void;
  readonly showLabels: boolean;
  readonly onShowLabels: (next: boolean) => void;
  readonly showEdges: boolean;
  readonly onShowEdges: (next: boolean) => void;
  /** Có vị trí nào đang bị kéo lệch khỏi bố cục tự động không. */
  readonly canAutoAlign: boolean;
  readonly onAutoAlign: () => void;
  readonly onClose: () => void;
}

/**
 * Bảng cài đặt của đấu trường.
 *
 * Sinh ra vì nút bánh răng trên thanh trên cùng trước đây mở NGĂN TRA CỨU: biểu
 * tượng nói "cài đặt", nhãn nói "trợ giúp bài học", và cú bấm mở một thứ thứ ba.
 * Chủ dự án báo thiếu *"tính năng settings, tăng tốc thời gian/pause"* — tốc độ
 * thì có sẵn trên thanh nhưng chỉ bốn nấc và không ai gọi nó là cài đặt.
 *
 * ⛔ Tạm dừng đi qua `onTogglePause`, KHÔNG qua `onSpeed(0)`. `setSpeed` kẹp sàn
 * ở 0.25 (chu kỳ hẹn giờ bằng 0 làm treo tab chứ không báo lỗi), nên `setSpeed(0)`
 * cho ra 0.25× — một nút "tạm dừng" bấm vào thì cụm vẫn chạy, chỉ chậm lại.
 */
export function SettingsPanel({
  open,
  speed,
  paused,
  onSpeed,
  onTogglePause,
  quality,
  onQuality,
  showLabels,
  onShowLabels,
  showEdges,
  onShowEdges,
  canAutoAlign,
  onAutoAlign,
  onClose,
}: SettingsPanelProps): ReactElement | null {
  if (!open) {
    return null;
  }

  return (
    <section aria-label="Cài đặt đấu trường" className="arena-settings pointer-events-auto">
      <header>
        <Gauge className="size-4 shrink-0" aria-hidden />
        <h2>Cài đặt</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng cài đặt"
          className="arena-settings-close"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="arena-settings-body">
        <section aria-label="Mô phỏng">
          <h3>Mô phỏng</h3>

          <button
            type="button"
            onClick={onTogglePause}
            aria-pressed={paused}
            className="arena-settings-wide"
          >
            {paused ? (
              <Play className="size-4" aria-hidden />
            ) : (
              <Pause className="size-4" aria-hidden />
            )}
            <span>{paused ? 'Chạy tiếp' : 'Tạm dừng'}</span>
            <kbd>Space</kbd>
          </button>

          <div className="arena-settings-row" role="group" aria-label="Tốc độ mô phỏng">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSpeed(value)}
                // Đang dừng thì KHÔNG nấc nào được coi là đang chọn: cụm không
                // chạy ở tốc độ nào cả, và tô sáng một nấc lúc đó là nói dối.
                aria-pressed={!paused && speed === value}
                aria-label={`Chạy ${value}×`}
              >
                {value}×
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Hiển thị">
          <h3>Hiển thị</h3>

          <div className="arena-settings-row" role="group" aria-label="Bậc chất lượng">
            {TIERS.map((tier) => (
              <button
                key={tier.id}
                type="button"
                title={tier.hint}
                onClick={() => onQuality(tier.id)}
                aria-pressed={quality === tier.id}
              >
                {tier.label}
              </button>
            ))}
          </div>

          <label className="arena-settings-toggle">
            <Tags className="size-4 shrink-0" aria-hidden />
            <span>Tên tài nguyên</span>
            <Switch
              checked={showLabels}
              onCheckedChange={onShowLabels}
              aria-label="Hiện tên tài nguyên"
            />
          </label>

          <label className="arena-settings-toggle">
            <Spline className="size-4 shrink-0" aria-hidden />
            <span>Dây quan hệ</span>
            <Switch
              checked={showEdges}
              onCheckedChange={onShowEdges}
              aria-label="Hiện dây quan hệ"
            />
          </label>
        </section>

        <section aria-label="Bố cục">
          <h3>Bố cục</h3>
          <button
            type="button"
            onClick={onAutoAlign}
            disabled={!canAutoAlign}
            className="arena-settings-wide"
          >
            <LayoutGrid className="size-4" aria-hidden />
            <span>Sắp xếp lại</span>
            <kbd>{ARENA_KEYS.autoAlign.toUpperCase()}</kbd>
          </button>
          <p className="arena-settings-note">
            <Signpost className="size-3.5 shrink-0" aria-hidden />
            <span>
              {canAutoAlign
                ? 'Trả mọi tài nguyên bạn đã kéo về đúng chỗ bố cục tự động tính.'
                : 'Kéo một tài nguyên đi chỗ khác để bật nút này.'}
            </span>
          </p>
        </section>
      </div>
    </section>
  );
}
