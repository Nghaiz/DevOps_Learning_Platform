'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedSession } from '@devops-platform/terminal';
import { api } from '../../lib/trpc-react';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import type { HandoffState } from './terminal-handoff';

/** Hai trạng thái orchestrator mà gateway cho nối (CLAIMED, RUNNING). Cùng tập với `session-machine.ts`. */
const CONNECTABLE = new Set([3, 4]);

export interface ActiveMachine extends CreatedSession {
  readonly createdAt: string | null;
  readonly content: { readonly kind: 'lesson' | 'lab' | 'playground'; readonly id: string; readonly title: string } | null;
}

export interface ResumeMachineInput {
  readonly session: SandboxSession;
  /** Phiên nào thuộc về trang này. */
  readonly belongs: (machine: ActiveMachine) => boolean;
  /**
   * `false` = chưa đủ dữ liệu để nhận máy (lab còn chờ tra lần thử). Quyết định nhận
   * hay không chỉ diễn ra MỘT lần, khi lần đầu vừa có dữ liệu vừa được phép.
   */
  readonly ready?: boolean;
  /**
   * Có thì được gọi THAY cho `session.adopt` và tự nhận máy (lab gắn lại `attemptId` rồi nhận).
   * Gọi cả hai từng làm phiên nhận máy hai lần: hai START/CREATED và `connectionKey` nhảy 2.
   */
  readonly onAdopt?: (machine: ActiveMachine) => void;
  readonly handoff: HandoffState;
}

export interface ResumeMachine {
  /** Trang vừa nối lại một máy có sẵn thay vì đợi người học bấm Bắt đầu. */
  readonly resumed: boolean;
  /** Số máy KHÁC đang chạy của người này (bài khác, tab khác). */
  readonly others: number;
  /**
   * Chưa quyết định xong có nhận máy cũ không (danh sách máy đang tải, hoặc đã có máy chờ nhận).
   * Trang khoá nút Bắt đầu lúc này: bấm sớm là mở máy MỚI và bỏ mồ côi máy cũ giữ một khe quota.
   */
  readonly pending: boolean;
}

/**
 * Mở lại trang giữa bài thì nối lại ĐÚNG máy đang chạy, không đợi bấm Bắt đầu.
 *
 * Bản trước luôn hiện nút Bắt đầu sau khi tải lại: bấm là thêm một pod thứ hai,
 * còn pod cũ sống tiếp tới hết giờ và giữ một khe quota của cả lớp.
 *
 * Cùng query khoá `me.activeSessions({})` với `/me`, nên không tốn thêm request khi
 * đã có trong cache. Khi terminal đang ở cửa sổ riêng, trang không còn nhận tin
 * `expiring` qua WebSocket, nên query này hỏi lại mỗi 30 giây để đồng hồ không đứng.
 */
export function useResumeMachine({ session, belongs, ready = true, onAdopt, handoff }: ResumeMachineInput): ResumeMachine {
  const query = api.me.activeSessions.useQuery(
    {},
    { refetchInterval: handoff !== 'here' && session.state.sessionId !== null ? 30_000 : false },
  );
  const decided = useRef(false);
  const [resumed, setResumed] = useState(false);

  const machines = useMemo<readonly ActiveMachine[]>(
    () =>
      (query.data?.items ?? [])
        .filter((item) => CONNECTABLE.has(item.status) && item.podName !== '')
        .map((item) => ({
          id: item.id,
          podName: item.podName,
          status: item.status,
          expiresAt: item.expiresAt,
          createdAt: item.createdAt,
          content: item.content,
        })),
    [query.data],
  );

  const mine = useMemo(
    () => machines.filter(belongs).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    // `belongs` đổi danh tính mỗi lượt render; kết quả chỉ phụ thuộc dữ liệu.
    [machines],
  );

  useEffect(() => {
    if (decided.current || !query.isSuccess || !ready) return;
    decided.current = true;
    const target = mine[0];
    if (target === undefined) return;
    if (session.state.sessionId !== null || session.state.phase !== 'idle') return;
    if (onAdopt === undefined) session.adopt(target);
    else onAdopt(target);
    setResumed(true);
  }, [query.isSuccess, ready, mine, session, onAdopt]);

  // Terminal ở cửa sổ riêng: đồng bộ hạn từ máy chủ thay cho tin `expiring` đã mất.
  const currentId = session.state.sessionId;
  const synced = machines.find((machine) => machine.id === currentId);
  const syncExpiry = session.syncExpiry;
  useEffect(() => {
    if (handoff === 'here' || synced === undefined) return;
    syncExpiry(synced.expiresAt);
  }, [handoff, synced?.expiresAt, syncExpiry, synced]);

  // Máy của trang (đang nối, hoặc sắp nhận) không tính; bản trùng cũ hơn của CÙNG bài
  // thì có tính, vì đó đúng là máy mồ côi người học nên tắt.
  const primaryId = currentId ?? mine[0]?.id ?? null;
  const others = machines.filter((machine) => machine.id !== primaryId).length;
  return { resumed, others, pending: !decided.current && (query.isPending || mine.length > 0) };
}
