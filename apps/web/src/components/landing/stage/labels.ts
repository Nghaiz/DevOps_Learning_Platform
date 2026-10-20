import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * Nhãn chữ trên vật thể 3D, vẽ bằng canvas 2D rồi dùng làm texture. Không dùng `<Text>` của drei:
 * troika tải font mặc định từ CDN và chạy worker blob:, cả hai đều bị CSP của app chặn
 * (`connect-src 'self'`, không có `worker-src`).
 */
export interface LabelSpec {
  readonly text: string;
  readonly sub?: string;
  readonly color: string;
  readonly subColor?: string;
  readonly background?: string;
  readonly accent?: string;
  readonly family: string;
  readonly weight?: number;
  readonly width?: number;
  readonly height?: number;
}

export const LABEL_ASPECT = (spec: LabelSpec): number => (spec.width ?? 1024) / (spec.height ?? 256);

function paint(canvas: HTMLCanvasElement, spec: LabelSpec): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  if (spec.background !== undefined) {
    context.fillStyle = spec.background;
    context.fillRect(0, 0, width, height);
  }
  const pad = height * 0.16;
  let x = pad;
  if (spec.accent !== undefined) {
    context.fillStyle = spec.accent;
    context.fillRect(0, 0, height * 0.08, height);
    x += height * 0.08;
  }
  context.textBaseline = 'middle';
  const main = spec.sub === undefined ? height * 0.5 : height * 0.4;
  context.font = `${spec.weight ?? 700} ${Math.round(height * 0.42)}px ${spec.family}`;
  context.fillStyle = spec.color;
  context.fillText(spec.text, x, main, width - x - pad);
  if (spec.sub !== undefined) {
    context.font = `500 ${Math.round(height * 0.2)}px ${spec.family}`;
    context.fillStyle = spec.subColor ?? spec.color;
    context.fillText(spec.sub, x, height * 0.78, width - x - pad);
  }
}

export function labelTexture(spec: LabelSpec): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = spec.width ?? 1024;
  canvas.height = spec.height ?? 256;
  paint(canvas, spec);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  /* Font web có thể chưa tải xong lúc vẽ lần đầu: vẽ lại khi nó tới, đúng một lần. */
  void document.fonts
    ?.load(`${spec.weight ?? 700} 32px ${spec.family}`)
    .then(() => {
      paint(canvas, spec);
      texture.needsUpdate = true;
    })
    .catch((error: unknown) => console.warn('[landing] label font failed to load', error));
  return texture;
}
