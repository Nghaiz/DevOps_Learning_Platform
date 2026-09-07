import { describe, expect, it } from 'vitest';
import { buildTerminalTabs, planExec } from './exec-routing';

/**
 * C1/C2 — `onExec` phải đưa lệnh tới ĐÚNG terminal.
 *
 * Vì sao phép kiểm nằm ở tầng hàm thuần chứ không ở tầng component: `apps/web`
 * chạy vitest ở `environment: 'node'` (không jsdom, không RTL). Một quyết định
 * nằm trong thân hook là một quyết định không kiểm được — nên quyết định sống ở
 * `exec-routing.ts` và hook chỉ THI HÀNH nó.
 */

describe('planExec — target null nghĩa là "terminal đang hoạt"', () => {
  it('đang ở Terminal 1 ⇒ lệnh ở nguyên Terminal 1, không đổi tab', () => {
    const plan = planExec({
      activeTab: 'terminal-1',
      openTerminals: ['terminal-1'],
      target: null,
    });
    expect(plan.destination).toBe('terminal-1');
    expect(plan.switchesTab).toBe(false);
    expect(plan.createWindow).toBe(false);
  });

  it('đang ở Terminal 2 ⇒ lệnh đi vào Terminal 2, KHÔNG quay về Terminal 1', () => {
    const plan = planExec({
      activeTab: 'terminal-2',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: null,
    });
    expect(plan.destination).toBe('terminal-2');
    expect(plan.switchesTab).toBe(false);
  });

  it('đang ở tab Editor ⇒ Terminal 1, đúng chữ trong C2', () => {
    // Ca này là lý do `activeTab` không thể dùng thẳng làm đích: `editor` không
    // phải một terminal, và gõ lệnh vào nó là gõ vào hư không.
    const plan = planExec({
      activeTab: 'editor',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: null,
    });
    expect(plan.destination).toBe('terminal-1');
    expect(plan.switchesTab).toBe(true);
  });

  it('đang ở Editor mà Terminal 2 đang mở thì VẪN là Terminal 1', () => {
    // Phép kiểm này gác một cám dỗ cụ thể: "nhớ terminal nào hoạt trước khi sang
    // Editor rồi quay lại đó". Nghe thân thiện hơn, nhưng C2 chốt câu trả lời là
    // Terminal 1, và một trạng thái nhớ thêm là một chỗ để client lệch với tmux.
    const plan = planExec({
      activeTab: 'editor',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: null,
    });
    expect(plan.destination).toBe('terminal-1');
  });
});

describe('planExec — target tường minh thì chuyển tab TRƯỚC', () => {
  it('T2 đã mở ⇒ đổi sang T2, không tạo window mới', () => {
    const plan = planExec({
      activeTab: 'terminal-1',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: 'terminal-2',
    });
    expect(plan.destination).toBe('terminal-2');
    expect(plan.switchesTab).toBe(true);
    expect(plan.createWindow).toBe(false);
  });

  it('T2 CHƯA mở ⇒ phải tạo window mới trước khi gõ', () => {
    // Đây là nhánh duy nhất có chờ (`NEW_WINDOW_SETTLE_MS`): shell mới khởi động
    // chạy `stty`, thao tác đó xả input đang nằm chờ trong pty, nên lệnh gõ ngay
    // biến mất không dấu vết. `createWindow` là thứ hook đọc để biết phải hoãn.
    const plan = planExec({
      activeTab: 'terminal-1',
      openTerminals: ['terminal-1'],
      target: 'terminal-2',
    });
    expect(plan.createWindow).toBe(true);
    expect(plan.destination).toBe('terminal-2');
  });

  it('target trỏ đúng tab đang hoạt ⇒ không tính là đổi tab', () => {
    const plan = planExec({
      activeTab: 'terminal-2',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: 'terminal-2',
    });
    expect(plan.switchesTab).toBe(false);
  });

  it('target T1 trong khi đang ở T2 ⇒ quay về T1', () => {
    const plan = planExec({
      activeTab: 'terminal-2',
      openTerminals: ['terminal-1', 'terminal-2'],
      target: 'terminal-1',
    });
    expect(plan.destination).toBe('terminal-1');
    expect(plan.switchesTab).toBe(true);
    expect(plan.createWindow).toBe(false);
  });
});

describe('buildTerminalTabs — ĐÚNG MỘT xterm thật (C6)', () => {
  const PANE = 'xterm-that' as unknown as null;

  it('một tab ⇒ terminal-1 giữ khoang thật', () => {
    const tabs = buildTerminalTabs(['terminal-1'], PANE);
    expect([...tabs.keys()]).toEqual(['terminal-1']);
    expect(tabs.get('terminal-1')).toBe(PANE);
  });

  it('hai tab ⇒ chỉ terminal-1 giữ khoang thật, terminal-2 là null', () => {
    /*
      ⛔ Đây là bất biến sống-chết, không phải một chi tiết vẽ vời.

      `components/session/terminal-pane.tsx` truyền `wsUrl` + `connectionKey`
      xuống `TerminalSurface`, tức CHÍNH surface mở WebSocket; và
      `lib/use-sandbox-session.ts` giữ đúng MỘT ô `TerminalHandle`. Nên một
      `TerminalPane` thứ hai trong map = WebSocket thứ hai (vỡ
      `GATEWAY_MAX_WS_PER_SESSION = 1`) + handle thứ hai ghi đè handle thứ nhất.

      Triệu chứng nếu ai đó "sửa" hàm này thành trả khoang thật cho cả hai tab:
      nút "Kiểm tra" gõ vào một terminal khác với cái người học đang nhìn. Không
      lỗi, không cảnh báo. Nên phép kiểm phải khẳng định cái `null`.
    */
    const tabs = buildTerminalTabs(['terminal-1', 'terminal-2'], PANE);
    expect([...tabs.keys()]).toEqual(['terminal-1', 'terminal-2']);
    expect(tabs.get('terminal-1')).toBe(PANE);
    expect(tabs.get('terminal-2')).toBeNull();
  });

  it('đúng MỘT giá trị khác null, bất kể có bao nhiêu tab', () => {
    const tabs = buildTerminalTabs(['terminal-1', 'terminal-2'], PANE);
    const real = [...tabs.values()].filter((node) => node !== null);
    expect(real).toHaveLength(1);
  });
});
