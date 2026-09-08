'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { EventView, NodeView, ObjectView } from '@devops-platform/games';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@devops-platform/ui';
import type { ArenaDispatch, ArenaEdit } from '../arena-contract.ts';
/*
 * `object-yaml.ts` là hàm THUẦN đã có test riêng (`object-yaml.test.ts`), nên
 * viết một bộ tuần tự YAML thứ hai ở đây là vi phạm SSOT.
 *
 * ⚠ Đường dẫn là `../shared/`, KHÔNG phải `../../games/`. Thư mục giao diện cũ
 * đã bị xoá và năm module thuần chuyển sang `k8s-arena/shared/`. Đường dẫn cũ
 * từng quay lại một lần khi file này được ghi đè từ một bản chép trước lúc
 * chuyển, và hậu quả không phải một lỗi biên dịch gọn gàng: CẢ ứng dụng trả 500,
 * mọi trang, vì một module không phân giải được làm sập cả cây import.
 */
import { objectToYaml } from '../shared/object-yaml.ts';
import { InspectorActions } from './inspector-actions.tsx';
import { InspectorEvents } from './inspector-events.tsx';
import { InspectorOverview } from './inspector-overview.tsx';
import { InspectorTextTab } from './inspector-text-tab.tsx';
import { InspectorYamlTab } from './inspector-yaml-tab.tsx';
import { HIDDEN_SCROLL, PanelFrame } from './inspector-frame.tsx';
import { InspectorResizeHandle, useInspectorWidth } from './inspector-resize.tsx';
import { objectLabel } from './inspector-types.ts';
import { RESOURCE_COLOR } from '../shared/resource-identity';
import { RESOURCE_ICON } from './resource-icon';

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
  /** Node đang chạy object; cha tra từ `ClusterView.nodes` theo `object.nodeName`. */
  readonly node: NodeView | null;
  readonly tick: number;
  /**
   * TOÀN BỘ sự kiện của cụm — truyền thẳng `view.events`, không lọc trước.
   *
   * Bản đầu đòi cha lọc sẵn, vì `EventView` khi đó chưa có `involvedUid`. Giờ đã
   * có, nên việc lọc về đây: một chỗ lọc thì không có chỗ thứ hai để quên.
   */
  readonly events: readonly EventView[];
  /** Khối `kubectl describe` — cha lấy từ `session.describe(uid)`. */
  readonly describeText: string | null;
  /**
   * Manifest ĐẦY ĐỦ — cha lấy từ `session.manifest(uid)`. `null` = engine không
   * dựng được (object vừa biến mất), và tab YAML khi đó chỉ ĐỌC.
   *
   * ⛔ KHÔNG thay bằng `objectToYaml(object)`. Bản đó không mang `spec`, và lưu
   * nó lại sẽ xoá sạch spec thật của tài nguyên — đã đo được một lần: pod mất
   * hết container mà vẫn `Running`, không một lỗi nào.
   */
  readonly manifestYaml: string | null;
  readonly dispatch: ArenaDispatch;
  /** Chạy một câu `kubectl` trong terminal — đường của mọi hành động sinh ra chữ. */
  readonly onRunCommand: (command: string) => void;
  /** Lưu manifest đã sửa ở tab YAML, và trả lại đúng câu engine nói. */
  readonly onEdit: ArenaEdit;
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
 * Trạng thái `shown` tồn tại ĐÚNG để giữ nội dung sống thêm `EXIT_MS` cho cú
 * trượt ra chạy hết; hết thời gian đó thì nó về `null` và cây DOM sạch.
 *
 * Bề rộng kéo được ở mép trái và nhớ qua `localStorage` — bản đầu đóng cứng
 * 352px và chủ dự án chê chật, trong khi hai phần ba màn hình bên trái bỏ trống.
 */
export function InspectorPanel({
  object,
  node,
  tick,
  events,
  describeText,
  manifestYaml,
  dispatch,
  onRunCommand,
  onEdit,
  onClose,
}: InspectorPanelProps): ReactElement | null {
  const [shown, setShown] = useState<ObjectView | null>(null);
  const [entered, setEntered] = useState(false);
  const [tab, setTab] = useState('overview');
  const { width, setWidth } = useInspectorWidth();

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

  const uid = shown?.uid ?? null;
  const ownEvents = useMemo(
    () => (uid === null ? [] : events.filter((event) => event.involvedUid === uid)),
    [events, uid],
  );

  if (shown === null) {
    return null;
  }

  const title = objectLabel(shown);
  const KindIcon = RESOURCE_ICON[shown.kind];

  return (
    <PanelFrame
      title={title}
      headerExtra={
        <KindIcon
          aria-hidden
          className="size-6 shrink-0"
          style={{ color: RESOURCE_COLOR[shown.kind] }}
        />
      }
      closeLabel={`Đóng bảng thông số của ${title}`}
      onClose={onClose}
      style={{ width }}
      className={cn(
        /*
         * `z-30` chứ không `z-20`: bản đồ thu nhỏ cũng nằm ở góc phải dưới, và
         * ở cùng bậc thì nó vẽ đè lên hàng hành động của bảng này — đo được
         * trên ảnh chụp màn hình, nút "Xoá" bị cắt mất một nửa và không bấm
         * tới. Bảng thông số là thứ người dùng vừa chủ động mở nên nó thắng.
         */
        'arena-inspector absolute inset-y-3 right-3 z-30 max-w-[calc(100%-1.5rem)]',
        'transition-[transform,opacity] duration-200 ease-out',
        entered ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+0.75rem)] opacity-0',
      )}
    >
      <InspectorResizeHandle width={width} onWidth={setWidth} />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="yaml">YAML</TabsTrigger>
          <TabsTrigger value="events">Sự kiện</TabsTrigger>
          {describeText === null ? null : <TabsTrigger value="describe">Mô tả</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className={cn('min-h-0 flex-1 px-3 py-2', HIDDEN_SCROLL)}>
          <InspectorOverview object={shown} node={node} tick={tick} manifestYaml={manifestYaml} />
          {/*
            Token ngữ nghĩa, KHÔNG phải thang màu Tailwind. Ba lớp `sky-400` ở
            đây trước kia là màu cứng duy nhất còn sót trong bảng — thứ mà
            `check-design-tokens.mjs` cấm, và thứ không đổi theo theme sáng/tối.
          */}
          <button
            type="button"
            className="mt-4 w-full rounded-lg border border-status-progress/30 bg-status-progress/10 p-2 text-sm text-status-progress transition-colors hover:bg-status-progress/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => setTab('yaml')}
          >
            Chỉnh sửa cấu hình YAML
          </button>
        </TabsContent>

        <TabsContent value="yaml" className="flex min-h-0 flex-1 flex-col px-3 py-2">
          {manifestYaml === null ? (
            <InspectorTextTab
              text={objectToYaml(shown)}
              label={`YAML của ${title}`}
              copyLabel="Chép YAML"
            />
          ) : (
            <InspectorYamlTab object={shown} yaml={manifestYaml} onEdit={onEdit} />
          )}
        </TabsContent>

        <TabsContent value="events" className={cn('min-h-0 flex-1 px-3 py-2', HIDDEN_SCROLL)}>
          <InspectorEvents events={ownEvents} tick={tick} />
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

      <InspectorActions
        object={shown}
        tick={tick}
        dispatch={dispatch}
        onRunCommand={onRunCommand}
      />
    </PanelFrame>
  );
}
