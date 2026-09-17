'use client';

/**
 * Trạng thái thu/mở của các lớp phủ trên sân chơi CI/CD (19.D.4.1 + D.4.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ MỘT TẬP MỞ, KHÔNG PHẢI MỘT "PANEL ĐANG HIỆN"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quyết định #3 của chủ dự án: mọi bảng là **lớp phủ nổi trên sân**, và người
 * chơi phải đóng được HẾT để còn lại một sân trống hoàn toàn. Một biến
 * `activePanel` (chỉ một bảng hiện mỗi lúc) sẽ làm được vế "đóng hết" nhưng
 * hỏng vế còn lại: vòng lặp học ở đây là *"sửa một cạnh ⇒ xem ba trục nhúc
 * nhích"*, tức ô soạn và bảng kết quả phải mở ĐỒNG THỜI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NHỚ THEO CHƯƠNG, KHÔNG THEO LEVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * D.4.3 đòi ô soạn "mặc định mở ở level đầu mỗi chương, thu được, nhớ trạng
 * thái". Nhớ theo từng level thì level thứ hai lại mở lại ô soạn mà người chơi
 * vừa thu — vì nó là một khoá khác. Nhớ chung cho cả game thì chương CD kế thừa
 * bố cục của chương CI, và hai chương có bộ bảng khác nhau (chương CD có bảng
 * núm chính sách).
 *
 * Khoá theo CHƯƠNG cho đúng cả hai: level đầu của chương là lần đầu khoá đó
 * được đọc nên nó lấy mặc định (ô soạn mở), và từ đó trở đi trạng thái theo
 * người chơi qua mọi level cùng chương.
 *
 * ⚠ Đọc `localStorage` ở lần render ĐẦU là sai — máy chủ không có nó, nên HTML
 * từ server và cây sau hydrate sẽ lệch nhau. State khởi tạo bằng mặc định, rồi
 * một `useEffect` nạp giá trị đã nhớ. Cùng lý lẽ với `webgl-detect.ts`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { readHudValue, writeHudValue } from './hud-storage';

export type CicdPanelId =
  /** Ô soạn YAML — D.4.3. */
  | 'editor'
  /** Đề bài + mục tiêu — D.4.6. */
  | 'mission'
  /** Thông số job đang chọn — D.4.5. */
  | 'inspector'
  /** Kết quả lượt chạy, lịch sử, gợi ý. */
  | 'result'
  /** Bảng núm: phần sửa được của level + chính sách CD. */
  | 'tools'
  /** Bài học, cẩm nang, bài lý thuyết. */
  | 'learn'
  /** Bản đồ thu nhỏ — D.4.7. */
  | 'minimap';

export const CICD_PANEL_IDS: readonly CicdPanelId[] = [
  'editor',
  'mission',
  'inspector',
  'result',
  'tools',
  'learn',
  'minimap',
];

export type CicdPanelState = Readonly<Record<CicdPanelId, boolean>>;

export type CicdChapter = 'ci' | 'cd';

/**
 * Mặc định khi chưa có gì được nhớ.
 *
 * `inspector` đóng vì chưa chọn job nào thì nó rỗng; nó tự mở khi người chơi
 * chọn một node. `result` đóng vì chưa chạy lượt nào.
 */
export function defaultPanelState(): CicdPanelState {
  return {
    editor: true,
    mission: true,
    inspector: false,
    result: false,
    tools: false,
    learn: false,
    minimap: true,
  };
}

export function panelStorageSuffix(chapter: CicdChapter): string {
  return `panels:${chapter}`;
}

/**
 * Đọc trạng thái đã nhớ, GỘP lên mặc định.
 *
 * Gộp chứ không thay thế: thêm một bảng mới ở bản sau thì bản ghi cũ không có
 * khoá đó, và một phép thay thế sẽ đọc `undefined` thành "đóng" — bảng mới ra
 * đời đã tàng hình với mọi người chơi cũ, im lặng.
 */
export function readPanelState(chapter: CicdChapter): CicdPanelState {
  const raw = readHudValue(panelStorageSuffix(chapter));
  const base = defaultPanelState();
  if (raw === null) return base;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return base;
  }
  if (typeof parsed !== 'object' || parsed === null) return base;

  const record = parsed as Record<string, unknown>;
  const next: Record<CicdPanelId, boolean> = { ...base };
  for (const id of CICD_PANEL_IDS) {
    const value = record[id];
    if (typeof value === 'boolean') next[id] = value;
  }
  return next;
}

export function writePanelState(chapter: CicdChapter, state: CicdPanelState): boolean {
  return writeHudValue(panelStorageSuffix(chapter), JSON.stringify(state));
}

export interface HudPanels {
  readonly state: CicdPanelState;
  readonly isOpen: (id: CicdPanelId) => boolean;
  readonly toggle: (id: CicdPanelId) => void;
  readonly open: (id: CicdPanelId) => void;
  readonly close: (id: CicdPanelId) => void;
  /** Thu HẾT — sân còn trống hoàn toàn (quyết định #3). */
  readonly closeAll: () => void;
  readonly allClosed: boolean;
}

export function useHudPanels(chapter: CicdChapter): HudPanels {
  const [state, setState] = useState<CicdPanelState>(defaultPanelState);

  useEffect(() => {
    setState(readPanelState(chapter));
  }, [chapter]);

  const apply = useCallback(
    (next: CicdPanelState) => {
      setState(next);
      writePanelState(chapter, next);
    },
    [chapter],
  );

  const toggle = useCallback(
    (id: CicdPanelId) => {
      setState((truoc) => {
        const next = { ...truoc, [id]: !truoc[id] };
        writePanelState(chapter, next);
        return next;
      });
    },
    [chapter],
  );

  const open = useCallback(
    (id: CicdPanelId) => {
      setState((truoc) => {
        if (truoc[id]) return truoc;
        const next = { ...truoc, [id]: true };
        writePanelState(chapter, next);
        return next;
      });
    },
    [chapter],
  );

  const close = useCallback(
    (id: CicdPanelId) => {
      setState((truoc) => {
        if (!truoc[id]) return truoc;
        const next = { ...truoc, [id]: false };
        writePanelState(chapter, next);
        return next;
      });
    },
    [chapter],
  );

  const closeAll = useCallback(() => {
    const next: Record<CicdPanelId, boolean> = { ...defaultPanelState() };
    for (const id of CICD_PANEL_IDS) next[id] = false;
    apply(next);
  }, [apply]);

  const allClosed = useMemo(() => CICD_PANEL_IDS.every((id) => !state[id]), [state]);

  const isOpen = useCallback((id: CicdPanelId) => state[id], [state]);

  return { state, isOpen, toggle, open, close, closeAll, allClosed };
}
