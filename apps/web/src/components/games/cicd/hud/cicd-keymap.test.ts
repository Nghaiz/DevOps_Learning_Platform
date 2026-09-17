// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { CICD_HOTKEYS, isTypingTarget, matchHotkey } from './cicd-keymap.ts';

/**
 * Bảng phím tắt (19.D.4.8).
 *
 * Ba nhóm ô, và nhóm thứ hai là nhóm dễ mất nhất khi ai đó "dọn lại" hàm khớp:
 * **không nuốt phím khi con trỏ đang ở trong ô soạn**. Mất nó thì mỗi chữ `e`
 * người chơi gõ vào YAML lại mở một bảng, và ô soạn thành không dùng được —
 * trong khi mọi ô kiểm "phím tắt có chạy không" vẫn xanh.
 */

function press(
  key: string,
  extra: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {},
): { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean } {
  return {
    key,
    ctrlKey: extra.ctrl ?? false,
    metaKey: extra.meta ?? false,
    altKey: extra.alt ?? false,
  };
}

describe('khớp phím tắt', () => {
  it('phím một chữ cái mở đúng bảng khi không gõ', () => {
    expect(matchHotkey(press('e'), false)?.action).toEqual({ kind: 'panel', panel: 'editor' });
    expect(matchHotkey(press('m'), false)?.action).toEqual({ kind: 'panel', panel: 'minimap' });
    expect(matchHotkey(press('0'), false)?.action).toEqual({ kind: 'close-all' });
    expect(matchHotkey(press('3'), false)?.action).toEqual({ kind: 'mode', mode: '3d' });
  });

  it('không phân biệt hoa thường — Shift+E vẫn là E', () => {
    expect(matchHotkey(press('E'), false)?.action).toEqual({ kind: 'panel', panel: 'editor' });
  });

  it('ĐANG GÕ thì nuốt hết phím chữ, trừ hai phím không ai gõ giữa dòng YAML', () => {
    expect(matchHotkey(press('e'), true)).toBeNull();
    expect(matchHotkey(press('0'), true)).toBeNull();
    expect(matchHotkey(press('3'), true)).toBeNull();

    // Hai ngoại lệ, và chúng là hai thứ người ta cần NHẤT khi tay đang ở ô soạn.
    expect(matchHotkey(press('Enter', { ctrl: true }), true)?.action).toEqual({ kind: 'run' });
    expect(matchHotkey(press('Escape'), true)?.action).toEqual({ kind: 'deselect' });
  });

  it('Cmd tính như Ctrl', () => {
    expect(matchHotkey(press('Enter', { meta: true }), false)?.action).toEqual({ kind: 'run' });
    // Enter trần KHÔNG chạy thử — nó là phím xuống dòng.
    expect(matchHotkey(press('Enter'), false)).toBeNull();
  });

  it('Alt loại bỏ mọi khớp — Alt+chữ cái là tổ hợp gõ dấu', () => {
    expect(matchHotkey(press('e', { alt: true }), false)).toBeNull();
    expect(matchHotkey(press('Enter', { ctrl: true, alt: true }), false)).toBeNull();
  });

  it('không hai phím nào trùng nhau', () => {
    // Trùng thì phím sau chết im lặng: hàm khớp trả về cái đầu tiên tìm thấy.
    const keys = CICD_HOTKEYS.map((h) => `${h.ctrl === true ? 'ctrl+' : ''}${h.key.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('nhận diện ô nhập liệu', () => {
  it('ô soạn, ô nhập và ô chọn đều tính là đang gõ', () => {
    for (const tag of ['textarea', 'input', 'select']) {
      expect(isTypingTarget(document.createElement(tag))).toBe(true);
    }
  });

  it('nút và div thường thì không', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
