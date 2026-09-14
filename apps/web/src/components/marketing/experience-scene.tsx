'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ACESFilmicToneMapping,
  MathUtils,
  Vector3,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
  type OrthographicCamera,
} from 'three';
import type { JourneySceneProps } from './experience-contract';
import { readJourneyPalette } from './experience-palette';
import {
  CircuitPlatform,
  ContainerModule,
  PACKET_ROUTES,
  PacketRoutes,
  ServerTower,
  Workstation,
  type JourneyPalette,
} from './experience-models';

/** Owns the GPU lifecycle; the parent retains meaningful HTML when WebGL is unavailable. */
export default function ExperienceScene(props: JourneySceneProps) {
  const [colors, setColors] = useState<JourneyPalette | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const palette = readJourneyPalette(getComputedStyle(document.documentElement));
    if (palette) setColors(palette);
    else propsRef.current.onError();
  }, []);

  if (!colors) return null;

  return (
    <Canvas
      orthographic
      frameloop="demand"
      dpr={[1, 1.5]}
      shadows
      camera={{ position: [8.7, 7.8, 11.4], near: 0.1, far: 60, zoom: 70 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      aria-hidden="true"
      style={{ touchAction: 'pan-y' }}
    >
      <SceneRuntime {...props} colors={colors} />
    </Canvas>
  );
}

interface SceneRuntimeProps extends JourneySceneProps {
  readonly colors: JourneyPalette;
}

function SceneRuntime(props: SceneRuntimeProps) {
  const { camera, size, invalidate, gl, setDpr } = useThree();
  const propsRef = useRef(props);
  propsRef.current = props;
  const rig = useRef<Group>(null);
  const workstation = useRef<Group>(null);
  const container = useRef<Group>(null);
  const lid = useRef<Group>(null);
  const packageLayers = useRef<(Group | null)[]>([]);
  const trays = useRef<(Group | null)[]>([]);
  const primaryServer = useRef<Group>(null);
  const packets = useRef<(Mesh | null)[]>([]);
  const connections = useRef<(Mesh | null)[]>([]);
  const shownProgress = useRef(props.progress.current);
  const rotation = useRef<[number, number]>([0, 0]);
  const eventBlend = useRef(props.event === 'fault' ? 1 : 0);
  const rendered = useRef(false);
  const readyFrame = useRef<number | null>(null);
  const lookAt = useRef(new Vector3());

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, size.width < 640 ? 1 : 1.5));
  }, [setDpr, size.width]);

  useEffect(() => {
    propsRef.current.onInvalidateReady(() => {
      if (propsRef.current.active) invalidate();
    });
    invalidate();
    return () => {
      propsRef.current.onInvalidateReady(null);
      if (readyFrame.current !== null) cancelAnimationFrame(readyFrame.current);
    };
  }, [invalidate]);

  useEffect(() => {
    const canvas = gl.domElement;
    const contextLost = (event: Event): void => {
      event.preventDefault();
      propsRef.current.onError();
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    return () => canvas.removeEventListener('webglcontextlost', contextLost);
  }, [gl]);

  useEffect(() => {
    invalidate();
  }, [props.event, props.active, props.reducedMotion, invalidate]);

  useFrame((_, rawDelta) => {
    const current = propsRef.current;
    if (!current.active && rendered.current) return;
    const delta = Math.min(rawDelta, 0.05);
    const target = MathUtils.clamp(current.progress.current, 0, 1);
    const blend = current.reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    shownProgress.current = MathUtils.lerp(shownProgress.current, target, blend);
    const pointerX = current.reducedMotion ? 0 : current.pointer.current[0];
    const pointerY = current.reducedMotion ? 0 : current.pointer.current[1];
    rotation.current[0] = MathUtils.lerp(rotation.current[0], pointerX, blend);
    rotation.current[1] = MathUtils.lerp(rotation.current[1], pointerY, blend);
    const faultTarget = current.event === 'fault' ? 1 : 0;
    eventBlend.current = MathUtils.lerp(eventBlend.current, faultTarget, blend);
    const progress = shownProgress.current;
    const build =
      MathUtils.smoothstep(progress, 0.2, 0.4) * (1 - MathUtils.smoothstep(progress, 0.45, 0.58));
    const deploy = MathUtils.smoothstep(progress, 0.48, 0.71);
    const observe = MathUtils.smoothstep(progress, 0.73, 0.94);
    const mobile = size.width < 560;

    if (rig.current) {
      rig.current.rotation.y =
        -0.12 + build * 0.65 - deploy * 0.46 + observe * 0.91 + rotation.current[0] * 0.05;
      rig.current.rotation.x = rotation.current[1] * 0.018;
      rig.current.position.y = -0.26;
    }
    if (workstation.current) workstation.current.rotation.y = -0.14 - progress * 0.07;
    if (container.current) container.current.position.y = 0.13 + build * 0.12;
    if (lid.current) {
      lid.current.position.y = build * 1.84;
      lid.current.rotation.z = build * -0.11;
    }
    packageLayers.current.forEach((layer, index) => {
      if (layer) layer.position.y = build * (0.65 + index * 0.43);
    });
    trays.current.forEach((tray, index) => {
      if (!tray) return;
      const assemble = MathUtils.smoothstep(progress, 0.48 + index * 0.025, 0.59 + index * 0.025);
      const present = MathUtils.smoothstep(progress, 0.24, 0.45);
      tray.position.z = present * (1 - assemble) * (0.56 + index * 0.16);
      tray.position.y = present * (1 - assemble) * (0.06 + index * 0.09);
    });
    if (primaryServer.current) {
      primaryServer.current.position.y = 0.13 + Math.sin(deploy * Math.PI) * 0.55;
      primaryServer.current.rotation.z = eventBlend.current * -0.07;
    }
    PACKET_ROUTES.forEach((route, index) => {
      const packet = packets.current[index];
      if (!packet) return;
      const phase =
        index === 3 ? eventBlend.current : MathUtils.clamp((progress - index * 0.25) / 0.28, 0, 1);
      route.getPoint(phase, packet.position);
      packet.scale.setScalar(0.8 + Math.sin(phase * Math.PI) * 0.7);
      packet.visible =
        index === 3 ? eventBlend.current > 0.01 : index !== 1 || eventBlend.current < 0.3;
    });
    connections.current.forEach((connection, index) => {
      if (!connection) return;
      const material = connection.material as MeshStandardMaterial;
      if (index === 3) {
        material.opacity = eventBlend.current * 0.94;
        material.emissiveIntensity = 0.15 + eventBlend.current * 0.95;
      } else if (index === 1) {
        material.emissiveIntensity =
          (0.15 + Math.sin(deploy * Math.PI) * 0.85) * (1 - eventBlend.current);
      } else {
        const phase = MathUtils.clamp((progress - index * 0.25) / 0.28, 0, 1);
        material.emissiveIntensity = 0.12 + Math.sin(phase * Math.PI) * 0.8;
      }
    });

    // Orthographic framing preserves the sculptural silhouette across all aspect ratios.
    const ortho = camera as OrthographicCamera;
    const placement = current.placement?.current;
    ortho.zoom =
      Math.min(size.width / (mobile ? 8.7 : 9.1), size.height / 6.55) *
      (1 + build * 0.08 + deploy * 0.1 - observe * 0.12) *
      Math.max(0.01, placement?.scale ?? 1);
    camera.position.set(
      8.7 - build * 2.2 - deploy * 0.8,
      7.8 + build * 1.8 - observe * 0.7,
      11.4 + build * 0.5 + deploy * 0.8,
    );
    lookAt.current.set(
      build * 0.37 + deploy * 0.58 - observe * 0.44,
      0.59 + build * 0.35 + deploy * 0.15,
      0,
    );
    camera.lookAt(lookAt.current);
    // Shift the image in screen space instead of moving models away from their
    // lighting/shadow frustum. Placements follow natural document anchors directly.
    ortho.setViewOffset(
      size.width,
      size.height,
      -((placement?.x ?? 0.5) - 0.5) * size.width,
      -((placement?.y ?? 0.5) - 0.5) * size.height,
      size.width,
      size.height,
    );

    if (!rendered.current) {
      rendered.current = true;
      // The frame callback precedes gl.render; notify after the actual scene frame.
      readyFrame.current = requestAnimationFrame(() => {
        readyFrame.current = null;
        if (gl.domElement.isConnected) propsRef.current.onReady();
      });
    }
    const moving =
      Math.abs(shownProgress.current - target) > 0.0001 ||
      Math.abs(rotation.current[0] - pointerX) > 0.0005 ||
      Math.abs(rotation.current[1] - pointerY) > 0.0005 ||
      Math.abs(eventBlend.current - faultTarget) > 0.0005;
    if (moving && current.active && !current.reducedMotion) invalidate();
  });

  return (
    <>
      <ambientLight color={props.colors.ink} intensity={1.25} />
      <hemisphereLight
        color={props.colors.cyan}
        groundColor={props.colors.violet}
        intensity={1.35}
      />
      <directionalLight
        color={props.colors.ink}
        position={[-3, 8, 6]}
        intensity={3.4}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-normalBias={0.035}
        shadow-bias={-0.0002}
      />
      <directionalLight color={props.colors.violet} position={[5, 4, -5]} intensity={2.4} />
      <group ref={rig}>
        <CircuitPlatform colors={props.colors} />
        <group ref={workstation} position={[-2.2, 0.13, 0.67]} rotation={[0, -0.14, 0]}>
          <Workstation colors={props.colors} />
        </group>
        <group ref={container} position={[0.4, 0.13, 1.0]}>
          <ContainerModule colors={props.colors} lidRef={lid} layerRefs={packageLayers} />
        </group>
        <group ref={primaryServer} position={[2.33, 0.13, -0.62]}>
          <ServerTower
            colors={props.colors}
            accent={props.colors.mint}
            status={props.event === 'fault' ? props.colors.coral : props.colors.mint}
            trayRefs={trays}
          />
        </group>
        <group position={[0.33, 0.13, -1.03]} scale={0.82}>
          <ServerTower
            colors={props.colors}
            accent={props.colors.violet}
            status={props.colors.cyan}
          />
        </group>
        <PacketRoutes colors={props.colors} packetRefs={packets} connectionRefs={connections} />
      </group>
    </>
  );
}
