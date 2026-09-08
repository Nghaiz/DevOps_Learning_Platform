'use client';

import { useEffect, useMemo, useRef, type ReactElement, type RefObject } from 'react';
import type * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { ArenaSceneProps, QualityTier } from '../arena-contract';
import { CameraRig } from './camera-rig';
import { ClusterInstances } from './cluster-instances';
import { FramePump } from './frame-pump';
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
}: SceneContentProps): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const bodyRef = useRef<THREE.InstancedMesh | null>(null);
  const runtime = useMemo(
    () => createSceneRuntime(() => propsRef.current.getView()),
    [propsRef],
  );

  // Chọn / rê / đổi theme / đổi bậc đều là thứ NHÌN THẤY ĐƯỢC nhưng không sinh
  // ra chuyển động nào, nên không có gì khác xin khung hình hộ chúng.
  useEffect(() => {
    invalidate();
  }, [invalidate, colorsVersion, tier, selectedUid, hoveredUid]);

  return (
    <>
      <FramePump runtime={runtime} propsRef={propsRef} tier={tier} reducedMotion={reducedMotion} />
      <SceneLighting runtime={runtime} colors={colors} colorsVersion={colorsVersion} tier={tier} />
      <NodePlatforms runtime={runtime} colors={colors} colorsVersion={colorsVersion} tier={tier} />
      <ClusterInstances runtime={runtime} colors={colors} tier={tier} bodyRef={bodyRef} />
      <RelationEdges runtime={runtime} colors={colors} colorsVersion={colorsVersion} />
      <SelectionHalo
        runtime={runtime}
        propsRef={propsRef}
        colors={colors}
        colorsVersion={colorsVersion}
      />
      <CameraRig runtime={runtime} propsRef={propsRef} reducedMotion={reducedMotion} />
      <PointerPicking runtime={runtime} propsRef={propsRef} bodyRef={bodyRef} />
      <SceneLabels runtime={runtime} propsRef={propsRef} layer={labelLayer} />
      <SceneEffects tier={tier} />
    </>
  );
}
