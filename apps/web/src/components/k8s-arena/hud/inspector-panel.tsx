'use client';

import { useEffect, useState, type ReactElement } from 'react';
import type { EventView, NodeView, ObjectView } from '@devops-platform/games';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@devops-platform/ui';
import type { ArenaDispatch } from '../arena-contract.ts';
/*
 * ⚠ Import xuyên sang thư mục của bản cũ, và đó là chỗ CẦN LEAD XỬ LÝ khi dọn
 * `components/games/`. `object-yaml.ts` là hàm THUẦN đã có test riêng
 * (`object-yaml.test.ts`), nên viết lại một bộ tuần tự thứ hai ở đây là vi phạm
 * SSOT. Khi lane nào xoá thư mục cũ thì file này phải được CHUYỂN vào
 * `k8s-arena/`, không xoá.
 */
import { objectToYaml } from '../shared/object-yaml.ts';
import { InspectorActions } from './inspector-actions.tsx';
import { InspectorEvents } from './inspector-events.tsx';
import { InspectorOverview } from './inspector-overview.tsx';
import { InspectorTextTab } from './inspector-text-tab.tsx';
import { PanelFrame } from './inspector-frame.tsx';
import { objectLabel, type ObjectDetail } from './inspector-types.ts';

/**
 * Thời gian trượt ra trước khi gỡ khỏi cây DOM.
 *
 * Dùng hẹn giờ chứ không nghe `transitionend`: `globals.css` hạ
 * `transition-duration` về 0 kèm `!important` khi người dùng bật giảm chuyển
 * động, và một transition dài 0 giây thì KHÔNG bắn `transitionend` — bảng sẽ
 * nằm lại trong DOM vĩnh viễn với đúng nhóm người dùng cần nó biến đi nhất.
 */
const EXIT_MS = 200;

export interface InspectorPanelProps {
  /** `null` ⇒ không có gì đang chọn ⇒ bảng KHÔNG tồn tại. Xem chú thích dưới. */
  readonly object: ObjectView | null;
  readonly detail: ObjectDetail | null;
  /** Node đang chạy object; cha tra từ `ClusterView.nodes` theo `object.nodeName`. */
  readonly node: NodeView | null;
  readonly tick: number;
  /** Sự kiện ĐÃ lọc về đúng object này — xem `InspectorEventsProps`. */
  readonly events: readonly EventView[];
  /**
   * Khối `kubectl describe` do cha dựng bằng `kubectl.ts` của engine.
   *
   * `null` ⇒ tab Mô tả KHÔNG hiện. Cố ý không hiện một tab rỗng: `describePod`
   * / `describeService` / `describeGeneric` nằm private trong
   * `packages/games/src/k8s/kubectl.ts` và nhận `ClusterState` chứ không nhận
   * `ObjectView`, nên lane C không gọi tới được và cũng KHÔNG được viết bộ định
   * dạng thứ hai. Chừng nào lead chưa mở đường thì thà thiếu một tab còn hơn có
   * một tab luôn trống mà không ai biết vì sao.
   */
  readonly describeText: string | null;
  readonly dispatch: ArenaDispatch;
  /** Bỏ chọn. Cha đặt `selectedUid = null`, và bảng tự trượt ra rồi biến mất. */
  readonly onClose: () => void;
}

/**
 * Bảng thông số của object đang chọn.
 *
 * ⛔ LUẬT BỐ CỤC SỐ 2 (`arena-contract.ts`, chỉ đạo trực tiếp của chủ dự án):
 * bảng này KHÔNG thường trực. Không có object nào đang chọn thì hàm trả `null` —
 * không phải một bảng rỗng ghi "chưa chọn gì", không phải một bảng mờ đi, không
 * phải một bảng thu nhỏ. Không có node nào trong DOM.
 *
 * Bản cũ (`components/games/inspector-panel.tsx`) trả về một đoạn văn "Chọn một
 * tài nguyên…" khi `object === null`, và đó chính là thứ bị chê.
 *
 * Trạng thái `shown` tồn tại ĐÚNG để giữ nội dung sống thêm `EXIT_MS` cho cú
 * trượt ra chạy hết; hết thời gian đó thì nó về `null` và cây DOM sạch.
 */
export function InspectorPanel({
  object,
  detail,
  node,
  tick,
  events,
  describeText,
  dispatch,
  onClose,
}: InspectorPanelProps): ReactElement | null {
  const [shown, setShown] = useState<ObjectView | null>(null);
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (object !== null) {
      setShown(object);
      // Bật lớp "đã vào" ở khung hình SAU để trình duyệt kịp vẽ trạng thái đầu
      // (nằm ngoài mép phải). Đặt cùng khung hình thì không có gì để nội suy và
      // bảng nhảy vào tức thì — đúng thứ chuyển động này sinh ra để tránh.
      const raf = requestAnimationFrame(() => {
        setEntered(true);
      });
      return () => {
        cancelAnimationFrame(raf);
      };
    }
    setEntered(false);
    const timer = setTimeout(() => {
      setShown(null);
    }, EXIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [object]);

  // Đổi sang tài nguyên khác ⇒ về tab đầu. Giữ nguyên tab YAML khi nhảy giữa hai
  // object là hợp lý với người đang so sánh manifest, nhưng nó làm người mới bấm
  // vào một pod và thấy một khối YAML thay vì trạng thái — cái họ đang tìm.
  useEffect(() => {
    setTab('overview');
  }, [shown?.uid]);

  if (shown === null) {
    return null;
  }

  const title = objectLabel(shown);

  return (
    <PanelFrame
      title={title}
      closeLabel={`Đóng bảng thông số của ${title}`}
      onClose={onClose}
      className={cn(
        'absolute inset-y-3 right-3 z-20 w-88 max-w-[calc(100%-1.5rem)]',
        'transition-[transform,opacity] duration-200 ease-out',
        entered ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+0.75rem)] opacity-0',
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="events">Sự kiện</TabsTrigger>
          {describeText === null ? null : <TabsTrigger value="describe">Mô tả</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <InspectorOverview object={shown} detail={detail} node={node} tick={tick} />
        </TabsContent>

        <TabsContent value="yaml" className="flex min-h-0 flex-1 flex-col px-3 py-2">
          <InspectorTextTab text={objectToYaml(shown)} label={`YAML của ${title}`} copyLabel="Chép YAML" />
        </TabsContent>

        <TabsContent value="events" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <InspectorEvents events={events} />
        </TabsContent>

        {describeText === null ? null : (
          <TabsContent value="describe" className="flex min-h-0 flex-1 flex-col px-3 py-2">
            <InspectorTextTab
              text={describeText}
              label={`Mô tả chi tiết của ${title}`}
              copyLabel="Chép mô tả"
            />
          </TabsContent>
        )}
      </Tabs>

      <InspectorActions object={shown} tick={tick} dispatch={dispatch} />
    </PanelFrame>
  );
}
