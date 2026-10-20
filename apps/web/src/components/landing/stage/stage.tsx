'use client';

import { Component, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useMotionMode } from '../motion/motion-provider';
import { webglAvailable } from './quality';
import { StaticArt } from './static-art';
import styles from './stage.module.css';

/*
  three/R3F/postprocessing CHỈ vào trang qua đúng import động này. Không file nào ngoài
  `stage-canvas.tsx` và các cảnh của nó được import 'three': `/login` có liên kết về `/`, và một
  import tĩnh sẽ kéo engine 3D vào bundle chung (e2e bundle-boundary gác đúng điều đó).
*/
const StageCanvas = dynamic(() => import('./stage-canvas'), { ssr: false });

/** Quá ngần này mà cảnh chưa vẽ được khung đầu thì coi như hỏng, đưa hình tĩnh lên. */
const LOAD_TIMEOUT_MS = 15_000;

export type SceneState = 'idle' | 'loading' | 'ready' | 'fallback';

class SceneBoundary extends Component<{ readonly onError: () => void; readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[landing] 3D stage failed, showing the static map instead', error);
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function Stage() {
  const mode = useMotionMode();
  const [state, setState] = useState<SceneState>('idle');

  useEffect(() => {
    if (mode === 'pending') return undefined;
    if (mode === 'reduced') {
      setState('fallback');
      return undefined;
    }
    if (!webglAvailable()) {
      console.warn('[landing] WebGL2 unavailable, showing the static map');
      setState('fallback');
      return undefined;
    }
    setState('loading');
    const timer = window.setTimeout(() => {
      setState((current) => (current === 'loading' ? 'fallback' : current));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const mount = mode === 'full' && (state === 'loading' || state === 'ready');

  return (
    <div className={styles.stage} aria-hidden={state === 'fallback' ? undefined : true} data-testid="landing-stage" data-scene-state={state}>
      <StaticArt visible={state !== 'ready'} />
      {mount ? (
        <SceneBoundary onError={() => setState('fallback')}>
          <StageCanvas onReady={() => setState('ready')} onLost={() => setState('fallback')} />
        </SceneBoundary>
      ) : null}
    </div>
  );
}
