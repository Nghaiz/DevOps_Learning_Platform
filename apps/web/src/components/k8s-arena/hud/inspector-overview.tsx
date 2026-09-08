'use client';

import type { ReactElement, ReactNode } from 'react';
import type { NodeView, ObjectView } from '@devops-platform/games';
import { Badge, cn, type BadgeVariant } from '@devops-platform/ui';
import { containersOf, replicasOf } from '../shared/spec-summary';

/**
 * Cặp cpu/memory. Bóc từ `ObjectView` chứ không khai lại: barrel chưa mở
 * `ResourceAmountView`, mà một bản sao thủ công sẽ lặng lẽ lệch nếu engine đổi.
 */
type ResourceAmount = NonNullable<ObjectView['requests']>;

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

/** Vạch màu bên trái khối trạng thái, theo cùng token. */
const STATUS_ACCENT: Readonly<Record<ObjectView['statusToken'], string>> = {
  success: 'bg-success',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  'status-progress': 'bg-status-progress',
  'status-locked': 'bg-muted-foreground',
};

const STATUS_GLOW: Readonly<Record<ObjectView['statusToken'], string>> = {
  success: 'bg-success/8',
  destructive: 'bg-destructive/10',
  warning: 'bg-warning/10',
  'status-progress': 'bg-status-progress/8',
  'status-locked': 'bg-muted/40',
};

export interface InspectorOverviewProps {
  readonly object: ObjectView;
  /** Node đang chạy object này; `null` khi chưa xếp lịch hoặc không tra được. */
  readonly node: NodeView | null;
  /** Tick hiện tại của cụm — dùng để TÍNH tuổi, không lưu tuổi ở đâu cả. */
  readonly tick: number;
  /**
   * Manifest của chính object này.
   *
   * Chỉ để ĐỌC vài chi tiết `spec` mà `ObjectView` cố ý không mang (container,
   * image, cổng, số replica). Xem `shared/spec-summary.ts`.
   */
  readonly manifestYaml?: string | null;
}

/**
 * Tiêu đề một khối.
 *
 * Bản trước không có khối nào — cả tab là MỘT `<dl>` dài mười mấy dòng cùng cỡ
 * chữ, cùng màu, không có chỗ nào cho mắt bám. Người chơi đang chẩn đoán một pod
 * phải đọc tuần tự từ trên xuống để tìm một dòng. Chia khối là thứ duy nhất làm
 * nó quét được.
 */
function Section({
  title,
  children,
  action,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <section className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-baseline gap-2 py-0.5 text-xs">
      <dt className="truncate text-muted-foreground">{label}</dt>
      {/* `wrap-break-word` để một giá trị dài (image kèm registry đầy đủ) xuống
          dòng thay vì đẩy bảng rộng ra và đẻ thanh cuộn ngang. */}
      <dd className="min-w-0 wrap-break-word text-foreground">{children}</dd>
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
 * Thanh mức dùng của node.
 *
 * Một con số phần trăm nói "62%"; một thanh nói "còn hơn một phần ba" mà không
 * cần đọc. Ở một bài mà cả nhiệm vụ là "node hết chỗ", khác biệt đó đáng giá.
 */
function Meter({ label, value }: { readonly label: string; readonly value: number }): ReactElement {
  const clamped = Math.min(1, Math.max(0, value));
  const tone =
    clamped >= 0.88 ? 'bg-destructive' : clamped >= 0.7 ? 'bg-warning' : 'bg-status-progress';
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full transition-[width] duration-500', tone)}
          style={{ width: `${clamped * 100}%` }}
        />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-foreground">
        {percent(clamped)}
      </span>
    </div>
  );
}

/**
 * Tab Tổng quan.
 *
 * Đọc thẳng `ObjectView` — không còn prop `detail` nào. Nhãn, requests/limits và
 * `createdTick` đã ra tới hợp đồng engine, nên lớp props tạm ở giữa bị gỡ.
 *
 * Dòng nào không có dữ liệu thì KHÔNG hiện, không in `—`. Đây là quy ước mà
 * chính hợp đồng cũng ghi (`ObjectView.requests`): một dấu gạch đọc ra là "đã
 * kiểm, không có", còn vắng mặt đọc ra là "chưa biết". Người học đang chẩn đoán
 * một pod OOMKilled cần đúng sự phân biệt đó.
 */
export function InspectorOverview({
  object,
  node,
  tick,
  manifestYaml = null,
}: InspectorOverviewProps): ReactElement {
  const labels = Object.entries(object.labels);
  const requests = amountText(object.requests);
  const limits = amountText(object.limits);
  const containers = containersOf(manifestYaml);
  const replicas = replicasOf(manifestYaml);
  const age = Math.max(0, tick - object.createdTick);

  const phaseText =
    object.phase ??
    (object.kind === 'Node'
      ? node?.ready
        ? 'Ready'
        : 'NotReady'
      : object.statusToken === 'success'
        ? 'Sẵn sàng'
        : object.statusToken === 'warning'
          ? 'Cần kiểm tra'
          : 'Đang xử lý');

  return (
    <div className="divide-y divide-border">
      {/*
       * Khối TRẠNG THÁI đứng riêng, có nền và vạch màu.
       *
       * Trạng thái là câu hỏi đầu tiên người chơi mở bảng này để hỏi, nên nó
       * không được nằm chung một `<dl>` với UID và ngày tạo. Bản trước để nó là
       * dòng đầu của một danh sách phẳng, cùng cỡ chữ với mọi dòng khác.
       */}
      <div className={cn('flex items-stretch gap-3 px-3 py-3', STATUS_GLOW[object.statusToken])}>
        <span
          aria-hidden
          className={cn('w-1 shrink-0 rounded-full', STATUS_ACCENT[object.statusToken])}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS_BADGE[object.statusToken]}>{phaseText}</Badge>
            {object.ready === true ? <Badge variant="outline">Ready</Badge> : null}
            {object.ready === false ? <Badge variant="outline">Chưa Ready</Badge> : null}
            {object.restartCount !== undefined && object.restartCount > 0 ? (
              <Badge variant="warning">{object.restartCount} lần restart</Badge>
            ) : null}
          </div>
          {object.reason === undefined ? null : (
            /* Reason giữ TIẾNG ANH — đó là chuỗi thật của API, người học sẽ gặp
               lại đúng nó trên cụm thật (`model.ts` ghi rõ lý do). */
            <p className="mt-1.5 font-mono text-xs text-foreground">{object.reason}</p>
          )}
          {object.restartCount !== undefined && object.restartCount > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Container đã chết và được dựng lại. Xem log để biết vì sao.
            </p>
          ) : null}
        </div>
      </div>

      <Section title="ĐỊNH DANH">
        <dl>
          <Row label="Tên">
            <span className="font-mono">{object.name}</span>
          </Row>
          <Row label="Namespace">
            <span className="font-mono">
              {object.namespace === '' ? (
                <span className="text-muted-foreground">phạm vi cụm</span>
              ) : (
                object.namespace
              )}
            </span>
          </Row>
          <Row label="Loại">
            <span className="font-mono">{object.kind}</span>
          </Row>
          <Row label="UID">
            <span className="font-mono text-[11px] text-muted-foreground">{object.uid}</span>
          </Row>
          <Row label="Tuổi">
            {/* Tuổi TÍNH tại đây từ `tick - createdTick`, không lưu — đúng luật
                "không lưu trường suy ra được", và chính hợp đồng cũng nói vậy. */}
            <span className="font-mono">{age} tick</span>
            <span className="ml-2 text-muted-foreground">tạo lúc t{object.createdTick}</span>
          </Row>
          {replicas === null ? null : (
            <Row label="Replica">
              <span className="font-mono">{replicas}</span>
            </Row>
          )}
        </dl>
      </Section>

      {containers.length === 0 ? null : (
        <Section title={containers.length === 1 ? 'CONTAINER' : `CONTAINER (${containers.length})`}>
          <ul className="flex flex-col gap-1.5">
            {containers.map((container) => (
              <li
                key={container.name}
                className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                <p className="truncate font-mono text-xs font-medium text-foreground">
                  {container.name}
                </p>
                {container.image === null ? null : (
                  <p className="mt-0.5 wrap-break-word font-mono text-[11px] text-status-progress">
                    {container.image}
                  </p>
                )}
                {container.ports.length === 0 ? null : (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    cổng {container.ports.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {requests === null && limits === null ? null : (
        <Section title="TÀI NGUYÊN">
          <dl>
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
          </dl>
        </Section>
      )}

      {object.kind === 'Pod' ? (
        <Section title="XẾP LỊCH">
          {object.nodeName === null ? (
            <p className="text-xs text-muted-foreground">
              Chưa được xếp lịch lên node nào. Scheduler chưa tìm được chỗ đặt.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <dl>
                <Row label="Node">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono">{object.nodeName}</span>
                    {node !== null && !node.ready ? (
                      <Badge variant="destructive">NotReady</Badge>
                    ) : null}
                  </span>
                </Row>
              </dl>
              {node === null ? null : (
                <div className="flex flex-col gap-1 pt-0.5">
                  <Meter label="CPU" value={node.cpuUsed} />
                  <Meter label="RAM" value={node.memoryUsed} />
                </div>
              )}
            </div>
          )}
        </Section>
      ) : null}

      {object.kind === 'Node' && node !== null ? (
        <Section title="MỨC SỬ DỤNG">
          <div className="flex flex-col gap-1">
            <Meter label="CPU" value={node.cpuUsed} />
            <Meter label="RAM" value={node.memoryUsed} />
          </div>
        </Section>
      ) : null}

      <Section title={labels.length === 0 ? 'NHÃN' : `NHÃN (${labels.length})`}>
        {labels.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Không có nhãn. Selector của Service sẽ không tìm thấy object này.
          </p>
        ) : (
          <span className="flex flex-wrap gap-1">
            {labels.map(([key, value]) => (
              <Badge key={key} variant="secondary" className="font-mono text-[11px]">
                {key}={value}
              </Badge>
            ))}
          </span>
        )}
      </Section>
    </div>
  );
}
