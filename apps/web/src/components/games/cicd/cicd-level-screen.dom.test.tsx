// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
/**
 * Level đầu tiên của chương CD — C15 trong kế hoạch.
 *
 * Tìm theo `chapter` chứ KHÔNG ghim `'cicd-c15-...'`: id là định danh, và một
 * ngày nào đó chương CD có thể mở bằng một level khác. Ghim id thì ô này đỏ vì
 * một lý do không liên quan gì tới thứ nó đo.
 */
const CD_LEVEL = CICD_LEVELS.find((level) => level.chapter === 'cd')!;
const INTRO_KEY = 'dlp:games:cicd:axis-intro:cd';

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

function renderScreen(level = LEVEL): void {
  render(<CicdLevelScreen level={level} theory={null} onExit={() => {}} />);
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

describe('màn chuyển tiếp trục Y (D.5.1)', () => {
  it('tự hiện khi vào chương CD lần đầu', () => {
    stubWebgl(false);
    renderScreen(CD_LEVEL);

    const intro = screen.getByTestId('cicd-axis-intro');
    /*
     * Tìm TRONG màn chuyển tiếp, không tìm cả trang: chú thích của bản đồ thu
     * nhỏ cũng mang chữ "dải môi trường", nên một phép tìm toàn trang sẽ xanh
     * kể cả khi màn này rỗng.
     */
    expect(within(intro).getByText(/dải môi trường/)).toBeTruthy();
  });

  it('KHÔNG hiện ở chương CI — ở đó không có nghĩa cũ nào để học lại', () => {
    stubWebgl(false);
    renderScreen();
    expect(screen.queryByTestId('cicd-axis-intro')).toBeNull();
  });

  it('bỏ qua được, và không hiện lại ở lần sau', () => {
    stubWebgl(false);
    renderScreen(CD_LEVEL);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));
    expect(screen.queryByTestId('cicd-axis-intro')).toBeNull();
    expect(localStorage.getItem(INTRO_KEY)).not.toBeNull();

    cleanup();
    renderScreen(CD_LEVEL);
    expect(screen.queryByTestId('cicd-axis-intro')).toBeNull();
  });

  it('mở lại được từ nút Trợ giúp, ở CẢ chương CI', () => {
    stubWebgl(false);
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: /Trợ giúp/ }));
    expect(screen.getByTestId('cicd-axis-intro')).toBeTruthy();
    // Chương CI đọc chiều dọc là thời gian chờ hàng đợi.
    expect(screen.getByText(/thời gian chờ hàng đợi/)).toBeTruthy();
  });
});

describe('phím tắt (D.4.8)', () => {
  it('phím E bật/tắt ô soạn', () => {
    stubWebgl(false);
    renderScreen();

    expect(screen.queryByTestId('cicd-panel-editor')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.queryByTestId('cicd-panel-editor')).toBeNull();
    // Thu rồi thì tay nắm mép trái là đường mở lại đứng ngay chỗ nó vừa biến mất.
    expect(screen.getByTestId('cicd-editor-handle')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'e' });
    expect(screen.queryByTestId('cicd-panel-editor')).not.toBeNull();
  });

  it('phím 0 thu hết, phím ? mở trợ giúp', () => {
    stubWebgl(false);
    renderScreen();

    fireEvent.keyDown(window, { key: '0' });
    expect(screen.queryByTestId('cicd-panel-editor')).toBeNull();
    expect(screen.queryByTestId('cicd-panel-mission')).toBeNull();

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('cicd-axis-intro')).toBeTruthy();
  });

  it('gõ vào ô soạn KHÔNG kích hoạt phím tắt', () => {
    stubWebgl(false);
    renderScreen();

    const editor = screen.getByRole('textbox', { name: /Workflow YAML/ });
    fireEvent.keyDown(editor, { key: 'm' });
    // `m` là "bản đồ". Mở sẵn theo mặc định, nên nuốt nhầm phím sẽ ĐÓNG nó.
    expect(screen.queryByTestId('cicd-panel-minimap')).not.toBeNull();
  });
});
