import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';

/**
 * Ảnh xem trước khi share link (`og:image`), dựng bằng CODE lúc build.
 *
 * VÌ SAO KHÔNG DÙNG SVG: bản trước trỏ `og:image` vào `public/og.svg`. File đó
 * hợp lệ và mở được trong trình duyệt, nhưng Facebook, LinkedIn, Slack và Zalo
 * chỉ tài liệu hoá JPEG/PNG/GIF/WEBP cho `og:image` — nên ảnh gần như chắc chắn
 * KHÔNG hiện ở đúng những nơi người ta share. Hỏng ở phía im lặng: link vẫn mở
 * được, chỉ là trống trơn, và không có gì trong build báo điều đó.
 *
 * VÌ SAO VẪN KHÔNG VI PHẠM LỆNH CẤM SINH ẢNH BẰNG MODEL (phase-16.md 16.A.10):
 * `ImageResponse` render JSX thành PNG bằng Satori + resvg lúc build. Đây là
 * hình học và chữ do mã quyết định, không phải một ảnh raster do model vẽ ra rồi
 * commit. Cùng tinh thần với motif ellipse: hình học thắng minh hoạ.
 *
 * ⚠ MÀU VIẾT THẲNG Ở ĐÂY LÀ CỐ Ý, và file này nằm trong `KNOWN_HARDCODED` của
 * `scripts/check-design-tokens.mjs`. Satori nhận màu qua thuộc tính style của
 * JS, KHÔNG chạy CSS cascade — nó không phân giải `var(--brand-navy)` và cũng
 * không hiểu `oklch()`. Đây là ranh giới thư viện ngoài đúng nghĩa, cùng loại
 * với `packages/terminal/src/themes.ts` (xterm.js), không phải một chỗ lười.
 * Ba giá trị dưới đây LẤY TỪ token thương hiệu trong `globals.css`, đã quy đổi
 * sang hex: `--brand-navy` `#051A53`, nền chữ trắng, và `#C8D2E6` cho dòng phụ.
 *
 * ⚠ FONT PHẢI LÀ TTF/OTF/WOFF — Satori KHÔNG đọc woff2. Đó là lý do
 * `og-fonts/*.ttf` được commit thay vì tái dùng bản woff2 mà `next/font/google`
 * đã tải: hai định dạng không thay nhau được, và bản subset woff2 nhẹ hơn sẽ
 * làm route này ném lỗi lúc build chứ không âm thầm rơi về font khác.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'DevOps Learning Platform — học DevOps bằng lab sandbox chạy thật';

const BRAND_NAVY = '#051A53';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = '#C8D2E6';
const BRAND_RED = '#DE221A';

async function loadFont(weight: 400 | 700): Promise<ArrayBuffer> {
  const url = new URL(`./og-fonts/be-vietnam-pro-${weight}.ttf`, import.meta.url);
  const buf = await readFile(url);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export default async function OpengraphImage(): Promise<ImageResponse> {
  const [regular, bold] = await Promise.all([loadFont(400), loadFont(700)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          backgroundColor: BRAND_NAVY,
          padding: '90px',
          fontFamily: 'Be Vietnam Pro',
        }}
      >
        {/*
         * Cung ellipse của motif — cùng hình học với `packages/motion/motif`,
         * viết thẳng ra `d` vì Satori không nhận `<svg>` lồng phức tạp qua
         * component. Nghiêng đã nướng vào toạ độ, giống lý do motif không phát
         * `transform="rotate(...)"`.
         */}
        <div style={{ display: 'flex', position: 'absolute', top: 48, right: 72 }}>
          <svg width="330" height="330" viewBox="0 0 100 100">
            <path
              d="M 40.262 18.044 A 42 30 22 1 0 79.203 33.778"
              fill="none"
              stroke={BRAND_RED}
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.45"
            />
          </svg>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 60,
            fontWeight: 700,
            color: TEXT_PRIMARY,
            lineHeight: 1.1,
          }}
        >
          DevOps Learning Platform
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 20,
            fontSize: 30,
            fontWeight: 400,
            color: TEXT_SECONDARY,
          }}
        >
          Học DevOps bằng lab sandbox chạy thật
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Be Vietnam Pro', data: regular, weight: 400, style: 'normal' },
        { name: 'Be Vietnam Pro', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
