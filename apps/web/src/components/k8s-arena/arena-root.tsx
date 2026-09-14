'use client';

/**
 * Gốc của K8s Arena — nơi cảnh 3D, các lớp HUD và engine gặp nhau.
 *
 * Hai luật bố cục được thi hành TẠI ĐÂY, không phải trong từng lớp con:
 *
 * 1. Canvas chiếm trọn vùng dưới thanh trên cùng. Không có lưới chia cột; mọi
 *    bảng là lớp nổi định vị tuyệt đối bên trên nó.
 * 2. Bảng thông số bên phải chỉ tồn tại khi có object đang chọn. Xem
 *    `InspectorPanel` — nó tự trả `null`, và ở đây không có nhánh nào render một
 *    khung rỗng thay thế.
 *
 * ⚠ Lớp HUD nào không nhận tương tác phải để chuột lọt xuống canvas. Vỏ ngoài
 * đặt `pointer-events-none`, từng bảng tự bật lại `pointer-events-auto`. Không
 * làm vậy thì một `div` trong suốt phủ toàn màn sẽ nuốt mọi cú kéo camera —
 * đúng lỗi mà bản của k8sgames.com đang mắc theo chiều ngược lại (canvas của họ
 * nuốt pointer-event của nút menu).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';
import type { Level, ObjectView } from '@devops-platform/games';
import type { ArenaModeContext, CameraCommand, QualityTier, ScreenPoint } from './arena-contract';
import { useArenaSession } from './arena-session';
import { ArenaOverlays } from './arena-overlays';
import './arena.css';

/**
 * ⚠ `ssr: false` là BẮT BUỘC, không phải tối ưu.
 *
 * Cả cây `scene/**` kéo theo `three`, và cổng e2e khẳng định `three` không xuất
 * hiện trong bundle của bất kỳ trang nào ngoài trang game. Một import tĩnh làm
 * đỏ ô đó. Ngoài ra `three` chạm `window` lúc dựng renderer, nên render phía máy
 * chủ sẽ ném.
 */
const ArenaScene = dynamic(async () => (await import('./scene')).ArenaScene, {
  ssr: false,
});

export interface ArenaRootProps {
  readonly level: Level;
  readonly mode: ArenaModeContext;
  readonly onExit: () => void;
}

export function ArenaRoot({ level, mode, onExit }: ArenaRootProps): ReactElement {
  const engine = useArenaSession(level);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [hoveredUid, setHoveredUid] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<ScreenPoint | null>(null);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [sceneMenuAnchor, setSceneMenuAnchor] = useState<ScreenPoint | null>(null);
  const [quality, setQuality] = useState<QualityTier>('high');
  const [showLabels, setShowLabels] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  /**
   * Số lần "sắp xếp lại" đã bấm, và số vật đang bị kéo lệch.
   *
   * ⚠ Vị trí kéo sống trong `SceneRuntime` — NGOÀI React, cố ý: nó đổi mỗi
   * khung hình trong lúc kéo, và cho nó đi qua `useState` là dựng lại cả cây
   * HUD 60 lần một giây. Nhưng nút "Sắp xếp lại" cần biết có gì để sắp xếp
   * không, nên cảnh báo ngược lên bằng MỘT con số, chỉ khi tập vật-bị-kéo
   * chuyển giữa rỗng và không rỗng.
   */
  const [hasMoved, setHasMoved] = useState(false);
  const [alignAt, setAlignAt] = useState(0);
  const startedAtRef = useRef(Date.now());

  /*
   * Ép chế độ tối lên GỐC TÀI LIỆU, không chỉ lên khung của arena.
   *
   * Đặt `dark` trên `div` bọc ngoài là chưa đủ, và chỗ hụt chỉ lộ ra khi mở một
   * hộp thoại: Radix render dialog qua portal vào `document.body`, tức là NGOÀI
   * khung arena, nên nó đọc bảng màu sáng của ứng dụng và hiện ra trắng toát
   * giữa một cảnh tối. Đo trực tiếp trên trình duyệt 2026-09-08 với hộp thoại
   * đặt tên tài nguyên.
   *
   * Khôi phục lớp cũ khi rời trang: người dùng chọn theme sáng cho cả ứng dụng
   * thì phải nhận lại đúng thứ họ chọn, không phải bị arena giữ lại chế độ tối.
   */
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) {
        root.classList.remove('dark');
      }
    };
  }, []);

  /*
   * Hàm, không phải mảng — và đây là ràng buộc hiệu năng, không phải sở thích.
   * Engine đập nhịp nhiều lần mỗi giây; truyền mảng object qua props sẽ làm mọi
   * bảng nhận nó dựng lại theo từng nhịp, kể cả khi bảng đó đang đóng.
   */
  const { sceneGetView } = engine;
  const listObjects = useCallback(
    (): readonly ObjectView[] => sceneGetView().objects,
    [sceneGetView],
  );

  const sendCamera = useCallback((kind: CameraCommand['kind'], target?: Partial<CameraCommand>) => {
    /*
     * `issuedAt` làm mỗi lần bấm là một giá trị mới. Không có nó thì bấm "về góc
     * nhìn" lần thứ hai không tạo ra thay đổi prop nào, và lần bấm đó rơi vào hư
     * không — người dùng bấm mà không thấy gì xảy ra.
     */
    setCamera({ kind, issuedAt: performance.now(), ...target });
  }, []);

  /**
   * Chọn một tài nguyên. KHÔNG động tới camera.
   *
   * ⛔ Bản trước bắn `focus` ở MỌI lần chọn, và đó là một lỗi thao tác đo được:
   * `CAMERA_TUNING.focusDistance` là 7 đơn vị, tức mỗi cú bấm kéo camera lao vào
   * sát vật, các bệ node văng ra ngoài khung, và điểm người chơi vừa nhắm vào
   * biến mất khỏi chỗ cũ. Bấm nhầm một cái là mất phương hướng, và muốn bấm cái
   * bên cạnh thì phải lùi camera ra trước — trong một game mà bấm là thao tác
   * làm nhiều nhất.
   *
   * Bay tới vật giờ là một hành động RIÊNG và có chủ đích: mục "Bay tới đây"
   * trong menu chuột phải, hoặc bấm một node trên bản đồ thu nhỏ. Chọn để xem
   * thông số thì camera đứng yên.
   */
  const selectObject = useCallback((uid: string | null) => {
    setSelectedUid(uid);
  }, []);

  /** Bay camera tới một tài nguyên, và chọn nó luôn. */
  const focusObject = useCallback(
    (uid: string) => {
      setSelectedUid(uid);
      sendCamera('focus', { uid });
    },
    [sendCamera],
  );

  const openContextMenu = useCallback((uid: string, at: ScreenPoint) => {
    setSceneMenuAnchor(null);
    setMenuUid(uid);
    setMenuAnchor(at);
  }, []);

  const closeContextMenu = useCallback(() => {
    setMenuAnchor(null);
    setMenuUid(null);
  }, []);

  const openSceneMenu = useCallback((at: ScreenPoint) => {
    // Đóng menu tài nguyên trước: hai menu cùng mở là hai vùng cùng nhận phím
    // mũi tên, và người dùng bàn phím không có cách nào biết mình đang ở đâu.
    setMenuAnchor(null);
    setMenuUid(null);
    setSceneMenuAnchor(at);
  }, []);

  const closeSceneMenu = useCallback(() => {
    setSceneMenuAnchor(null);
  }, []);

  /** Trả mọi tài nguyên về chỗ bố cục tự động tính. */
  const autoAlign = useCallback(() => {
    setAlignAt(performance.now());
  }, []);

  const selectNode = useCallback(
    (nodeName: string) => {
      sendCamera('focus', { nodeName });
    },
    [sendCamera],
  );

  const selectedObject = useMemo(
    () => engine.view.objects.find((object) => object.uid === selectedUid) ?? null,
    [engine.view, selectedUid],
  );

  const describeText = useMemo(
    () => (selectedUid === null ? null : engine.describe(selectedUid)),
    [engine, selectedUid],
  );

  return (
    /*
     * `dark` chốt cứng, KHÔNG theo theme của ứng dụng — bản cũ cũng làm vậy và
     * lý do vẫn đúng.
     *
     * Cảnh 3D tự ép nền tối bằng trần độ sáng, nên ở theme sáng ta được một
     * khung cảnh tối nằm dưới một dàn bảng trắng: chữ trắng của cảnh chìm vào
     * bảng, và các khối trong cảnh nhận token màu của bảng màu sáng nên ra xám
     * xịt. Đo trực tiếp 2026-09-08: node render thành một tấm xám không màu, và
     * thẻ nhiệm vụ trắng toát đè lên cảnh tối.
     *
     * Cách sửa đúng KHÔNG phải là hardcode màu tối vào từng bảng — làm vậy thì
     * token mất tác dụng và ai đổi bảng màu sau này sẽ đổi được mọi trang trừ
     * trang này. Ép ngữ cảnh `dark` giữ nguyên hệ token: mọi bảng và cả
     * `scene-tokens.ts` cùng đọc nhánh tối của cùng một bộ biến CSS.
     */
    <div className="arena-root dark relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Cảnh 3D nằm DƯỚI cùng và chiếm trọn khung. */}
      <div className="absolute inset-0">
        <ArenaScene
          simulationSpeed={engine.paused ? 0 : engine.speed}
          subscribe={engine.sceneSubscribe}
          getView={engine.sceneGetView}
          selectedUid={selectedUid}
          hoveredUid={hoveredUid}
          onSelect={selectObject}
          onHover={setHoveredUid}
          onContextMenu={openContextMenu}
          onSceneContextMenu={openSceneMenu}
          showLabels={showLabels}
          showEdges={showEdges}
          quality={quality}
          onQualityDowngrade={setQuality}
          onMovedChange={setHasMoved}
          autoAlignAt={alignAt}
          cameraCommand={camera}
          enabled
        />
      </div>

      <ArenaOverlays
        engine={engine}
        level={level}
        mode={mode}
        quality={quality}
        startedAt={startedAtRef.current}
        selectedObject={selectedObject}
        describeText={describeText}
        menuUid={menuUid}
        menuAnchor={menuAnchor}
        sceneMenuAnchor={sceneMenuAnchor}
        listObjects={listObjects}
        onSelect={selectObject}
        onFocusObject={focusObject}
        onSelectNode={selectNode}
        onCloseMenu={closeContextMenu}
        onCloseSceneMenu={closeSceneMenu}
        onCamera={sendCamera}
        onQuality={setQuality}
        showLabels={showLabels}
        onShowLabels={setShowLabels}
        showEdges={showEdges}
        onShowEdges={setShowEdges}
        canAutoAlign={hasMoved}
        onAutoAlign={autoAlign}
        onExit={onExit}
      />
    </div>
  );
}
