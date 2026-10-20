'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Bàn giao terminal giữa trang học và cửa sổ terminal riêng.
 *
 * ## Vì sao phải bàn giao TƯỜNG MINH
 *
 * Gateway cho đúng MỘT WebSocket trên một phiên (`GATEWAY_MAX_WS_PER_SESSION = 1`,
 * bước i của `wsroute.go`: kết nối thứ hai nhận HTTP 429 lúc bắt tay, trình duyệt
 * chỉ thấy `1006`). Trước bản này nút "mở cửa sổ riêng" chỉ là một liên kết: cửa
 * sổ mới và trang cũ cùng nối, bên nào tới sau bị 429, máy trạng thái của bên đó
 * đọc `1006` thành "rớt mạng" rồi nối lại theo backoff, và hai bên giật khe của
 * nhau mãi. Người học thấy terminal ở trang chập chờn "Mất kết nối" mà không có
 * lý do nào đúng.
 *
 * Nay: mở cửa sổ riêng là trang TỰ NGẮT kết nối của mình và hiện "Đang mở ở cửa
 * sổ riêng". Hai bên báo nhau qua `BroadcastChannel` (cùng origin):
 *
 * | Tin | Nghĩa |
 * |---|---|
 * | `claim` | "tôi giữ kết nối từ giờ", bên kia ngắt |
 * | `release` | "tôi đã thả kết nối" |
 *
 * Trang là NHÀ: cửa sổ riêng đóng (hoặc thả) thì trang tự nối lại. Cửa sổ riêng
 * không tự giành lại; nó hiện nút để người dùng chủ động lấy về.
 *
 * Không có `BroadcastChannel` (trình duyệt rất cũ): trang vẫn ngắt khi mở cửa
 * sổ và vẫn tự nối lại khi cửa sổ đóng (dò `window.closed`), chỉ mất đường báo
 * ngược từ cửa sổ.
 */

export type HandoffState = 'here' | 'elsewhere' | 'reclaiming';

export type HandoffRole = 'page' | 'window';

export interface HandoffMessage {
  readonly v: 1;
  readonly type: 'claim' | 'release';
  readonly from: HandoffRole;
}

export function handoffChannelName(sessionId: string): string {
  return `dlp-terminal:${sessionId}`;
}

export function terminalWindowUrl(sessionId: string): string {
  return `/session/${encodeURIComponent(sessionId)}/terminal`;
}

/** Đọc một tin từ kênh. Tin lạ (phiên bản khác, rác) bị bỏ qua thay vì làm hỏng trạng thái. */
export function parseHandoffMessage(data: unknown): HandoffMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.v !== 1) return null;
  if (record.type !== 'claim' && record.type !== 'release') return null;
  if (record.from !== 'page' && record.from !== 'window') return null;
  return { v: 1, type: record.type, from: record.from };
}

/**
 * Bước chuyển trạng thái của TRANG khi nhận một tin từ cửa sổ riêng. Thuần, có test.
 *
 * - cửa sổ `claim` ⇒ trang nhường (`elsewhere`), kể cả khi cửa sổ được mở bằng
 *   tay ở tab khác chứ không qua nút.
 * - cửa sổ `release` ⇒ trang lấy lại (`here`).
 * - tin do chính một trang khác gửi bị bỏ qua: hai tab cùng phiên không bàn giao
 *   cho nhau, chúng đã tranh khe như trước và đó không phải việc của kênh này.
 */
export function pageStateAfter(state: HandoffState, message: HandoffMessage): HandoffState {
  if (message.from !== 'window') return state;
  return message.type === 'claim' ? 'elsewhere' : 'here';
}

/** Chờ cửa sổ riêng thả kết nối sau khi trang đòi lại, rồi mới tự nối. */
export const RECLAIM_WAIT_MS = 1_500;
/** Nhịp dò cửa sổ riêng đã bị đóng chưa (đường dự phòng khi thiếu tin `release`). */
const CLOSED_POLL_MS = 1_000;

function openChannel(sessionId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(handoffChannelName(sessionId));
  } catch {
    return null;
  }
}

export interface TerminalHandoff {
  readonly state: HandoffState;
  /** Mở cửa sổ riêng và nhường kết nối. `false` = trình duyệt chặn cửa sổ bật lên. */
  readonly popOut: () => boolean;
  /** Đòi kết nối về trang. */
  readonly reclaim: () => void;
}

/** Phía TRANG học (lesson/lab/playground). */
export function useTerminalHandoff(sessionId: string | null): TerminalHandoff {
  const [state, setState] = useState<HandoffState>('here');
  const channelRef = useRef<BroadcastChannel | null>(null);
  const popupRef = useRef<Window | null>(null);
  const reclaimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState('here');
    if (sessionId === null) return;
    const channel = openChannel(sessionId);
    channelRef.current = channel;
    if (channel !== null) {
      channel.onmessage = (event: MessageEvent) => {
        const message = parseHandoffMessage(event.data);
        if (message !== null) setState((current) => pageStateAfter(current, message));
      };
    }
    return () => {
      channel?.close();
      channelRef.current = null;
      popupRef.current = null;
      if (reclaimTimer.current !== null) clearTimeout(reclaimTimer.current);
    };
  }, [sessionId]);

  // Đang ở cửa sổ riêng: dò cửa sổ đã bị đóng chưa, đóng rồi thì trang tự nối lại.
  useEffect(() => {
    if (state !== 'elsewhere') return;
    const timer = setInterval(() => {
      const popup = popupRef.current;
      if (popup !== null && popup.closed) {
        popupRef.current = null;
        setState('here');
      }
    }, CLOSED_POLL_MS);
    return () => clearInterval(timer);
  }, [state]);

  const popOut = useCallback((): boolean => {
    if (sessionId === null) return false;
    const popup = globalThis.open(terminalWindowUrl(sessionId), handoffChannelName(sessionId));
    if (popup === null) return false;
    popupRef.current = popup;
    setState('elsewhere');
    return true;
  }, [sessionId]);

  const reclaim = useCallback(() => {
    const message: HandoffMessage = { v: 1, type: 'claim', from: 'page' };
    channelRef.current?.postMessage(message);
    setState('reclaiming');
    if (reclaimTimer.current !== null) clearTimeout(reclaimTimer.current);
    // Hết giờ chờ mà cửa sổ chưa báo `release` (đã đóng, mất kênh): vẫn nối. Nếu
    // khe còn bị giữ, máy trạng thái của trang thấy `1006` và tự nối lại theo
    // backoff, nên lượt này không kẹt.
    reclaimTimer.current = setTimeout(() => {
      setState((current) => (current === 'reclaiming' ? 'here' : current));
    }, RECLAIM_WAIT_MS);
  }, []);

  return { state, popOut, reclaim };
}

export type WindowHandoffState = 'holding' | 'returned';

export interface WindowHandoff {
  readonly state: WindowHandoffState;
  /** Báo trang rằng cửa sổ này giữ kết nối (gọi trước khi nối). */
  readonly claim: () => void;
  /** Báo trang rằng cửa sổ này đã thả kết nối. */
  readonly release: () => void;
}

/** Phía CỬA SỔ terminal riêng (`/session/<id>/terminal`). */
export function useWindowHandoff(sessionId: string): WindowHandoff {
  const [state, setState] = useState<WindowHandoffState>('holding');
  const channelRef = useRef<BroadcastChannel | null>(null);

  const post = useCallback((type: HandoffMessage['type']) => {
    const message: HandoffMessage = { v: 1, type, from: 'window' };
    channelRef.current?.postMessage(message);
  }, []);

  useEffect(() => {
    const channel = openChannel(sessionId);
    channelRef.current = channel;
    if (channel !== null) {
      channel.onmessage = (event: MessageEvent) => {
        const message = parseHandoffMessage(event.data);
        if (message?.from === 'page' && message.type === 'claim') {
          setState('returned');
          // Trang đòi lại: thả NGAY, trang đang chờ đúng tin này để nối.
          const reply: HandoffMessage = { v: 1, type: 'release', from: 'window' };
          channel.postMessage(reply);
        }
      };
    }
    const onPageHide = (): void => {
      const reply: HandoffMessage = { v: 1, type: 'release', from: 'window' };
      channel?.postMessage(reply);
    };
    globalThis.addEventListener('pagehide', onPageHide);
    return () => {
      globalThis.removeEventListener('pagehide', onPageHide);
      onPageHide();
      channel?.close();
      channelRef.current = null;
    };
  }, [sessionId]);

  const claim = useCallback(() => {
    setState('holding');
    post('claim');
  }, [post]);

  const release = useCallback(() => {
    post('release');
  }, [post]);

  return { state, claim, release };
}
