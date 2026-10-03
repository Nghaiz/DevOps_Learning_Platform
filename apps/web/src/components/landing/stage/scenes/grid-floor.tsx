'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, ShaderMaterial, Vector3 } from 'three';
import { glow, type StagePalette } from '../palette';

/*
  Lưới bản vẽ kỹ thuật dưới tuyến metro: ô nhỏ 4 đơn vị, ô lớn 20 đơn vị, mờ dần theo khoảng cách
  tới camera (thay cho sương mù, vì ShaderMaterial tự viết không nhận fog của scene).
  Không dùng chỉ thị tiền xử lý nào trong GLSL: cổng tokens:check đọc một dòng có thăng-d-e-f như
  một mã màu hex.
*/
const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uMinor;
  uniform vec3 uMajor;
  uniform vec3 uCamera;
  varying vec3 vWorld;

  float gridLine(vec2 coord) {
    vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    float minor = gridLine(vWorld.xz / 4.0);
    float major = gridLine(vWorld.xz / 20.0);
    float distanceToCamera = length(vWorld.xz - uCamera.xz);
    float fade = 1.0 - smoothstep(18.0, 120.0, distanceToCamera);
    vec3 color = uMinor * minor * 0.4 + uMajor * major;
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;

export function GridFloor({ palette }: { readonly palette: StagePalette }) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uMinor: { value: palette.faint.clone().multiplyScalar(0.55) },
          uMajor: { value: glow(palette.red, 0.32) },
          uCamera: { value: new Vector3() },
        },
      }),
    [palette],
  );

  useFrame(({ camera }) => {
    const uniform = material.uniforms.uCamera;
    if (uniform !== undefined) (uniform.value as Vector3).copy(camera.position);
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -1.6, -120]} material={material}>
      <planeGeometry args={[700, 700]} />
    </mesh>
  );
}
