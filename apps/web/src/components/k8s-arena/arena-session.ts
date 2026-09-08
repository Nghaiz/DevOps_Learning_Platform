'use client';

/**
 * Cầu nối giữa engine mô phỏng và React.
 *
 * ⛔ ĐÂY LÀ CHỖ DỄ LÀM SẬP KHUNG HÌNH NHẤT trong cả arena, nên đọc trước khi sửa.
 *
 * Engine đập nhịp nhiều lần mỗi giây. Nếu trạng thái cụm đi qua `useState` thì
 * mỗi nhịp là một lần React dựng lại cây, và với vài trăm pod thì khung hình
 * sập. Nên ở đây có HAI đường dữ liệu tách hẳn nhau, cố ý:
 *
 * 1. **Đường của cảnh 3D** — `sceneSubscribe` / `sceneGetView`. Không đi qua
 *    React chút nào. Cảnh tự kéo dữ liệu trong vòng lặp vẽ của nó.
 * 2. **Đường của các bảng HUD** — `useSyncExternalStore`, có tiết chế. Bảng chỉ
 *    cần đủ mới để người đọc không thấy sai, không cần đúng từng nhịp.
 *
 * ⚠ `sceneSubscribe` và `sceneGetView` BẮT BUỘC ổn định theo tham chiếu qua mọi
 * lần render. Bản cũ có một ghi chú hậu kiểm về đúng lỗi này: khi hai hàm đó đổi
 * tham chiếu, cảnh bị tháo và dựng lại liên tục, và kết quả là *không có cảnh 3D
 * nào* xuất hiện. Đó là lý do chúng đọc engine qua ref chứ không đọc biến state.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  ClusterView,
  DispatchOutcome,
  GameAction,
  K8sEngineSession,
  Level,
  ResourceRef,
  SessionStatus,
} from '@devops-platform/games';
import { classifyObjectives, createSession } from '@devops-platform/games';

/**
 * Nhịp làm mới của các bảng HUD.
 *
 * 100ms là mức mắt người không phân biệt được với tức thời, nhưng nó cắt số lần
 * React dựng lại xuống còn khoảng một phần năm so với việc bám theo nhịp engine.
 */
const PANEL_UPDATE_MS = 100;

export interface ArenaSessionHandle {
  /** Ổn định vĩnh viễn. Truyền thẳng cho `<ArenaScene>`. */
  readonly sceneSubscribe: (onChange: () => void) => () => void;
  /** Ổn định vĩnh viễn. Cảnh gọi trong vòng lặp vẽ. */
  readonly sceneGetView: () => ClusterView;
  /** Ảnh chụp có tiết chế, dành cho các bảng HUD. */
  readonly view: ClusterView;
  readonly status: SessionStatus;
  readonly dispatch: (action: GameAction) => void;
  /**
   * Sửa manifest và NGHE engine trả lời — đường của ô soạn thảo YAML.
   *
   * Tách khỏi `dispatch` vì `dispatch` trả `void` và nuốt mất `output`, nên một
   * YAML sai cú pháp trước đây làm nút Lưu im lặng hoàn toàn.
   */
  readonly editResource: (target: ResourceRef, yaml: string) => DispatchOutcome;
  readonly runCommand: (command: string) => string;
  readonly describe: (uid: string) => string | null;
  /**
   * Manifest YAML ĐẦY ĐỦ của một tài nguyên — nguồn của ô soạn thảo YAML.
   *
   * ⛔ KHÔNG dùng `objectToYaml` cho việc này. Nó tuần tự hoá `ObjectView`, một
   * phép chiếu hiển thị không mang `spec`, nên lưu bản đó lại sẽ xoá sạch spec
   * của tài nguyên. Xem `manifest-yaml.ts` trong package games.
   */
  readonly manifest: (uid: string) => string | null;
  readonly getTick: () => number;
  /**
   * Số gợi ý đã mở. Lấy thẳng từ `SessionStatus.hintsRevealed` của engine.
   *
   * Ban đầu tôi tự đếm lại bằng cách quét `RunLog` tìm hành động `hint` — thừa,
   * vì engine đã theo dõi sẵn. Giữ lại ghi chú này vì bài học đáng nhớ hơn đoạn
   * mã đã xoá: một bộ đếm thứ hai cho cùng một sự thật sẽ lệch ngay lần đầu có
   * thêm đường mở gợi ý (phát lại nhật ký, khôi phục phiên), và không có gì đỏ
   * để báo. Trước khi tự tính một con số, tìm xem nó đã tồn tại chưa.
   */
  readonly hintsRevealed: number;
  /**
   * Mục tiêu ĐÚNG SẴN mà người chơi phải giữ — `ObjectiveKinds.guards`.
   *
   * Tính MỘT LẦN cho mỗi level, không mỗi tick: nó là tính chất của bài, không
   * phải của trạng thái hiện tại. Xem `classifyObjectives` trong package games
   * về việc vì sao phép thử phải đo ở hai thời điểm.
   */
  readonly guardObjectiveIds: readonly string[];
  readonly speed: number;
  readonly paused: boolean;
  /**
   * Một nhịp điều khiển duy nhất cho cả tạm dừng lẫn đổi tốc độ.
   *
   * `0` nghĩa là tạm dừng và đi qua `pause()`, KHÔNG qua `setSpeed(0)`.
   * `setSpeed` kẹp sàn ở 0.25 (chu kỳ hẹn giờ bằng 0 làm treo tab, không phải
   * báo lỗi), nên `setSpeed(0)` cho ra 0.25× — một nút tạm dừng bấm vào thì cụm
   * vẫn chạy, chỉ chậm đi. Thanh trên cùng phát `0` làm tín hiệu tạm dừng và
   * chỗ dịch tín hiệu đó nằm ở đây.
   */
  readonly setSpeed: (multiplier: number) => void;
  readonly togglePause: () => void;
}

export function useArenaSession(level: Level): ArenaSessionHandle {
  const [session, setSession] = useState<K8sEngineSession | null>(null);
  const sessionRef = useRef<K8sEngineSession | null>(null);
  /*
   * Sinh MỘT lần cho cả vòng đời component, không sinh lại mỗi render.
   * Hạt giống đi vào `RunLog` và là thứ làm lượt phát lại tái hiện đúng cùng
   * một chuỗi ngẫu nhiên; đổi hạt giống giữa chừng thì bản ghi không phát lại
   * được nữa, và phần chấm điểm chống gian lận mất chỗ dựa.
   */
  const seedRef = useRef(Math.floor(Math.random() * 2 ** 31));
  const [speed, setSpeedState] = useState(1);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const next = createSession({ level, seed: seedRef.current });
    sessionRef.current = next;
    setSession(next);
    return () => {
      next.dispose();
      sessionRef.current = null;
    };
  }, [level]);

  /*
   * Mảng phụ thuộc RỖNG là điểm mấu chốt, không phải sơ suất. Hai hàm này phải
   * giữ nguyên tham chiếu suốt vòng đời component; chúng đọc phiên qua ref nên
   * vẫn thấy phiên mới khi level đổi.
   */
  const sceneSubscribe = useCallback((onChange: () => void) => {
    const current = sessionRef.current;
    if (current === null) {
      /*
       * Phiên chưa dựng xong (effect chạy sau lần render đầu). Trả về hàm huỷ
       * rỗng thay vì ném: cảnh sẽ đăng ký lại khi `session` vào state và
       * component render lại.
       */
      return () => undefined;
    }
    return current.subscribe(onChange);
  }, []);

  const sceneGetView = useCallback((): ClusterView => {
    const current = sessionRef.current;
    if (current === null) {
      return EMPTY_VIEW;
    }
    return current.getView();
  }, []);

  const view = useThrottledView(session);
  const status = useMemo(() => session?.getStatus() ?? EMPTY_STATUS, [session, view]);

  const dispatch = useCallback((action: GameAction) => {
    sessionRef.current?.dispatch(action);
  }, []);

  const editResource = useCallback((target: ResourceRef, yaml: string): DispatchOutcome => {
    const current = sessionRef.current;
    if (current === null) {
      return { output: 'Phiên chưa sẵn sàng.', accepted: false };
    }
    return current.dispatchDetailed({ tick: current.getView().tick, kind: 'edit', target, yaml });
  }, []);

  const runCommand = useCallback((command: string): string => {
    return sessionRef.current?.runCommand(command) ?? 'Phiên chưa sẵn sàng.';
  }, []);

  const describe = useCallback((uid: string): string | null => {
    return sessionRef.current?.describe(uid) ?? null;
  }, []);

  const manifest = useCallback((uid: string): string | null => {
    return sessionRef.current?.manifest(uid) ?? null;
  }, []);

  const getTick = useCallback((): number => sessionRef.current?.getView().tick ?? 0, []);

  /*
   * Hạt giống LÀ hạt giống của phiên. Phân loại phải chạy trên đúng chuỗi ngẫu
   * nhiên mà người chơi đang thấy — một hạt giống khác cho ra một đợt sự cố
   * khác, và một mục tiêu có thể đổi nhóm theo đó.
   */
  const guardObjectiveIds = useMemo(
    () => classifyObjectives(level, seedRef.current).guards,
    [level],
  );


  const applySpeed = useCallback((multiplier: number) => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    if (multiplier <= 0) {
      current.pause();
      setPaused(true);
      return;
    }
    current.setSpeed(multiplier);
    setSpeedState(multiplier);
    current.resume();
    setPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    const current = sessionRef.current;
    if (current === null) {
      return;
    }
    setPaused((wasPaused) => {
      if (wasPaused) {
        current.resume();
      } else {
        current.pause();
      }
      return !wasPaused;
    });
  }, []);

  return {
    sceneSubscribe,
    sceneGetView,
    view,
    status,
    dispatch,
    editResource,
    runCommand,
    describe,
    manifest,
    getTick,
    hintsRevealed: status.hintsRevealed,
    guardObjectiveIds,
    speed,
    paused,
    setSpeed: applySpeed,
    togglePause,
  };
}

/**
 * Ảnh chụp cho các bảng HUD, tiết chế xuống `PANEL_UPDATE_MS`.
 *
 * Dùng `useSyncExternalStore` chứ không `useState` + effect: nó là API React
 * dành đúng cho nguồn dữ liệu ngoài, và nó tránh được cảnh render ra dữ liệu cũ
 * một khung hình khi engine đổi giữa lúc React đang dựng.
 */
function useThrottledView(session: K8sEngineSession | null): ClusterView {
  const snapshotRef = useRef<ClusterView>(EMPTY_VIEW);
  const lastAtRef = useRef(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (session === null) {
        return () => undefined;
      }
      /* Ảnh chụp đầu tiên: lấy ngay khi có phiên, trước khi engine kịp đập nhịp. */
      snapshotRef.current = session.getView();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = session.subscribe(() => {
        const now = Date.now();
        const elapsed = now - lastAtRef.current;
        if (elapsed >= PANEL_UPDATE_MS) {
          lastAtRef.current = now;
          snapshotRef.current = session.getView();
          onStoreChange();
          return;
        }
        /*
         * Hẹn phần đuôi. Không có nhánh này thì thay đổi CUỐI CÙNG của một chuỗi
         * nhịp dày sẽ không bao giờ hiển thị — cụm đứng yên với số liệu cũ, và
         * chỉ cần một nhịp nữa mới lộ ra. Người dùng đọc bảng lúc đó thấy sai.
         */
        if (timer === null) {
          timer = setTimeout(() => {
            timer = null;
            lastAtRef.current = Date.now();
            snapshotRef.current = session.getView();
            onStoreChange();
          }, PANEL_UPDATE_MS - elapsed);
        }
      });
      return () => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        unsubscribe();
      };
    },
    [session],
  );

  /*
   * ⚠ CHỈ ĐỌC. Không gán gì vào ref ở đây.
   *
   * `getSnapshot` phải THUẦN và phải trả cùng một tham chiếu khi dữ liệu chưa
   * đổi. Bản đầu của hàm này tự khởi tạo `snapshotRef` lần gọi đầu, và React
   * bắt ngay: "The result of getServerSnapshot should be cached to avoid an
   * infinite loop" (đo trên trình duyệt 2026-09-08). React gọi hàm này nhiều
   * lần trong một lượt render để so tham chiếu; một hàm vừa đọc vừa ghi có thể
   * trả hai giá trị khác nhau trong cùng lượt, và React render lại mãi.
   *
   * Việc khởi tạo chuyển vào `subscribe`, nơi tác dụng phụ là hợp lệ.
   */
  const getSnapshot = useCallback((): ClusterView => snapshotRef.current, []);

  /*
   * Ảnh chụp phía máy chủ dùng chung một hằng, nên nó ổn định theo tham chiếu.
   * Trả về một đối tượng mới ở đây sẽ làm React báo vòng lặp render vô hạn.
   */
  const getServerSnapshot = useCallback((): ClusterView => EMPTY_VIEW, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Hằng dùng chung — phải ổn định theo tham chiếu, xem `getServerSnapshot`. */
const EMPTY_VIEW: ClusterView = {
  tick: 0,
  nodes: [],
  objects: [],
  edges: [],
  events: [],
  incidents: [],
};

const EMPTY_STATUS: SessionStatus = {
  phase: 'playing',
  objectivesMet: [],
  hintsRevealed: 0,
  movesUsed: 0,
};
