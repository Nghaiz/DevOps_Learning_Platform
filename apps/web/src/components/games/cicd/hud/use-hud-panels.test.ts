// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import {
  CICD_PANEL_IDS,
  defaultPanelState,
  panelStorageSuffix,
  readPanelState,
  writePanelState,
} from './use-hud-panels.ts';
import { cicdHudStorageKey } from './hud-storage.ts';

/**
 * Trạng thái thu/mở của các lớp phủ (19.D.4.1 + D.4.3).
 *
 * Ba thứ đo được ở đây, và không thứ nào đo được qua giao diện:
 *
 * 1. Mặc định — ô soạn MỞ (D.4.3 đòi "mặc định mở ở level đầu mỗi chương").
 * 2. Nhớ theo CHƯƠNG, nên hai chương không giẫm lên nhau.
 * 3. Bản ghi cũ thiếu khoá thì GỘP lên mặc định, không đọc thành "đóng".
 */

afterEach(() => {
  localStorage.clear();
});

describe('trạng thái lớp phủ', () => {
  it('mặc định mở ô soạn và đề bài, đóng bảng chưa có nội dung', () => {
    const state = defaultPanelState();
    expect(state.editor).toBe(true);
    expect(state.mission).toBe(true);
    // Chưa chọn job nào và chưa chạy lượt nào ⇒ hai bảng này rỗng.
    expect(state.inspector).toBe(false);
    expect(state.result).toBe(false);
  });

  it('nhớ theo chương: ghi ở CI không đổi được bố cục của CD', () => {
    writePanelState('ci', { ...defaultPanelState(), editor: false });

    expect(readPanelState('ci').editor).toBe(false);
    expect(readPanelState('cd').editor).toBe(true);
    expect(panelStorageSuffix('ci')).not.toBe(panelStorageSuffix('cd'));
  });

  it('bản ghi cũ thiếu khoá thì lấy mặc định cho khoá đó, không đọc thành đóng', () => {
    /*
     * Đây là hình dạng một bản ghi được viết bởi phiên bản TRƯỚC khi thêm bảng
     * `minimap`. Một phép thay thế (thay vì gộp) sẽ đọc `undefined` thành
     * `false`, và bảng mới ra đời đã tàng hình với mọi người chơi cũ.
     */
    localStorage.setItem(cicdHudStorageKey(panelStorageSuffix('ci')), '{"editor":false}');

    const state = readPanelState('ci');
    expect(state.editor).toBe(false);
    expect(state.minimap).toBe(true);
  });

  it('bản ghi hỏng thì rơi về mặc định thay vì ném', () => {
    localStorage.setItem(cicdHudStorageKey(panelStorageSuffix('cd')), 'khong-phai-json');
    expect(readPanelState('cd')).toEqual(defaultPanelState());
  });

  it('mọi bảng đều có mặt trong danh sách công tắc', () => {
    // Bảng nào vắng ở đây là bảng không có công tắc nào bật/tắt được nó.
    expect(new Set(CICD_PANEL_IDS)).toEqual(new Set(Object.keys(defaultPanelState())));
  });
});
