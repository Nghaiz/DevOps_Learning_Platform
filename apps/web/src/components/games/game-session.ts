'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ClusterView, K8sSession, ObjectView, ResourceRef, SessionStatus } from '@devops-platform/games';

/**
 * Trạng thái rỗng, ĐÓNG BĂNG ở tầm module.
 *
 * ⚠ Phải là một hằng, không phải một hàm dựng object. `useSyncExternalStore` so
 * sánh snapshot bằng `Object.is`; trả một object mới mỗi lần gọi `getSnapshot`
 * cho ra vòng render vô hạn với một stack trace không nói gì. Cùng cái bẫy mà
 * `contract.ts` đã cảnh báo lane B ở phía engine — nó cắn cả phía này, và ở phía
 * này nó cắn khi CHƯA có engine, tức đúng lúc không ai nghi ngờ gì.
 */
export const EMPTY_VIEW: ClusterView = Object.freeze({
  tick: 0,
  nodes: Object.freeze([]),
  objects: Object.freeze([]),
  edges: Object.freeze([]),
  events: Object.freeze([]),
});

export const EMPTY_STATUS: SessionStatus = Object.freeze({
  phase: 'playing',
  objectivesMet: Object.freeze([]),
  hintsRevealed: 0,
  movesUsed: 0,
});

/**
 * Nhịp cập nhật của panel DOM.
 *
 * §11.1.3 — vòng lặp scene chạy ở nhịp màn hình và nằm NGOÀI React; panel là chữ
 * nên ~10Hz là quá đủ. Không kẹp lại thì mỗi tick mô phỏng kéo theo một lượt
 * reconciliation của cả cây panel, và ta trả giá đó 60 lần mỗi giây để làm mới
 * những dòng chữ mà mắt không kịp đọc.
 */
export const PANEL_UPDATE_MS = 100;

type Unsubscribe = () => void;
type Subscribe = (onChange: () => void) => Unsubscribe;

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

/**
 * Gộp các thông báo dồn dập thành nhiều nhất một lượt mỗi `intervalMs`.
 *
 * Sườn LÊN chạy ngay (bấm phím là thấy kết quả, không đợi 100ms) rồi khoá lại;
 * thông báo đến trong lúc khoá được gộp thành ĐÚNG MỘT lượt ở cuối chu kỳ, nên
 * trạng thái cuối cùng không bao giờ bị nuốt. Bỏ sườn xuống là một lỗi kinh
 * điển: lượt cập nhật cuối của một chuỗi chính là lượt quan trọng nhất.
 */
export function throttleNotifications(subscribe: Subscribe, intervalMs: number): Subscribe {
  return (onChange: () => void): Unsubscribe => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    let disposed = false;

    const fire = (): void => {
      timer = setTimeout(() => {
        timer = null;
        if (disposed) {
          return;
        }
        if (pending) {
          pending = false;
          onChange();
          fire();
        }
      }, intervalMs);
    };

    const unsubscribe = subscribe(() => {
      if (disposed) {
        return;
      }
      if (timer !== null) {
        pending = true;
        return;
      }
      onChange();
      fire();
    });

    return () => {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe();
    };
  };
}

export interface SessionSnapshot {
  readonly view: ClusterView;
  readonly status: SessionStatus;
}

/**
 * Đăng ký nghe một `K8sSession` và trả về snapshot hiện tại.
 *
 * `session` được phép là `null` — đó là trạng thái trước khi lane B giao engine,
 * và cũng là trạng thái trong lượt render trên server (phiên chơi có đồng hồ,
 * không được dựng ở đó). Hook vẫn gọi `useSyncExternalStore` VÔ ĐIỀU KIỆN; chỉ
 * nguồn dữ liệu đổi.
 */
export function useSessionSnapshot(session: K8sSession | null): SessionSnapshot {
  const subscribe = useCallback(
    (onChange: () => void): Unsubscribe => {
      if (session === null) {
        return NOOP_UNSUBSCRIBE;
      }
      return throttleNotifications((listener) => session.subscribe(listener), PANEL_UPDATE_MS)(onChange);
    },
    [session],
  );

  const getView = useCallback((): ClusterView => (session === null ? EMPTY_VIEW : session.getView()), [session]);
  const getStatus = useCallback((): SessionStatus => (session === null ? EMPTY_STATUS : session.getStatus()), [session]);

  const view = useSyncExternalStore(subscribe, getView, () => EMPTY_VIEW);
  const status = useSyncExternalStore(subscribe, getStatus, () => EMPTY_STATUS);

  return { view, status };
}

/**
 * `ObjectView` → `ResourceRef`.
 *
 * Ranh giới giữa hai khoá của hợp đồng: `uid` sống trong renderer (tra scene
 * graph), bộ ba (kind, namespace, name) là thứ ĐI VÀO `GameAction` và do đó vào
 * `RunLog`. Một hàm ở đúng một chỗ để chỗ nào cũng đổi giống nhau.
 */
export function toResourceRef(object: ObjectView): ResourceRef {
  return { kind: object.kind, namespace: object.namespace, name: object.name };
}
