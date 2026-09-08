// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ClusterView,
  CreateSession,
  GameAction,
  GameActionKind,
  K8sSession,
  SessionStatus,
} from '@devops-platform/games';
import { K8sGame } from './k8s-game';
import { SCENE_PREF_KEY } from './game-preferences';
import { clusterView, eventView, levelFixture, podView, serviceView } from './test-fixtures';

/**
 * §4.4 — ô AC mà cả lane này sống chết theo: **chơi hết được level 1 CHỈ bằng
 * bàn phím**.
 *
 * ## File này chứng minh gì, và cố ý KHÔNG chứng minh gì
 *
 * Chứng minh được, vì nó là DOM thật trong jsdom:
 *   - mọi điều khiển cần để chơi đều nằm trong đường Tab (khả năng VỚI TỚI);
 *   - mỗi điều khiển kích hoạt được bằng phím và phát ra đúng `GameAction`
 *     (khả năng KÍCH HOẠT);
 *   - đủ CẢ BẢY `kind` của hợp đồng, không sót cái nào chỉ làm được bằng chuột.
 *
 * KHÔNG chứng minh được ở đây, và giả vờ ngược lại còn tệ hơn không có test:
 *   - cảnh 3D. jsdom không có WebGL. Test này chạy với hiệu ứng 3D **tắt**, thứ
 *     vừa tránh nạp `three` vào runner vừa kiểm luôn ô "tắt thì không nạp module
 *     scene chút nào" — nếu `next/dynamic` bị render, `three` sẽ bị import và
 *     lượt chạy sẽ chậm thấy rõ hoặc đỏ.
 *   - CSP. Header chỉ tồn tại khi có server thật; kiểm bằng trình duyệt thật.
 *
 * ## Hai phép đo tách nhau, và vì sao không gộp
 *
 * "Với tới được" và "kích hoạt được" là hai hỏng hóc khác nhau: một nút có
 * `tabIndex={-1}` vẫn kích hoạt được bằng `focus()` + Enter, và một nút trong
 * đường Tab vẫn có thể không nghe Enter. Gộp hai phép đo lại thì mỗi hỏng hóc
 * đều có một đường thoát.
 */

interface Harness {
  readonly createSession: CreateSession;
  readonly actions: GameAction[];
  push(next: ClusterView): void;
  setStatus(next: SessionStatus): void;
}

function makeHarness(initial: ClusterView): Harness {
  let view = initial;
  let status: SessionStatus = { phase: 'playing', objectivesMet: [], hintsRevealed: 0, movesUsed: 0 };
  const listeners = new Set<() => void>();
  const actions: GameAction[] = [];

  const session: K8sSession = {
    // ⚠ Trả CÙNG MỘT THAM CHIẾU cho tới khi trạng thái đổi thật — đúng ràng buộc
    // `contract.ts` đặt ra cho lane B. Fixture cũng phải tuân, nếu không test sẽ
    // render vô hạn và triệu chứng sẽ đọc như "vitest treo".
    getView: () => view,
    getStatus: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (action) => {
      actions.push(action);
    },
    getLog: () => ({ levelId: 'k8s-01-pod-dau-tien', seed: 1, actions }),
    dispose: () => undefined,
  };

  return {
    createSession: () => session,
    actions,
    push(next) {
      view = next;
      for (const listener of listeners) {
        listener();
      }
    },
    setStatus(next) {
      status = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

const LEVEL = levelFixture();

function renderGame(harness: Harness) {
  return render(<K8sGame levels={[LEVEL]} createSession={harness.createSession} />);
}

beforeEach(() => {
  // 3D tắt TRƯỚC khi render: giữ `three` ra khỏi runner, và đồng thời là nửa
  // dương của phép kiểm "tắt thì không nạp".
  window.localStorage.setItem(SCENE_PREF_KEY, JSON.stringify({ scene3d: false, quality: 'auto' }));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('K8sGame — đường bàn phím', () => {
  /**
   * Đi Tab từ đầu trang và ghi lại thứ tự. Đây là phép đo "VỚI TỚI ĐƯỢC": một
   * điều khiển không xuất hiện trong chuỗi này thì người không dùng chuột không
   * bao giờ chạm tới nó, dù nó bấm được bằng `focus()` trong một test khác.
   */
  it('mọi điều khiển cần để chơi đều nằm trong đường Tab', async () => {
    const user = userEvent.setup();
    const harness = makeHarness(clusterView({ objects: [podView('u-1', 'web-1')] }));
    renderGame(harness);
    await screen.findByRole('button', { name: /Chờ một nhịp/ });

    const reached: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      const active = document.activeElement;
      if (active === null || active === document.body) {
        break;
      }
      const name = active.getAttribute('aria-label') ?? active.textContent ?? '';
      reached.push(`${active.tagName}:${active.id}:${name.trim().slice(0, 40)}`);
    }

    const joined = reached.join('\n');
    expect(joined, 'chọn level').toMatch(/SELECT/);
    expect(joined, 'công tắc 3D').toMatch(/hiệu ứng 3D/);
    expect(joined, 'nút chờ một nhịp').toMatch(/Chờ một nhịp/);
    expect(joined, 'nút mở gợi ý').toMatch(/Mở gợi ý/);
    expect(joined, 'mục tài nguyên').toMatch(/pod\/web-1/);
    expect(joined, 'ô soạn manifest').toMatch(/Áp dụng manifest YAML/);
    expect(reached, 'thanh lệnh kubectl').toContain(`INPUT:${screen.getByLabelText('Thanh lệnh kubectl').id}:`);
  });

  /**
   * Nút "Chạy" VẮNG MẶT trong chuỗi Tab ở ô trên, và đó là ĐÚNG — nó `disabled`
   * khi ô lệnh còn rỗng, mà phần tử disabled thì không nằm trong đường Tab.
   *
   * Ô này tồn tại vì lần chạy đầu, ô trên đòi thấy "Chạy" và ĐỎ. Cám dỗ lúc ấy
   * là xoá dòng khẳng định cho xanh. Nhưng "vắng vì disabled" và "vắng vì
   * `tabIndex={-1}` đặt nhầm" nhìn hệt nhau trong một chuỗi Tab, nên xoá đi là
   * bỏ luôn khả năng phân biệt hai thứ đó. Ở đây phân biệt: gõ một ký tự vào ô
   * lệnh thì nút phải quay lại đường Tab.
   *
   * Đường bàn phím để chạy lệnh không phụ thuộc nút này — Enter ngay trong ô đã
   * submit form (chứng minh ở ô "đủ bảy loại GameAction").
   */
  it('nút Chạy vắng khỏi Tab vì disabled, không phải vì tabIndex sai', async () => {
    const user = userEvent.setup();
    renderGame(makeHarness(clusterView()));

    const run = await screen.findByRole<HTMLButtonElement>('button', { name: /Chạy/ });
    expect(run.disabled).toBe(true);
    expect(run.getAttribute('tabindex')).toBeNull();

    screen.getByLabelText('Thanh lệnh kubectl').focus();
    await user.keyboard('kubectl get pods');
    expect(run.disabled).toBe(false);

    await user.tab();
    expect(document.activeElement).toBe(run);
  });

  /**
   * Phép đo thứ hai: KÍCH HOẠT. Không một `click()` nào trong test này — chỉ
   * `focus()` (thứ Tab đã chứng minh ở ô trên là tới được) rồi gõ phím.
   *
   * Khẳng định trên TẬP HỢP `kind` chứ không trên từng lời gọi rời rạc: điều ta
   * cần biết là "không có hành động nào chỉ làm được bằng chuột", và chỉ một
   * phép so tập hợp mới trả lời được câu đó. Kiểm từng nút một sẽ luôn xanh kể
   * cả khi một `kind` không có đường bàn phím nào.
   */
  it('đủ bảy loại GameAction phát ra được chỉ bằng bàn phím', async () => {
    const user = userEvent.setup();
    const harness = makeHarness(
      clusterView({
        objects: [
          podView('u-1', 'web-1'),
          serviceView('d-1', 'web-deploy', { kind: 'Deployment', nodeName: null, statusToken: 'success' }),
        ],
      }),
    );
    renderGame(harness);

    // kubectl — gõ vào thanh lệnh rồi Enter.
    const input = await screen.findByLabelText('Thanh lệnh kubectl');
    input.focus();
    await user.keyboard('kubectl get pods{Enter}');

    // wait — nút "Chờ một nhịp".
    screen.getByRole('button', { name: /Chờ một nhịp/ }).focus();
    await user.keyboard('{Enter}');

    // hint — nút mở gợi ý.
    screen.getByRole('button', { name: /Mở gợi ý/ }).focus();
    await user.keyboard('{Enter}');

    // apply — mở ô soạn manifest bằng phím, gõ, rồi Áp dụng.
    screen.getByRole('button', { name: 'Áp dụng manifest YAML' }).focus();
    await user.keyboard('{Enter}');
    const manifest = screen.getByLabelText('Nội dung manifest YAML');
    manifest.focus();
    await user.keyboard('kind: Pod');
    screen.getByRole('button', { name: 'Áp dụng' }).focus();
    await user.keyboard('{Enter}');

    // Chọn một Deployment bằng bàn phím ⇒ mở khoá delete / scale / edit.
    const list = screen.getByRole('list', { name: 'Danh sách tài nguyên' });
    within(list).getByRole('button', { name: /deployment\/web-deploy/ }).focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('button', { name: /Xoá deployment\/web-deploy/ });

    // scale — ô số + nút.
    const replicas = screen.getByLabelText('Số replica');
    replicas.focus();
    await user.keyboard('{Backspace}3');
    screen.getByRole('button', { name: 'Đặt lại replica' }).focus();
    await user.keyboard('{Enter}');

    // edit — textarea đã có sẵn YAML, chỉ cần Lưu.
    screen.getByRole('button', { name: 'Lưu thay đổi' }).focus();
    await user.keyboard('{Enter}');

    // delete.
    screen.getByRole('button', { name: /Xoá deployment\/web-deploy/ }).focus();
    await user.keyboard('{Enter}');

    const kinds = new Set<GameActionKind>(harness.actions.map((a) => a.kind));
    expect([...kinds].sort()).toEqual(['apply', 'delete', 'edit', 'hint', 'kubectl', 'scale', 'wait']);
  });

  it('hành động mang đúng ResourceRef và đúng tick mô phỏng', async () => {
    const user = userEvent.setup();
    const harness = makeHarness(
      clusterView({
        tick: 42,
        objects: [serviceView('d-1', 'web', { kind: 'Deployment', namespace: 'kube-system' })],
      }),
    );
    renderGame(harness);

    const list = await screen.findByRole('list', { name: 'Danh sách tài nguyên' });
    within(list).getByRole('button', { name: /deployment\/web/ }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: /Xoá deployment\/web/ }).focus();
    await user.keyboard('{Enter}');

    const deleteAction = harness.actions.find((a) => a.kind === 'delete');
    expect(deleteAction).toEqual({
      // `tick` lấy từ ClusterView — đồng hồ mô phỏng, không phải giờ treo tường.
      // Lấy `Date.now()` ở đây sẽ phá tính tất định của phát lại (§8.3).
      tick: 42,
      kind: 'delete',
      // Khoá TỰ NHIÊN của K8s, không phải `uid` nội bộ của renderer.
      target: { kind: 'Deployment', namespace: 'kube-system', name: 'web' },
    });
  });

  it('mũi tên đi trong danh sách tài nguyên mà không phá đường Tab', async () => {
    const user = userEvent.setup();
    const harness = makeHarness(
      clusterView({ objects: [podView('u-1', 'web-1'), podView('u-2', 'web-2')] }),
    );
    renderGame(harness);

    const list = await screen.findByRole('list', { name: 'Danh sách tài nguyên' });
    const first = within(list).getByRole('button', { name: /pod\/web-1/ });
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(within(list).getByRole('button', { name: /pod\/web-2/ }));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(first);

    // Cả hai vẫn ở trong đường Tab: `tabIndex` mặc định, không roving.
    expect(first.getAttribute('tabindex')).toBeNull();
  });
});

describe('K8sGame — thông báo cho trình đọc màn hình', () => {
  it('nhật ký sự kiện là vùng aria-live và nhận nội dung tiếng Việt của lane B', async () => {
    const harness = makeHarness(clusterView());
    renderGame(harness);

    const log = await screen.findByRole('log');
    expect(log.getAttribute('aria-live')).toBe('polite');

    harness.push(
      clusterView({ tick: 3, events: [eventView(3, 'pod web-2 chuyển sang CrashLoopBackOff', { level: 'error' })] }),
    );

    await waitFor(() => {
      expect(within(log).getByText('pod web-2 chuyển sang CrashLoopBackOff')).toBeDefined();
    });
  });

  /**
   * Hai vùng sống, hai loại tin. Gộp lại thì mỗi cú bấm chọn một pod sẽ chen vào
   * giữa dòng chảy sự cố và nhật ký mất tác dụng làm bằng chứng chẩn đoán —
   * nhưng chúng phải là hai vùng KHÁC NHAU, không phải một nội dung dựng hai lần
   * (đọc hai lần còn tệ hơn không đọc).
   */
  it('thông báo giao diện nằm ở vùng status riêng, không trộn vào nhật ký', async () => {
    const user = userEvent.setup();
    const harness = makeHarness(clusterView({ objects: [podView('u-1', 'web-1')] }));
    renderGame(harness);

    const list = await screen.findByRole('list', { name: 'Danh sách tài nguyên' });
    within(list).getByRole('button', { name: /pod\/web-1/ }).focus();
    await user.keyboard('{Enter}');

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('pod web-1 đang chạy');
    expect(screen.getByRole('log').textContent).not.toContain('Đang xem');
  });

  it('trạng thái mỗi tài nguyên đọc được bằng chữ, không chỉ bằng màu chấm', async () => {
    const harness = makeHarness(
      clusterView({
        objects: [
          podView('u-1', 'web-1', {
            statusToken: 'destructive',
            reason: 'CrashLoopBackOff',
            ariaLabel: 'pod web-1 lỗi CrashLoopBackOff',
          }),
        ],
      }),
    );
    renderGame(harness);

    const list = await screen.findByRole('list', { name: 'Danh sách tài nguyên' });
    const item = within(list).getByRole('button', { name: /pod\/web-1/ });
    // Tên nhìn thấy được VÀ trạng thái, cùng trong tên khả truy — không cái nào
    // thay thế cái nào (đó là lý do `ariaLabel` nằm trong `sr-only` chứ không
    // trong thuộc tính `aria-label`).
    expect(item.textContent).toContain('pod/web-1');
    expect(item.textContent).toContain('pod web-1 lỗi CrashLoopBackOff');
  });
});

describe('K8sGame — công tắc hiệu ứng 3D', () => {
  it('tắt thì không dựng khung 3D, và trạng thái ghi vào localStorage', async () => {
    const user = userEvent.setup();
    renderGame(makeHarness(clusterView()));

    const toggle = await screen.findByRole('button', { name: 'Bật hiệu ứng 3D' });
    expect(screen.getByText(/Hiệu ứng 3D đang tắt/)).toBeDefined();

    toggle.focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('button', { name: 'Tắt hiệu ứng 3D' });
    const stored = JSON.parse(window.localStorage.getItem(SCENE_PREF_KEY) ?? '{}') as { scene3d?: boolean };
    expect(stored.scene3d).toBe(true);
  });

  it('bản lưu hỏng không làm sập game', async () => {
    window.localStorage.setItem(SCENE_PREF_KEY, '{ đây không phải JSON');
    renderGame(makeHarness(clusterView()));
    // Rơi về mặc định thay vì ném — cùng khuôn `readWorkspaceState` của khoang
    // terminal: một tuỳ chọn hiển thị không được phép chặn cả trang.
    expect(await screen.findByRole('heading', { level: 1, name: 'Kubernetes Game' })).toBeDefined();
  });
});

describe('K8sGame — chưa có engine', () => {
  it('nói thẳng là chưa chơi được thay vì hiện một giao diện chết', async () => {
    render(<K8sGame levels={[LEVEL]} />);
    expect(await screen.findByText(/Bộ máy mô phỏng chưa sẵn sàng/)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Chờ một nhịp/ }).disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Thanh lệnh kubectl').disabled).toBe(true);
  });

  it('vẫn dựng đủ tiêu đề cấp một cho cổng axe', async () => {
    render(<K8sGame />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Kubernetes Game' })).toBeDefined();
  });
});
