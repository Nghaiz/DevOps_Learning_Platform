'use client';

import type { ReactElement, ReactNode } from 'react';
import type { NodeView, ObjectView } from '@devops-platform/games';
import { Badge, type BadgeVariant } from '@devops-platform/ui';
import type { ObjectDetail, ResourceAmount } from './inspector-types.ts';

/**
 * Token màu ngữ nghĩa của engine → biến thể `Badge`.
 *
 * `Readonly<Record<…>>` chứ không phải một hàm `switch`: kiểu ép trình biên dịch
 * bắt lỗi nếu engine thêm một token mới, thay vì để nhánh `default` âm thầm tô
 * xám một trạng thái chưa ai xử lý.
 */
const STATUS_BADGE: Readonly<Record<ObjectView['statusToken'], BadgeVariant>> = {
  success: 'success',
  destructive: 'destructive',
  warning: 'warning',
  'status-progress': 'status-progress',
  'status-locked': 'status-locked',
};

export interface InspectorOverviewProps {
  readonly object: ObjectView;
  readonly detail: ObjectDetail | null;
  /** Node đang chạy object này; `null` khi chưa xếp lịch hoặc không tra được. */
  readonly node: NodeView | null;
  /** Tick hiện tại của cụm — dùng để TÍNH tuổi, không lưu tuổi ở đâu cả. */
  readonly tick: number;
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

/** `250m / 128Mi`, bỏ vế không khai. `null` khi không khai vế nào. */
function amountText(amount: ResourceAmount | null): string | null {
  if (amount === null) {
    return null;
  }
  const parts = [amount.cpu, amount.memory].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' / ');
}

function percent(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

/**
 * Tab Tổng quan.
 *
 * Dòng nào không có dữ liệu thì KHÔNG hiện, không in `—`. Lý do nằm ở
 * `inspector-types.ts`: một dấu gạch đọc ra là "đã kiểm, không có", còn vắng
 * mặt đọc ra là "chưa biết". Người học đang chẩn đoán một pod hỏng cần phân biệt
 * đúng hai chuyện đó — "không khai limit" và "chưa đọc được limit" dẫn tới hai
 * bước tiếp theo khác nhau.
 */
export function InspectorOverview({ object, detail, node, tick }: InspectorOverviewProps): ReactElement {
  const labels = detail === null ? [] : Object.entries(detail.labels);
  const requests = amountText(detail?.requests ?? null);
  const limits = amountText(detail?.limits ?? null);
  const createdTick = detail?.createdTick ?? null;

  return (
    <dl className="divide-y divide-border">
      <Row label="Trạng thái">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={STATUS_BADGE[object.statusToken]}>{object.phase ?? object.kind}</Badge>
          {object.ready === true ? <Badge variant="outline">Ready</Badge> : null}
          {object.ready === false ? <Badge variant="outline">Chưa Ready</Badge> : null}
        </span>
      </Row>

      {object.reason === undefined ? null : (
        <Row label="Lý do">
          {/* Reason giữ TIẾNG ANH — đó là chuỗi thật của API, người học sẽ gặp
              lại đúng nó trên cụm thật (`model.ts` ghi rõ lý do). */}
          <span className="font-mono">{object.reason}</span>
        </Row>
      )}

      <Row label="Namespace">
        <span className="font-mono">{object.namespace === '' ? 'phạm vi cụm' : object.namespace}</span>
      </Row>

      <Row label="Node">
        {object.nodeName === null ? (
          <span className="text-muted-foreground">chưa được xếp lịch</span>
        ) : (
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono">{object.nodeName}</span>
            {node === null ? null : (
              <span className="text-muted-foreground">
                CPU {percent(node.cpuUsed)} · RAM {percent(node.memoryUsed)}
                {node.ready ? '' : ' · NotReady'}
              </span>
            )}
          </span>
        )}
      </Row>

      {object.restartCount === undefined ? null : (
        <Row label="Khởi động lại">
          <span className="font-mono">{object.restartCount}</span>
          {object.restartCount > 0 ? (
            <span className="ml-2 text-warning">container đã chết và được dựng lại</span>
          ) : null}
        </Row>
      )}

      {requests === null ? null : (
        <Row label="Yêu cầu">
          <span className="font-mono">{requests}</span>
        </Row>
      )}
      {limits === null ? null : (
        <Row label="Giới hạn">
          <span className="font-mono">{limits}</span>
        </Row>
      )}

      {createdTick === null ? null : (
        <Row label="Tạo lúc">
          {/* Tuổi TÍNH tại đây từ `tick - createdTick`, không lưu ở đâu — đúng
              luật "không lưu trường suy ra được" (README §5). */}
          <span className="font-mono">t{createdTick}</span>
          <span className="ml-2 text-muted-foreground">{Math.max(0, tick - createdTick)} tick trước</span>
        </Row>
      )}

      {labels.length === 0 ? null : (
        <Row label="Nhãn">
          <span className="flex flex-wrap gap-1">
            {labels.map(([key, value]) => (
              <Badge key={key} variant="secondary" className="font-mono text-[11px]">
                {key}={value}
              </Badge>
            ))}
          </span>
        </Row>
      )}
    </dl>
  );
}
