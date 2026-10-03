'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { NeutralToneMapping } from 'three';
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
            onFirstFrame={() => {
              setReady(true);
              callbacks.current.onReady();
            }}
          />
          <PerformanceMonitor flipflops={3} onDecline={() => setTier((current) => downgrade(current))} />
          <Scene palette={palette} fonts={fonts} tier={tier} />
          {tier === 'low' ? null : <Effects tier={tier} />}
        </Canvas>
      ) : null}
    </div>
  );
}

function Driver({ onFirstFrame }: { readonly onFirstFrame: () => void }) {
  const advance = useThree((state) => state.advance);
  const gl = useThree((state) => state.gl);
  const drawn = useRef(false);
  const notify = useRef(onFirstFrame);
  notify.current = onFirstFrame;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (drawn.current && (!canvasWanted() || document.visibilityState !== 'visible')) return;
      advance(performance.now());
      frame += 1;
      /* Số draw call cho e2e đo, ghi thưa để không tự làm chậm chính phép đo. */
      if (frame % 30 === 0) gl.domElement.dataset.calls = String(gl.info.render.calls);
      if (!drawn.current) {
        drawn.current = true;
        notify.current();
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [advance, gl]);

  return null;
}
