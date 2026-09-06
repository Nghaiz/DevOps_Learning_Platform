'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@devops-platform/ui';
import { SessionControls, TerminalPane, useResolvedTerminalTheme } from '../../../components/session';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { usePlaygroundSession } from './use-playground-session';

export function PlaygroundClient({
  playgroundId,
  userId,
}: {
  playgroundId: string;
  userId: string;
}): React.ReactElement {
  const query = api.playgrounds.get.useQuery({ playgroundId });
  const session = usePlaygroundSession(playgroundId, userId);

  const me = api.me.get.useQuery({});
  const terminalTheme = useResolvedTerminalTheme(me.data?.preferences.terminalTheme ?? null);

  // Chỉ hỏi khi chưa có phiên — sau khi phiên mở, "còn N chỗ" không quyết định
  // gì nữa. Đọc thẳng `data`, không lưu vào state (no-derived-fields).
  const capacity = api.capacity.get.useQuery(
    {},
    { refetchInterval: 15_000, enabled: session.state.sessionId === null },
  );

  if (query.isPending) {
    return <Centered>Đang tải sân chơi…</Centered>;
  }
  if (query.isError) {
    return <Centered tone="error">{describeTrpcError(query.error)}</Centered>;
  }

  const { playground, unsupportedCapabilities } = query.data;
  const ttlMinutes = Math.round(playground.ttlSeconds / 60);

  // Gốc trang KHÔNG mang `h-screen`/`min-h-screen`: vỏ ứng dụng đã dựng
  // `<main class="flex min-h-0 flex-1 flex-col">` BÊN DƯỚI một thanh đầu trang,
  // nên 100vh ở đây cao hơn phần còn lại đúng bằng chiều cao thanh đó và đẻ ra
  // một thanh cuộn thừa trên mọi trang có terminal. `flex-1 min-h-0` lấy đúng
  // phần còn lại — không con số nào phải khớp tay với chiều cao thanh đầu trang.
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <Link href="/playgrounds" className="text-sm text-muted-foreground hover:text-foreground">
          ← Sân chơi
        </Link>
        <h1 className="text-sm font-semibold">{playground.title}</h1>

        {/*
          AC 8.E — người học phải biết phiên sống bao lâu TRƯỚC KHI bấm "Bắt
          đầu", không phải sau. Con số đi qua `ttlSeconds` của C5 (badge "Phiên
          kéo dài N phút") chứ không còn là một badge chép tay ở trang này: bốn
          trình học phải nói cùng một câu về cùng một thứ.

          Sau khi phiên mở, đồng hồ THẬT của `SessionControls` thay chỗ nó (hiện
          dưới 10 phút) — con số của nội dung khi đó không còn là sự thật, vì
          "Thêm giờ" đã có thể đẩy hạn đi rồi.
        */}
        <div className="ml-auto">
          <SessionControls
            session={session}
            actions={{ start: session.start, end: session.end, extend: session.extend }}
            ttlSeconds={playground.ttlSeconds}
            capacity={capacity.data ?? null}
          />
        </div>
      </header>

      {unsupportedCapabilities.length > 0 && (
        <Alert variant="warning" className="rounded-none border-x-0 border-t-0">
          <AlertDescription className="text-foreground">
            Sân chơi này cần <strong>{unsupportedCapabilities.join(', ')}</strong> — nền tảng
            chưa chạy được những năng lực đó, nên một số lệnh sẽ báo lỗi.
          </AlertDescription>
        </Alert>
      )}

      {session.startError !== null && (
        <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
          <AlertDescription className="text-foreground">{session.startError}</AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1">
        <TerminalPane
          session={session}
          theme={terminalTheme}
          placeholder={
            <span className="flex max-w-md flex-col gap-3">
              {playground.description !== null && <span>{playground.description}</span>}
              <span>
                Bấm <span className="font-semibold text-foreground">Bắt đầu</span> để dựng
                sandbox và mở terminal — phiên tự đóng sau{' '}
                <strong className="text-foreground">{ttlMinutes} phút</strong>.
              </span>
            </span>
          }
        />
      </div>
    </div>
  );
}

function Centered({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: 'error';
}): React.ReactElement {
  // `flex-1 min-h-0` chứ không `min-h-screen`: căn giữa theo phần vỏ chừa lại,
  // không theo cả màn hình (xem chú thích ở gốc trang).
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6">
      <p className={tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
        {children}
      </p>
    </div>
  );
}
