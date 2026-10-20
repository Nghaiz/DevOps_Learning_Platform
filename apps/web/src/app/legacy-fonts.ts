import { Archivo, Be_Vietnam_Pro, JetBrains_Mono } from 'next/font/google';

/**
 * Font của giao diện CŨ, chỉ nạp ở những route còn giữ nguyên giao diện đó: landing,
 * game K8s và màn chơi Git / CI/CD. Trang mới dùng bộ font trong `app/layout.tsx`.
 *
 * Gắn `LEGACY_FONT_VARIABLES` lên một phần tử bọc (`display: contents` là đủ, biến CSS
 * vẫn kế thừa xuống). Landing đọc `--font-archivo`, `--font-be-vietnam-pro`,
 * `--font-jetbrains-mono` trực tiếp trong CSS module của nó.
 */
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin', 'vietnamese'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const LEGACY_FONT_VARIABLES = `${beVietnamPro.variable} ${archivo.variable} ${jetbrainsMono.variable}`;
