'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type * as THREE from 'three';
import { EffectComposer, SelectiveBloom } from '@react-three/postprocessing';

import { CommitInstances } from './commit-instances.tsx';
import { FilePlates } from './file-plates.tsx';
import { GitCanvas, reportGitSceneColorsDegraded } from './git-canvas.tsx';
import { HitProxy } from './hit-proxy.tsx';
import { LaneEdges } from './lane-edges.tsx';
import { RepoBlocks } from './repo-blocks.tsx';
import { SceneLabels3D } from './scene-labels-3d.tsx';
import { place3d, type Scene3DLayerProps } from './scene3d-contract.ts';
import { useGitSceneColors } from './use-git-scene-colors.ts';
import type { SceneProps } from '../../shared/scene-props.ts';

/**
 * Gốc hợp thành tầng 3D game Git (17.K).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NĂM VIỆC CHỈ GỐC HỢP THÀNH LÀM ĐƯỢC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Gọi `place3d()` ĐÚNG MỘT LẦN.** Hợp đồng nói thẳng: hai lần gọi là hai
 *    mảng khác định danh tham chiếu, và mọi `useMemo` phía dưới mất tác dụng
 *    **trong im lặng** — trang này vẽ lại sau mỗi lệnh người chơi gõ.
 * 2. **Một phần tử dò màu, một `MutationObserver`.** Năm tầng cần màu; nếu mỗi
 *    tầng tự gọi `useGitSceneColors` thì có năm canvas 1×1 và năm observer đọc
 *    lại cùng một bảng token mỗi lần đổi theme.
 * 3. **Dựng lớp DOM chứa nhãn.** `GitCanvas` không có nó — yêu cầu của lane D
 *    tới sau khi lane A đã xong. Lớp này phủ lên canvas, nằm NGOÀI `<Canvas>`.
 * 4. **Nối cờ `ACCENT_3D[...].bloom`.** Lane B chỉ *khai* cờ đó và bàn giao —
 *    không ai đọc thì nó là trang trí, và K.10 thành một dòng chú thích thay vì
 *    một hiệu ứng.
 * 5. **Gom mọi cảnh báo lúc chạy về một chỗ.** `onDegraded` của bảng màu,
 *    `onWarning` của mặt phẳng file, và `depthDisagreement` của hợp đồng đều là
 *    thứ phải nhìn thấy được, không phải ba dòng rơi vào console.
 *
 * ⛔ **KHÔNG bọc `GitCanvas` bằng `memo`.** Cơ chế "một khung cho mỗi lượt
 * render" của lane A dựa vào việc nó render lại khi cha đổi prop; bọc `memo`
 * thì đổi theme hoặc chọn commit sẽ không được vẽ ra — im lặng, không lỗi.
 */
export interface GitScene3DProps {
  /** Cùng nguồn mà renderer SVG đọc. Hai renderer đọc CÙNG một `SceneProps` (AC-B). */
  readonly scene: SceneProps;
  /**
   * Bật hậu kỳ (bloom cho `head`).
   *
   * ⚠ **Ô nghiệm thu AC-7 phải TẮT nó.** `EffectComposer` reset
   * `renderer.info.render` ở mỗi `render()`, và pass cuối là một tam giác phủ
   * màn hình — nên `calls === 1` dù cảnh có 2 hay 2000 object. Đo draw call khi
   * bloom bật là viết một ô xanh chứng minh đúng zero điều gì
   * (`rules/green-that-proves-nothing.md`). Arena phải ghim bậc chất lượng cộng
   * ba tiền đề mới khoá được bẫy này; ở đây nó là một công tắc tường minh.
   */
  readonly effects?: boolean;
  readonly label?: string;
  readonly onWarning?: (message: string) => void;
}

export function GitScene3D({
  scene,
  effects = true,
  label,
  onWarning,
}: GitScene3DProps): ReactElement {
  /*
   * ⚠ Lớp nhãn giữ bằng STATE, không phải `useRef`.
   *
   * Một `RefObject` có thể còn `null` đúng lúc effect dựng pool nhãn chạy, và
   * effect đó sẽ không bao giờ chạy lại — nhãn biến mất VĨNH VIỄN, không một
   * lỗi nào được ném. State thì đánh thức effect khi phần tử xuất hiện. Bẫy này
   * đã ghi ở `k8s-arena/scene/scene-labels.tsx:33-39`; lane D chép đúng cách
   * nhận, và chỗ duy nhất còn có thể phá nó là ngay đây.
   */
  const [labelLayer, setLabelLayer] = useState<HTMLDivElement | null>(null);
  const [bloomMesh, setBloomMesh] = useState<THREE.InstancedMesh | null>(null);

  /*
   * Phần tử dò màu do gốc hợp thành sở hữu, không để `GitCanvas` tự dựng.
   *
   * `useGitSceneColors` phải chạy NGOÀI `<Canvas>` (nó đụng `document` và
   * `MutationObserver`), mà `useGitSceneProbe()` là một context consumer nên
   * chỉ đọc được từ BÊN TRONG. Truyền `probeRef` vào là cách duy nhất để cùng
   * một phần tử phục vụ cả hai phía.
   *
   * ⚠ `<span>` phải được RENDER thật — không `display: none`, không
   * `visibility: hidden`. Phần tử không render thì `getComputedStyle` không trả
   * used value, và cả cảnh rơi về màu xám dự phòng.
   */
  const probeRef = useRef<HTMLElement | null>(null);
  const { colors, version } = useGitSceneColors(probeRef, reportGitSceneColorsDegraded);

  const placement = useMemo(() => place3d(scene), [scene]);

  const warn = useCallback(
    (message: string) => {
      if (onWarning !== undefined) onWarning(message);
      else console.warn(`[git-scene-3d] ${message}`);
    },
    [onWarning],
  );

  /*
   * Bất biến "X dùng chung cho cả hai kho" được ĐO chứ không được khai — xem
   * `depthDisagreementOf()`. Khác 0 nghĩa là cạnh `remote-mirror` đi chéo thay
   * vì thẳng theo Z, và nó đi chéo đúng ở những level dạy push/fetch. Phát ra,
   * đừng nuốt.
   */
  const disagreement = placement.depthDisagreement;
  useEffect(() => {
    if (disagreement > 0) {
      warn(
        `${String(disagreement)} commit có mặt ở cả hai kho nhưng đứng ở hai mốc thời gian ` +
          'khác nhau. Cạnh nối hai kho sẽ đi chéo thay vì thẳng theo Z.',
      );
    }
  }, [disagreement, warn]);

  /** Bốn trường hợp đồng, dựng một lần và truyền nguyên vẹn xuống mọi tầng. */
  const layer: Scene3DLayerProps = useMemo(
    () => ({
      placement,
      view: scene.view,
      interaction: scene.interaction,
      layouts: scene.layouts,
    }),
    [placement, scene.view, scene.interaction, scene.layouts],
  );

  return (
    <div className="relative h-full w-full">
      <span
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      <GitCanvas
        placement={placement}
        view={scene.view}
        label={label}
        probeRef={probeRef}
        colorsVersion={version}
      >
        <RepoBlocks {...layer} colors={colors} colorsVersion={version} />
        <LaneEdges {...layer} colors={colors} colorsVersion={version} />
        <CommitInstances
          {...layer}
          colors={colors}
          colorsVersion={version}
          onBloomMesh={setBloomMesh}
        />
        <HitProxy {...layer} />
        <FilePlates {...layer} colors={colors} onWarning={warn} />
        <SceneLabels3D {...layer} layer={labelLayer} />

        {effects && bloomMesh !== null && (
          /*
           * Selective bloom, CHỈ cho `head` — quyết định của chủ dự án khi ánh
           * xạ K.10 ("chỉ cho `running`", một trạng thái của game K8s) sang game
           * Git.
           *
           * Chọn được chính xác vì `head` là accent DUY NHẤT dùng khối `ringed`,
           * nên lô instance đó bằng đúng tập commit cần phát sáng.
           *
           * ⚠ Đó là một sự trùng khớp có điều kiện, không phải một bảo đảm: nếu
           * một accent thứ hai nhận khối `ringed`, lô này sẽ phát sáng cả nó.
           * `accent-3d.test.ts` gác chuyện chỉ MỘT accent bật `bloom`, nhưng
           * KHÔNG gác chuyện khối của nó là duy nhất. Khe hở đó có thật; chỗ
           * chữa là `accent-3d`, không phải ở đây.
           */
          <EffectComposer multisampling={4} enableNormalPass={false}>
            <SelectiveBloom
              selection={[bloomMesh]}
              luminanceThreshold={0.15}
              luminanceSmoothing={0.22}
              intensity={0.9}
              radius={0.55}
              mipmapBlur
            />
          </EffectComposer>
        )}
      </GitCanvas>

      {/*
       * Lớp nhãn: phủ toàn bộ canvas, KHÔNG bắt chuột (mọi cú bấm phải xuống
       * tới `HitProxy` bên dưới), và `overflow-hidden` để nhãn của node đã trôi
       * ra ngoài khung không kéo giãn trang.
       *
       * ⛔ **KHÔNG `aria-hidden` ở đây.** Chữ DOM đọc được bằng trình đọc màn
       * hình là LÝ DO chọn pool `<span>` thay vì `drei <Html>` hay texture
       * canvas; ẩn cả lớp đi là vứt bỏ đúng thứ đã trả giá để có, và ô AC-6 mất
       * cùng lúc. `<Canvas>` bên dưới mang `role="img"` + `aria-label` cho phần
       * hình; lớp này mang phần chữ.
       */}
      <div
        ref={setLabelLayer}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </div>
  );
}
