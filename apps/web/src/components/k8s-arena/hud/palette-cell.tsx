'use client';

import type { ReactElement } from 'react';
import { Boxes, Database, Network, Server, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@devops-platform/ui';
import { KIND_ACCENT, type PaletteEntry, type PaletteGroup } from '../arena-contract.ts';
import { paletteHint } from './palette-entries.ts';

/**
 * Icon theo NHÓM chứ không theo từng loại.
 *
 * 26 icon riêng nghe hợp lý cho tới lúc vẽ thật: ở bề rộng một ô chỉ còn chỗ cho
 * một hình 14px, và 26 hình 14px khác nhau thì không hình nào đọc được. Việc
 * phân biệt từng loại nay do MÀU đảm nhận (`KIND_ACCENT`), còn icon nói nhóm và
 * nhãn chữ nói tên.
 */
const GROUP_ICON: Readonly<Record<PaletteGroup, typeof Boxes>> = {
  workload: Boxes,
  network: Network,
  config: Settings,
  storage: Database,
  cluster: Server,
};

/**
 * Tên token màu → lớp Tailwind THẬT.
 *
 * ⛔ Bảng này bắt buộc phải có, không thể viết `bg-${accent}`: Tailwind quét mã
 * nguồn tìm chuỗi lớp NGUYÊN VẸN, nên một lớp ghép lúc chạy KHÔNG BAO GIỜ được
 * biên dịch vào CSS. Hỏng đó im lặng tuyệt đối — không lỗi build, không lỗi
 * runtime, chỉ là ô không có màu. Đúng hình dạng lỗi mà chú thích `@source` ở
 * đầu `globals.css` ghi lại.
 *
 * Không có cổng gác đủ-8-token ở đây vì hợp đồng khai `KIND_ACCENT` là
 * `Record<ResourceKind, string>` — giá trị là `string` rộng, nên `satisfies`
 * không bắt được thiếu sót. Thiếu một token thì rơi về `FALLBACK_ACCENT`: ô vẫn
 * đọc được, chỉ mất màu. Đã báo lead.
 */
const ACCENT_CLASS: Readonly<Record<string, { readonly icon: string; readonly tint: string }>> = {
  'kind-pod': { icon: 'text-kind-pod', tint: 'bg-kind-pod/10 hover:border-kind-pod/50 hover:bg-kind-pod/20' },
  'kind-controller': { icon: 'text-kind-controller', tint: 'bg-kind-controller/10 hover:border-kind-controller/50 hover:bg-kind-controller/20' },
  'kind-batch': { icon: 'text-kind-batch', tint: 'bg-kind-batch/10 hover:border-kind-batch/50 hover:bg-kind-batch/20' },
  'kind-network': { icon: 'text-kind-network', tint: 'bg-kind-network/10 hover:border-kind-network/50 hover:bg-kind-network/20' },
  'kind-config': { icon: 'text-kind-config', tint: 'bg-kind-config/10 hover:border-kind-config/50 hover:bg-kind-config/20' },
  'kind-storage': { icon: 'text-kind-storage', tint: 'bg-kind-storage/10 hover:border-kind-storage/50 hover:bg-kind-storage/20' },
  'kind-security': { icon: 'text-kind-security', tint: 'bg-kind-security/10 hover:border-kind-security/50 hover:bg-kind-security/20' },
  'kind-cluster': { icon: 'text-kind-cluster', tint: 'bg-kind-cluster/10 hover:border-kind-cluster/50 hover:bg-kind-cluster/20' },
};

const FALLBACK_ACCENT = { icon: 'text-foreground', tint: 'hover:bg-accent' } as const;

export interface PaletteCellProps {
  readonly entry: PaletteEntry;
  /** `false` = level không cho dùng loại này (`Level.allowedResources`). */
  readonly enabled: boolean;
  readonly onPick: () => void;
}

/** Một ô trong bảng tạo tài nguyên. */
export function PaletteCell({ entry, enabled, onPick }: PaletteCellProps): ReactElement {
  const Icon = GROUP_ICON[entry.group];
  const accent = ACCENT_CLASS[KIND_ACCENT[entry.kind]] ?? FALLBACK_ACCENT;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          `aria-disabled` chứ KHÔNG phải thuộc tính `disabled`: một `<button
          disabled>` không phát pointerenter trên phần lớn trình duyệt và cũng
          rời khỏi thứ tự Tab — tức tooltip giải thích *vì sao* ô này bị chặn sẽ
          không bao giờ hiện ra, đúng lúc nó cần nhất. Chặn hành động làm bằng
          guard ở `onClick`.

          Ô bị chặn KHÔNG dùng `opacity` trên cả nút: làm mờ toàn khối kéo luôn
          chữ xuống dưới ngưỡng đọc được (phản hồi của chủ dự án 2026-09-08 —
          *"chữ mờ tới mức gần như không thấy"*). Thay vào đó chỉ ICON nhạt đi,
          còn nhãn giữ `text-muted-foreground` — token này đã được đo đạt 4.5:1
          trên nền `--card`.
        */}
        <button
          type="button"
          aria-disabled={!enabled}
          onClick={enabled ? onPick : undefined}
          className={cn(
            'relative flex w-full flex-col items-center gap-0 rounded-md border px-0.5 py-1',
            'text-[9px] leading-tight font-medium transition-colors outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            enabled
              ? cn('border-transparent text-foreground', accent.tint)
              : 'cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground',
          )}
        >
          {/*
            Màu vai trò áp cho CẢ ô bị chặn, chỉ nhạt bớt — không đổi sang xám.
            Đo trên bản chạy thật (2026-09-08, level 1): `allowedResources` của
            level 1 chỉ có `Pod`, nên 25/26 ô ở trạng thái chặn; bản trước bỏ màu
            ở nhánh chặn và kết quả đúng bằng thứ chủ dự án chê — *"không hề có
            màu sắc cho từng cái mà tất cả màu giống nhau"*. Đo được
            `distinctColors: 2` trên tám nhóm vai trò.

            Nói cách khác: màu ở đây trả lời "đây là loại gì", còn độ nhạt trả
            lời "bài này có dùng được không". Trộn hai câu vào một kênh làm mất
            câu thứ nhất đúng ở màn đầu tiên người học nhìn thấy.
          */}
          <Icon className={cn('size-3.5', accent.icon, enabled ? null : 'opacity-55')} aria-hidden />
          <span className="w-full truncate text-center">{entry.short}</span>
          {entry.hotkey === null ? null : (
            <span
              aria-hidden
              className="absolute top-0 right-0.5 font-mono text-[8px] leading-none text-muted-foreground"
            >
              {entry.hotkey}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        <span className="font-semibold">{entry.full}</span>
        {entry.hotkey === null ? null : <span className="ml-1 opacity-70">· phím {entry.hotkey}</span>}
        <p className="mt-1 opacity-90">{paletteHint(entry.kind)}</p>
        {enabled ? null : <p className="mt-1 opacity-90">Bài này chưa mở loại tài nguyên này.</p>}
      </TooltipContent>
    </Tooltip>
  );
}
