import { Archivo, JetBrains_Mono } from 'next/font/google';

/**
 * Hai font riêng của landing, cùng tên biến với layout gốc mới của phiên FE (00) để khi
 * layout gốc nạp chung thì file này bị gỡ mà CSS không phải sửa dòng nào.
 *
 * Archivo nạp bản variable kèm trục `wdth` (62..125): tiêu đề co giãn độ rộng theo cuộn,
 * nên cần cả trục chứ không phải vài weight tĩnh. Cả hai font đều có subset `vietnamese`;
 * thiếu nó thì dấu nặng, ngã, ơ, ư rơi về font hệ thống ngay giữa một chữ.
 */
export const archivo = Archivo({
  subsets: ['latin', 'vietnamese'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const LANDING_FONT_CLASS = `${archivo.variable} ${jetbrainsMono.variable}`;
