'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { HalfFloatType, type Material, type Mesh, NeutralToneMapping, type Texture, WebGLRenderTarget } from 'three';
import { gsap } from '../motion/gsap';
import { canvasWanted } from '../motion/store';
import { Effects } from './effects';
import { readFontFamily, readPalette, type StagePalette } from './palette';
import { downgrade, initialTier, rendererName, SOFTWARE_RENDERER, TIER_DPR, type QualityTier } from './quality';
import { Scene, type SceneFonts } from './scene';
import styles from './stage.module.css';

export interface StageCanvasProps {
  readonly onReady: () => void;
  readonly onLost: () => void;
}

/**
 * Canvas 3D của landing. `frameloop="never"`: R3F không tự chạy rAF; `Driver` gọi `advance()`
 * từ `gsap.ticker`, tức cùng nhịp với Lenis. Khi không khu trong suốt nào đang lộ (người dùng ở
 * phần thẻ, lộ trình, trò chơi) hoặc tab bị ẩn, ticker bỏ qua lượt vẽ: GPU nghỉ hẳn.
 */
export default function StageCanvas({ onReady, onLost }: StageCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<StagePalette | null>(null);
  const [fonts, setFonts] = useState<SceneFonts | null>(null);
  const [tier, setTier] = useState<QualityTier>('high');
  const [ready, setReady] = useState(false);
  const [warm, setWarm] = useState(false);
  const callbacks = useRef({ onReady, onLost });
  callbacks.current = { onReady, onLost };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const read = readPalette(host);
    if (read === null) {
      callbacks.current.onLost();
      return;
    }
    setPalette(read);
    setFonts({
      mono: readFontFamily(host, '--font-jetbrains-mono', 'ui-monospace, monospace'),
      display: readFontFamily(host, '--font-archivo', 'sans-serif'),
    });
    setTier(initialTier());
  }, []);

  return (
    <div ref={hostRef} className={styles.host} data-ready={ready ? 'true' : 'false'}>
      {palette !== null && fonts !== null ? (
        <Canvas
          frameloop="never"
          dpr={[TIER_DPR[tier][0], TIER_DPR[tier][1]]}
          gl={{ antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' }}
          camera={{ fov: 42, near: 0.1, far: 560, position: [-12, 10.5, 36] }}
          onCreated={(state) => {
            state.gl.toneMapping = NeutralToneMapping;
            /* Production không hỏi trạng thái link đồng bộ: mỗi lần hỏi là một lần chờ GPU. */
            state.gl.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
            /* Tự reset để đếm draw call của CẢ khung (cảnh + mọi pass hậu kỳ), không phải pass cuối. */
            state.gl.info.autoReset = false;
            const name = rendererName(state.gl.getContext());
            state.gl.domElement.dataset.renderer = name;
            if (SOFTWARE_RENDERER.test(name)) setTier('low');
            state.gl.domElement.addEventListener(
              'webglcontextlost',
              (event) => {
                event.preventDefault();
                console.warn('[landing] WebGL context lost, showing the static map');
                callbacks.current.onLost();
              },
              { once: true },
            );
          }}
        >
          <Driver
            enabled={warm}
            onFirstFrame={() => {
              setReady(true);
              callbacks.current.onReady();
            }}
          />
          <PerformanceMonitor flipflops={3} onDecline={() => setTier((current) => downgrade(current))} />
          <Scene palette={palette} fonts={fonts} tier={tier} />
          {tier === 'low' ? null : <Effects tier={tier} />}
          <Warmup onWarm={() => setWarm(true)} />
        </Canvas>
      ) : null}
    </div>
  );
}

/**
 * Biên dịch TRƯỚC mọi shader và tải sẵn mọi texture, rồi mới cho vẽ khung đầu.
 *
 * Đo 2026-10-03 trên RTX 4060: thiếu bước này, mỗi ga link shader của nó lúc lần đầu lọt vào
 * khung hình, và three chờ trạng thái link đồng bộ (`GetProgramiv` 214 ms): một khung 246 đến
 * 288 ms ngay giữa lúc người dùng đang cuộn. `compile()` duyệt MỌI vật liệu, kể cả của vật thể
 * đang ẩn (ga ở xa, container chưa đóng); `compileAsync` dùng KHR_parallel_shader_compile nên
 * không chặn luồng chính trong lúc chờ.
 *
 * ⚠ Biến thể shader phụ thuộc ĐÍCH VẼ: vẽ ra màn hình thì có tone mapping và sRGB, vẽ vào render
 * target (đường của EffectComposer) thì không. Biên dịch trước chỉ cho màn hình là biên dịch
 * nhầm biến thể: đo lại sau bản sửa đầu, khung tệ nhất vẫn 333 ms ở đúng chỗ cũ. Nên biên dịch
 * cả hai: vào một render target (tầng có hậu kỳ) và ra màn hình (tầng thấp, không hậu kỳ).
 */
function Warmup({ onWarm }: { readonly onWarm: () => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const notify = useRef(onWarm);
  notify.current = onWarm;

  useEffect(() => {
    let alive = true;
    const textures = new Set<Texture>();
    scene.traverse((object) => {
      const material = (object as Partial<Mesh>).material;
      const materials: Material[] = Array.isArray(material) ? material : material === undefined ? [] : [material];
      for (const entry of materials) {
        const map = (entry as Material & { map?: Texture | null }).map;
        if (map !== undefined && map !== null) textures.add(map);
      }
    });
    textures.forEach((texture) => gl.initTexture(texture));
    const offscreen = new WebGLRenderTarget(4, 4, { type: HalfFloatType });
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(offscreen);
    const viaComposer = gl.compileAsync(scene, camera);
    gl.setRenderTarget(previous);
    const viaScreen = gl.compileAsync(scene, camera);
    Promise.all([viaComposer, viaScreen])
      .catch((error: unknown) => console.warn('[landing] shader precompile failed, compiling lazily', error))
      .finally(() => {
        offscreen.dispose();
        if (alive) notify.current();
      });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera]);

  return null;
}

function Driver({ enabled, onFirstFrame }: { readonly enabled: boolean; readonly onFirstFrame: () => void }) {
  const advance = useThree((state) => state.advance);
  const gl = useThree((state) => state.gl);
  const drawn = useRef(false);
  const notify = useRef(onFirstFrame);
  notify.current = onFirstFrame;

  useEffect(() => {
    if (!enabled) return undefined;
    let frame = 0;
    const tick = () => {
      if (drawn.current && (!canvasWanted() || document.visibilityState !== 'visible')) return;
      gl.info.reset();
      /* GIÂY, không phải mili-giây. Với `frameloop="never"`, R3F lấy thẳng đơn vị của số
         này làm `delta` và `clock.elapsedTime` cho mọi `useFrame`, và cả cảnh đều tính
         theo giây (camera snap khi `delta > 0.2`, damping `exp(-delta * 9)`, nháy con trỏ
         `time * 2.2`). Truyền `performance.now()` thô thì delta ~16,7 mỗi khung: camera
         snap ở MỌI khung và mọi thứ quay nhanh gấp ~1000 lần. */
      advance(performance.now() / 1000);
      frame += 1;
      /* Số draw call của cả khung cho e2e đo, ghi thưa để không tự làm chậm chính phép đo. */
      if (frame % 30 === 0) {
        gl.domElement.dataset.calls = String(gl.info.render.calls);
        /* Số chương trình shader: tăng trong lúc cuộn nghĩa là có biến thể lọt khỏi bước biên dịch
           trước, tức có một khung giật đang chờ người dùng. e2e so con số này trước và sau khi cuộn. */
        gl.domElement.dataset.programs = String(gl.info.programs?.length ?? 0);
      }
      if (!drawn.current) {
        drawn.current = true;
        notify.current();
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [enabled, advance, gl]);

  return null;
}
