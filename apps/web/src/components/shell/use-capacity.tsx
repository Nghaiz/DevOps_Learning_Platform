'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { describeTrpcError, trpc } from '../../lib/trpc';
import type { CapacityView } from './capacity';

/**
 * Nhịp đọc lại sức chứa. 15s là mức hợp đồng §3 lane B chốt: đủ nhanh để con số
 * không nói dối khi lớp học 20 người cùng bấm Bắt đầu, đủ chậm để không ăn vào
 * hạn 120 query/phút mỗi user của `protectedProcedure` (4 lượt/phút).
 */
export const CAPACITY_REFETCH_MS = 15_000;

export interface CapacityState {
  /** Số liệu mới nhất ĐỌC ĐƯỢC — giữ nguyên qua một lượt lỗi, xem chú thích ở `load`. */
  readonly data: CapacityView | null;
  /** Câu lỗi của lượt đọc gần nhất, `null` khi lượt đó thành công. */
  readonly error: string | null;
  readonly loading: boolean;
  refetch(): void;
}

const IDLE: CapacityState = { data: null, error: null, loading: false, refetch: () => undefined };

const CapacityContext = createContext<CapacityState>(IDLE);

/**
 * Số liệu sức chứa dùng chung cho cả cây.
 *
 * ⛔ **Đừng gọi `capacity.get` lần nữa ở trang con.** `SessionControls` (C5),
 * chỉ báo trên thanh điều hướng và mọi nút Bắt đầu đều đọc CÙNG state này —
 * bốn nơi tự poll riêng là bốn con số lệch nhau trên cùng một màn hình, và gấp
 * bốn lượt gọi cho đúng một câu trả lời.
 */
export function useCapacity(): CapacityState {
  return useContext(CapacityContext);
}

export function CapacityProvider({
  enabled,
  children,
}: {
  /** `false` cho khách chưa đăng nhập — `capacity.get` là `protectedProcedure`, gọi khi chưa đăng nhập chỉ đổi lấy một UNAUTHORIZED. */
  readonly enabled: boolean;
  readonly children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<{
    data: CapacityView | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: enabled });

  // Chặn chồng lượt: tab ẩn rồi hiện lại đúng lúc interval nổ sẽ bắn hai lượt
  // song song, và lượt về sau có thể là lượt CŨ hơn — ghi đè số mới bằng số cũ.
  const inFlight = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const data = await trpc.capacity.get.query({});
      setSnapshot({ data, error: null, loading: false });
    } catch (error: unknown) {
      // GIỮ `data` cũ: một lượt mạng lỗi không có nghĩa là sức chứa biến mất.
      // Xoá số đi sẽ làm badge nhấp nháy giữa "còn N chỗ" và trống mỗi 15 giây
      // trên một mạng chập chờn. Lỗi vẫn được nêu ra cạnh số (không nuốt im
      // lặng) để người đọc biết con số có thể đã cũ.
      setSnapshot((prev) => ({ data: prev.data, error: describeTrpcError(error), loading: false }));
    } finally {
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot({ data: null, error: null, loading: false });
      return;
    }
    void load();
    const timer = setInterval(() => {
      // Tab ẩn thì không hỏi: người dùng không nhìn, và một lớp 20 máy để tab
      // nền vẫn nện đủ 4 lượt/phút mỗi máy vào cùng một orchestrator.
      if (typeof document === 'undefined' || !document.hidden) {
        void load();
      }
    }, CAPACITY_REFETCH_MS);

    const onVisible = (): void => {
      if (!document.hidden) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, load]);

  const value = useMemo<CapacityState>(
    () => ({ ...snapshot, refetch: () => void load() }),
    [snapshot, load],
  );

  return <CapacityContext.Provider value={value}>{children}</CapacityContext.Provider>;
}
