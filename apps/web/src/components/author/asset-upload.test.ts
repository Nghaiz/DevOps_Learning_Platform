import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_ASSET_BYTES } from '@devops-platform/shared-types/authoring';
import {
  assetMarkdownSnippet,
  bytesToBase64,
  extensionOf,
  formatBytes,
  validateAssetFile,
} from './asset-upload';

describe('extensionOf', () => {
  it('lấy đuôi CUỐI, chữ thường', () => {
    expect(extensionOf('anh.PNG')).toBe('.png');
    expect(extensionOf('kho.tar.gz')).toBe('.gz');
  });

  it('tên bắt đầu bằng dấu chấm là file ẩn, KHÔNG có đuôi', () => {
    expect(extensionOf('.png')).toBe('');
  });

  it('không có dấu chấm thì không có đuôi', () => {
    expect(extensionOf('README')).toBe('');
  });
});

describe('validateAssetFile', () => {
  it('nhận ảnh trong allowlist', () => {
    expect(validateAssetFile({ name: 'so-do.png', size: 1024 })).toBeNull();
    expect(validateAssetFile({ name: 'anh.WEBP', size: 1024 })).toBeNull();
  });

  it('từ chối SVG — allowlist của server cố ý không có nó', () => {
    expect(validateAssetFile({ name: 'x.svg', size: 100 })?.message).toContain('Chỉ nhận');
  });

  it('từ chối tệp rỗng kèm việc phải làm tiếp', () => {
    expect(validateAssetFile({ name: 'x.png', size: 0 })?.message).toContain('Chọn lại');
  });

  it('trần đọc từ hằng số của shared-types, không từ một con số gõ tay ở FE', () => {
    expect(validateAssetFile({ name: 'x.png', size: MAX_CONTENT_ASSET_BYTES })).toBeNull();
    const over = validateAssetFile({ name: 'x.png', size: MAX_CONTENT_ASSET_BYTES + 1 });
    expect(over?.message).toContain('2.0 MB');
    expect(over?.message).toContain('Nén ảnh');
  });
});

describe('formatBytes', () => {
  it('B / KB / MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('bytesToBase64', () => {
  it('mã hoá đúng', () => {
    expect(bytesToBase64(new Uint8Array([72, 101, 108, 108, 111]))).toBe('SGVsbG8=');
  });

  it('mảng rỗng ra chuỗi rỗng', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });

  /**
   * Đối chứng cho phép chia khối: một `String.fromCharCode(...bytes)` một phát
   * sẽ ném `RangeError` ở cỡ này, và lỗi đó KHÔNG lộ ra với ảnh nhỏ.
   */
  it('tệp 2 MB không làm tràn ngăn xếp', () => {
    const big = new Uint8Array(MAX_CONTENT_ASSET_BYTES).fill(65);
    const encoded = bytesToBase64(big);
    expect(encoded.length).toBe(Math.ceil(MAX_CONTENT_ASSET_BYTES / 3) * 4);
  });

  it('chuỗi base64 vẫn nằm dưới trần độ dài mà uploadAsset khai', () => {
    const big = new Uint8Array(MAX_CONTENT_ASSET_BYTES).fill(1);
    expect(bytesToBase64(big).length).toBeLessThanOrEqual(Math.ceil((MAX_CONTENT_ASSET_BYTES * 4) / 3) + 8);
  });
});

describe('assetMarkdownSnippet', () => {
  it('đường dẫn dùng storageKey, tên file gốc chỉ vào ALT', () => {
    const key = 'a'.repeat(32);
    expect(assetMarkdownSnippet({ filename: 'sơ đồ.png', storageKey: key })).toBe(
      `![sơ đồ.png](./assets/${key})`,
    );
  });

  it('tên file KHÔNG bao giờ lọt vào đường dẫn', () => {
    const snippet = assetMarkdownSnippet({ filename: '../../etc/passwd.png', storageKey: 'b'.repeat(32) });
    expect(snippet).toContain(`./assets/${'b'.repeat(32)}`);
    expect(snippet).not.toContain('../../etc/passwd.png)');
  });
});
