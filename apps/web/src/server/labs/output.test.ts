import { describe, expect, it } from 'vitest';
import { LAB_OUTPUT_MAX_BYTES, truncateLabOutput } from './output';

describe('truncateLabOutput', () => {
  it('giữ nguyên output ngắn hơn trần', () => {
    expect(truncateLabOutput('ok')).toBe('ok');
  });

  it('giữ nguyên output đúng bằng trần (biên =, không cắt)', () => {
    const exact = 'a'.repeat(LAB_OUTPUT_MAX_BYTES);
    expect(truncateLabOutput(exact)).toBe(exact);
  });

  it('cắt output dài hơn trần, thêm hậu tố', () => {
    const long = 'a'.repeat(LAB_OUTPUT_MAX_BYTES + 100);
    const out = truncateLabOutput(long);
    expect(out.endsWith('\n…(đã cắt)')).toBe(true);
    expect(out.startsWith('a'.repeat(LAB_OUTPUT_MAX_BYTES))).toBe(true);
  });

  /**
   * Ca biên thật sự: một ký tự UTF-8 hai byte ('á' = 0xC3 0xA1) NẰM VẮT NGANG
   * ranh giới `LAB_OUTPUT_MAX_BYTES`. Prefix ASCII dài đúng `MAX - 1` byte, nên
   * byte kế tiếp (byte đầu của 'á') rơi đúng vào chỉ số cuối cùng còn giữ được,
   * và byte thứ hai của 'á' rơi RA NGOÀI trần — chỗ dễ cắt sai nhất.
   */
  it('lùi biên cắt khi một ký tự đa-byte vắt ngang trần — không sinh U+FFFD', () => {
    const asciiPrefix = 'a'.repeat(LAB_OUTPUT_MAX_BYTES - 1);
    const straddling = `${asciiPrefix}á thêm chữ sau để chắc chắn vượt trần`;
    const buf = Buffer.from(straddling, 'utf8');
    expect(buf.byteLength).toBeGreaterThan(LAB_OUTPUT_MAX_BYTES);

    const out = truncateLabOutput(straddling);

    // Không có ký tự thay thế lỗi decode.
    expect(out).not.toContain('�');
    // Toàn bộ 'á' (và mọi thứ sau nó) bị cắt bỏ — biên lùi về NGAY TRƯỚC nó.
    expect(out).toBe(asciiPrefix + '\n…(đã cắt)');
    // Phần nội dung giữ lại phải encode UTF-8 hợp lệ và đúng bằng prefix ASCII.
    expect(Buffer.from(out.replace('\n…(đã cắt)', ''), 'utf8').toString('utf8')).toBe(
      asciiPrefix,
    );
  });
});
