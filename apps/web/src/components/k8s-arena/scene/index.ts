/**
 * Cửa ra duy nhất của lane cảnh 3D.
 *
 * ⚠ Mọi thứ dưới đây kéo theo `three`. Bên gọi PHẢI nạp qua `next/dynamic` với
 * `ssr: false` — cổng e2e khẳng định `three` không xuất hiện trong bundle của
 * bất kỳ trang nào ngoài trang game, và một import tĩnh làm đỏ ô đó.
 */
export { ArenaScene } from './arena-scene';
export type { ArenaSceneStats } from './frame-pump';
