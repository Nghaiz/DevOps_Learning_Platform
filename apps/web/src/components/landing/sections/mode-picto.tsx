import type { ModeId } from '../content';

/** Ô đích của ba pod trong pictogram trò chơi (góc trên trái, khớp tâm ba node bên dưới). */
export const POD_TARGETS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 23, y: 51 },
  { x: 55, y: 51 },
  { x: 87, y: 51 },
];
/** Nơi pod xuất phát, trên làn chờ phía trên. */
export const POD_START = { x: 4, y: 6 };

/**
 * Pictogram nét mảnh cho bốn cửa vào học. Mỗi phần tử có `data-*` để timeline trong `modes.tsx`
 * tìm ra và cho chạy vòng lặp: dấu tích tự vẽ, dòng lệnh tự gõ, pod trượt lên node.
 * Nét vuông góc (`strokeLinecap="square"`) cho đồng bộ với ngôn ngữ góc sắc của app.
 */
export function ModePicto({ id }: { readonly id: ModeId }) {
  return (
    <svg
      viewBox="0 0 120 80"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {id === 'lesson' ? <LessonPicto /> : null}
      {id === 'lab' ? <LabPicto /> : null}
      {id === 'playground' ? <PlaygroundPicto /> : null}
      {id === 'game' ? <GamePicto /> : null}
    </svg>
  );
}

function LessonPicto() {
  return (
    <>
      {[14, 36, 58].map((y) => (
        <g key={y}>
          <rect x="16" y={y} width="12" height="12" />
          <path d={`M19 ${y + 6}L22 ${y + 9}L27 ${y + 2}`} data-tick strokeWidth={2.4} />
          <path d={`M38 ${y + 6}H96`} opacity={0.4} />
        </g>
      ))}
    </>
  );
}

function LabPicto() {
  return (
    <>
      <rect x="10" y="10" width="78" height="56" />
      <path d="M10 22H88" opacity={0.4} />
      <path d="M20 36L28 42L20 48" />
      <path d="M34 48H70" data-typing />
      <g data-stamp>
        <rect x="80" y="42" width="30" height="30" transform="rotate(45 95 57)" />
        <path d="M88 57L93 62L102 52" strokeWidth={2.6} />
      </g>
    </>
  );
}

function PlaygroundPicto() {
  return (
    <g data-cube>
      <path d="M60 8L96 26V58L60 76L24 58V26Z" />
      <path d="M24 26L60 44L96 26 M60 44V76" opacity={0.55} />
      <path d="M52 30H62" data-cursor strokeWidth={3} />
    </g>
  );
}

function GamePicto() {
  return (
    <>
      {[16, 48, 80].map((x) => (
        <rect key={x} x={x} y="46" width="26" height="22" opacity={0.6} />
      ))}
      <path d="M10 12H110" opacity={0.25} />
      {POD_TARGETS.map((target, index) => (
        <rect key={index} x={target.x} y={target.y} width="12" height="12" data-pod={index} />
      ))}
    </>
  );
}
