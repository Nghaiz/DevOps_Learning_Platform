import * as THREE from 'three';

/** Screen-facing dots: a flat resource color with a white, antialiased rim.
 * One Points draw call covers every relationship, including on the low tier. */
export function createEdgeMarkerMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      uniform float pixelRatio;
      attribute vec3 color;
      varying vec3 dotColor;
      void main() {
        dotColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 14.0 * pixelRatio;
      }
    `,
    fragmentShader: `
      varying vec3 dotColor;
      void main() {
        float radius = length(gl_PointCoord - 0.5);
        float aa = fwidth(radius);
        float alpha = 1.0 - smoothstep(0.48 - aa, 0.48, radius);
        if (alpha <= 0.0) discard;
        float rim = smoothstep(0.31 - aa * 0.5, 0.31 + aa * 0.5, radius);
        gl_FragColor = vec4(mix(dotColor, vec3(1.0), rim), alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
}
