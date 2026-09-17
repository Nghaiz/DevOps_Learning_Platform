// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CICD_LEVELS } from '@devops-platform/games';

import { CicdLevelScreen } from './cicd-level-screen.tsx';
import { CICD_SCENE_TESTIDS } from './scene-props.ts';
import { RENDERER_MODE_STORAGE_KEY } from '../shared/renderer-mode.ts';

/**
 * Màn chơi CI/CD sau khi dựng lại theo bố cục toàn màn hình (19.D.4).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THỨ ĐO ĐƯỢC Ở ĐÂY, VÀ THỨ KHÔNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ **jsdom không dựng bố cục.** `getBoundingClientRect()` trả 0 ở mọi phần tử,
 * nên một ô "sân chiếm 100dvh" viết ở đây sẽ XANH kể cả khi bố cục vẫn là lưới
 * chia đôi kiểu cũ. Chỗ đo hình học là AC-D7, bằng Playwright, và nó là việc của
 * lead. Ô ở đây đo phần jsdom đo được THẬT:
 *
 * - sân chơi tồn tại dưới đúng móc `CICD_SCENE_TESTIDS.field` mà AC-D7 sẽ đo;
 * - thu hết lớp phủ thì KHÔNG còn bảng nào trong DOM (vế "sân trống hoàn toàn"
 *   của quyết định #3) — và quan trọng hơn: chúng biến khỏi DOM chứ không chỉ
 *   bị ẩn bằng thuộc tính `hidden`, thứ THUA mọi class `display` của tác giả;
 * - bảng ba trục thường trực, không cần bấm gì;
 * - nút 2D/3D theo đúng luật "lựa chọn tay thắng kết quả dò".
 */

const LEVEL = CICD_LEVELS[0]!;

/** Bộ dò WebGL2 đọc `document.createElement('canvas').getContext('webgl2')`. */
function stubWebgl(available: boolean): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => (available ? ({} as never) : null) as never,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderScreen(): void {
  render(<CicdLevelScreen level={LEVEL} theory={null} onExit={() => {}} />);
}

describe('bố cục toàn màn hình', () => {
  it('sân chơi mang đúng móc đo của AC-D7', () => {
    stubWebgl(false);
    renderScreen();
    expect(screen.getByTestId(CICD_SCENE_TESTIDS.field)).toBeTruthy();
  });

  it('thu hết lớp phủ thì sân còn trống hoàn toàn', () => {
    stubWebgl(false);
    renderScreen();

    // Mở sẵn theo mặc định: ô soạn + đề bài + bản đồ.
    expect(screen.queryByTestId('cicd-panel-editor')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thu hết' }));

    for (const id of [
      'cicd-panel-editor',
      'cicd-panel-mission',
      'cicd-panel-inspector',
      'cicd-panel-result',
      'cicd-panel-tools',
      'cicd-panel-learn',
      'cicd-panel-minimap',
    ]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }

    // Sân vẫn ở đó — thu bảng không được thu luôn thứ đang chơi.
    expect(screen.getByTestId(CICD_SCENE_TESTIDS.field)).toBeTruthy();
  });

  it('bảng ba trục thường trực: không phải bấm gì để thấy nó', () => {
    stubWebgl(false);
    renderScreen();
    // Kể cả sau khi thu HẾT lớp phủ — ba trục không phải một lớp phủ.
    fireEvent.click(screen.getByRole('button', { name: 'Thu hết' }));
    expect(screen.getByTestId(CICD_SCENE_TESTIDS.axesPanel)).toBeTruthy();
  });
});

describe('nút 2D/3D — lựa chọn tay thắng kết quả dò', () => {
  function modeButton(label: '2D' | '3D'): HTMLElement {
    return screen.getByRole('button', { name: label });
  }

  it('chọn 2D trên máy CÓ WebGL2 vẫn giữ 2D', () => {
    /*
     * Ba lý do chọn 2D không liên quan gì tới phần cứng: trình đọc màn hình,
     * ảnh in, test tự động. Một bộ dò đè lên lựa chọn tay sẽ đá người dùng ra
     * khỏi chế độ họ cần, mỗi lần tải trang, và không nói vì sao.
     */
    localStorage.setItem(RENDERER_MODE_STORAGE_KEY, '2d');
    stubWebgl(true);
    renderScreen();

    expect(modeButton('2D').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton('3D').getAttribute('aria-pressed')).toBe('false');
  });

  it('chọn 3D trên máy có WebGL2 thì sang 3D', () => {
    localStorage.setItem(RENDERER_MODE_STORAGE_KEY, '3d');
    stubWebgl(true);
    renderScreen();

    expect(modeButton('3D').getAttribute('aria-pressed')).toBe('true');
  });

  it('chọn 3D trên máy ĐÃ ĐO ĐƯỢC là không có WebGL2 thì rơi về 2D', () => {
    localStorage.setItem(RENDERER_MODE_STORAGE_KEY, '3d');
    stubWebgl(false);
    renderScreen();

    expect(modeButton('2D').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton('3D').getAttribute('aria-pressed')).toBe('false');
  });

  it('bấm nút ghi nhớ lựa chọn xuống máy người chơi', () => {
    stubWebgl(true);
    renderScreen();

    fireEvent.click(modeButton('3D'));
    expect(localStorage.getItem(RENDERER_MODE_STORAGE_KEY)).toBe('3d');

    fireEvent.click(modeButton('2D'));
    expect(localStorage.getItem(RENDERER_MODE_STORAGE_KEY)).toBe('2d');
  });
});
