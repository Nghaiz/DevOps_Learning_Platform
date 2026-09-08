'use client';

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import type { ArenaSceneProps, QualityTier } from '../arena-contract';
import { CameraRig } from './camera-rig';
import { ClusterInstances } from './cluster-instances';
import { FramePump } from './frame-pump';
import { HitProxy, type HitProxyHandle } from './hit-proxy';
import { LayoutSync } from './layout-sync';
import { NodePlatforms } from './node-platforms';
import { PointerPicking } from './pointer-picking';
import { RelationEdges } from './relation-edges';
import { createSceneRuntime } from './scene-runtime';
import { SceneEffects } from './scene-effects';
import { SceneLabels } from './scene-labels';
import { SceneLighting } from './scene-lighting';
import { SelectionHalo } from './selection-halo';
import type { ArenaColors } from './use-arena-colors';

export interface SceneContentProps {
  readonly propsRef: RefObject<ArenaSceneProps>;
  readonly colors: ArenaColors;
  readonly colorsVersion: number;
  readonly tier: QualityTier;
  readonly reducedMotion: boolean;
  readonly labelLayer: HTMLDivElement | null;
  /*
   * Hai giá trị dưới đây CŨNG có trong `propsRef`, nhưng chúng phải đi qua props
   * thật thì React mới biết là có gì đổi — `propsRef` là một cái hộp, đổi ruột
   * nó không đánh thức một effect nào.
   */
  readonly selectedUid: string | null;
  readonly hoveredUid: string | null;
  readonly showLabels: boolean;
  readonly showEdges: boolean;
}

/**
 * Gốc của cây trong Canvas. Nó dựng kho trạng thái một lần rồi PHÁT xuống mọi
 * thành phần con.
 *
 * Thứ tự mount ở đây là thứ tự chạy trong vòng lặp vẽ khi hai `useFrame` có
 * cùng độ ưu tiên — nên `FramePump` đứng đầu (nó tính vị trí vẽ của khung hình
 * này), rồi tới các bộ ghi instance, rồi nhãn (chiếu ra màn hình từ chính các
 * vị trí đó). Đảo thứ tự này làm nhãn trễ một khung hình so với vật.
 */
export function SceneContent({
  propsRef,
  colors,
  colorsVersion,
  tier,
  reducedMotion,
  labelLayer,
  selectedUid,
  hoveredUid,
  showLabels,
  showEdges,
}: SceneContentProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const proxyRef = useRef<HitProxyHandle | null>(null);
  const runtime = useMemo(() => createSceneRuntime(() => propsRef.current.getView()), [propsRef]);

  // Chọn / rê / đổi theme / đổi bậc đều là thứ NHÌN THẤY ĐƯỢC nhưng không sinh
  // ra chuyển động nào, nên không có gì khác xin khung hình hộ chúng.
  useEffect(() => {
    invalidate();
  }, [invalidate, colorsVersion, tier, selectedUid, hoveredUid, showLabels, showEdges]);

  return (
    <>
      <FramePump runtime={runtime} propsRef={propsRef} tier={tier} reducedMotion={reducedMotion} />
      <SceneLighting runtime={runtime} colors={colors} colorsVersion={colorsVersion} tier={tier} />
      <NodePlatforms runtime={runtime} colors={colors} colorsVersion={colorsVersion} tier={tier} />
      <ClusterInstances runtime={runtime} colors={colors} tier={tier} />
      {/*
        Hình bao bấm được. Nằm NGAY SAU bộ ghi instance vì nó đọc cùng một
        `runtime.visible` trong cùng khung hình — đảo thứ tự thì hộp bấm trễ một
        khung so với vật, và ở tốc độ kéo bình thường chỗ trễ đó thấy được.
      */}
      <HitProxy runtime={runtime} proxyRef={proxyRef} />
      <RelationEdges
        runtime={runtime}
        colors={colors}
        colorsVersion={colorsVersion}
        visible={showEdges}
        propsRef={propsRef}
        reducedMotion={reducedMotion}
      />
      <SelectionHalo
        runtime={runtime}
        propsRef={propsRef}
        colors={colors}
        colorsVersion={colorsVersion}
      />
      <CameraRig runtime={runtime} propsRef={propsRef} reducedMotion={reducedMotion} />
      <PointerPicking runtime={runtime} propsRef={propsRef} proxyRef={proxyRef} />
      <SceneLabels runtime={runtime} propsRef={propsRef} layer={showLabels ? labelLayer : null} />
      <LayoutSync runtime={runtime} propsRef={propsRef} />
      <SceneEffects tier={tier} />
    </>
  );
}
