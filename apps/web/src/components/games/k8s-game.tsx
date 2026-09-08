'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useMemo, useState, type ReactElement } from 'react';
import { Boxes, Clock, Sparkles, TriangleAlert } from 'lucide-react';
import type { ClusterView, CreateSession, GameAction, K8sSession, Level, ObjectView } from '@devops-platform/games';
import { Button, Label, cn } from '@devops-platform/ui';
import { CommandBar, ManifestEditor } from './command-bar';
import { EventLog } from './event-log';
import { EMPTY_VIEW, toResourceRef, useSessionSnapshot } from './game-session';
import { useDisplayPreference } from './game-preferences';
import { InspectorPanel } from './inspector-panel';
import { ObjectivesPanel } from './objectives-panel';
import { ResourceList } from './resource-list';
import { QUALITY_CHOICES, QUALITY_LABEL, type QualityChoice, type QualityTier } from './scene-quality';

/**
 * ⛔ Đây là ranh giới `three` DUY NHẤT của cả repo (§4.3).
 *
 * `dynamic()` ở tầm module KHÔNG tải chunk — nó chỉ dựng một vỏ lười. Chunk chỉ
 * được yêu cầu ở lần RENDER đầu tiên, nên "không render ⇒ không nạp" là đúng
 * theo cơ chế, không phải theo lời hứa. Đó chính là điều §4.4 đòi ở công tắc
 * "Tắt hiệu ứng 3D": tắt thì module scene **không được nạp chút nào**, chứ không
 * phải nạp rồi ẩn đi.
 *
 * `ssr: false` bắt buộc và phải nằm trong một Client Component — Next 16 ném khi
 * thấy nó trong Server Component (cùng lý do đã ghi ở `session/terminal-pane.tsx`).
 */
const K8sSceneLazy = dynamic(() => import('./k8s-scene-lazy'), {
  ssr: false,
  loading: () => <SceneBootFrame />,
});

function SceneBootFrame(): ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <p role="status" className="text-xs text-muted-foreground">
        Đang dựng khung 3D…
      </p>
    </div>
  );
}

export interface K8sGameProps {
  /**
   * Danh sách level. Rỗng cho tới khi lane C giao nội dung — lúc đó vỏ vẫn dựng
   * đủ panel và nói thẳng là chưa có level, thay vì trắng trang.
   */
  readonly levels?: readonly Level[];
  readonly initialLevelId?: string;
  /**
   * Hàm dựng phiên chơi, do lane B hiện thực. Vắng mặt ⇒ chưa có engine.
   *
   * Là PROP chứ không phải import thẳng từ barrel: lane E phải chạy và test được
   * độc lập với tiến độ lane B, và một import cứng vào thứ chưa tồn tại sẽ làm
   * đỏ typecheck của cả `apps/web`, tức chặn năm lane còn lại.
   */
  readonly createSession?: CreateSession;
  readonly seed?: number;
}

const DEFAULT_SEED = 1;

export function K8sGame({ levels = [], initialLevelId, createSession, seed = DEFAULT_SEED }: K8sGameProps): ReactElement {
  const levelSelectId = useId();
  const [levelId, setLevelId] = useState<string | null>(initialLevelId ?? levels[0]?.id ?? null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [session, setSession] = useState<K8sSession | null>(null);
  const [tier, setTier] = useState<QualityTier | null>(null);
  const [colorsDegraded, setColorsDegraded] = useState(false);
  const [notice, setNotice] = useState('');

  const display = useDisplayPreference();
  const level = useMemo(() => levels.find((l) => l.id === levelId) ?? null, [levels, levelId]);

  /*
   * Phiên chơi dựng trong effect, KHÔNG trong `useState(() => …)`: nó có đồng hồ
   * và initializer của useState cũng chạy trong lượt render trên server. Một
   * `setInterval` khởi động ở đó sẽ không bao giờ bị dọn.
   */
  useEffect(() => {
    if (createSession === undefined || level === null) {
      setSession(null);
      return;
    }
    const created = createSession({ level, seed });
    setSession(created);
    return () => {
      created.dispose();
    };
  }, [createSession, level, seed]);

  const { view, status } = useSessionSnapshot(session);

  const dispatch = useCallback(
    (build: (tick: number) => GameAction): void => {
      if (session === null) {
        return;
      }
      // `tick` LUÔN lấy từ `ClusterView` — đồng hồ mô phỏng, không phải giờ treo
      // tường. `Date.now()` ở đây sẽ phá tính tất định của phát lại (§8.3).
      session.dispatch(build(session.getView().tick));
    },
    [session],
  );

  const selected = useMemo<ObjectView | null>(
    () => view.objects.find((o) => o.uid === selectedUid) ?? null,
    [view.objects, selectedUid],
  );

  // Tài nguyên bị xoá trong lúc đang chọn ⇒ bỏ chọn, nếu không inspector giữ một
  // bản chụp cũ và các nút của nó tác động lên thứ không còn tồn tại.
  useEffect(() => {
    if (selectedUid !== null && !view.objects.some((o) => o.uid === selectedUid)) {
      setSelectedUid(null);
    }
  }, [view.objects, selectedUid]);

  const sceneSubscribe = useMemo(
    () => (session === null ? () => () => undefined : (cb: () => void) => session.subscribe(cb)),
    [session],
  );
  const sceneGetView = useMemo(
    () => (session === null ? () => EMPTY_VIEW : (): ClusterView => session.getView()),
    [session],
  );

  const scene3dOn = display.scene3d === true;
  const engineReady = session !== null;

  const toggleScene3d = useCallback((): void => {
    const next = !scene3dOn;
    display.setScene3d(next);
    setNotice(next ? 'Đã bật hiệu ứng 3D.' : 'Đã tắt hiệu ứng 3D. Toàn bộ trò chơi vẫn dùng được qua các bảng bên phải.');
  }, [display, scene3dOn]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          {/*
            "Kubernetes Game", KHÔNG phải "K8s Game": tên sau chỉ cách tên của
            dự án thượng nguồn ("K8s Games") đúng một chữ cái, và "K8s" là nhãn
            hiệu của CNCF — dùng nó để MÔ TẢ thì được, đặt vào TÊN sản phẩm thì
            khác. Định danh kỹ thuật giữ nguyên: route vẫn `/games/k8s`, `GameId`
            vẫn `'k8s'`.
          */}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Kubernetes Game</h1>
          <p className="text-sm text-muted-foreground">
            Dựng rồi cứu một cluster qua từng level. Không tốn sandbox, không cần đăng nhập — tiến độ lưu ngay trên máy
            bạn. Khung 3D chỉ là hình minh hoạ; mọi thao tác đều làm được bằng bàn phím qua các bảng bên phải.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {levels.length > 0 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={levelSelectId} className="text-xs text-muted-foreground">
                Level
              </Label>
              {/*
                `<select>` gốc chứ không phải `Select` của Radix. Với 30+ level,
                bộ chọn của hệ điều hành cuộn và gõ-để-nhảy tốt hơn một listbox
                dựng bằng div — và nó không dùng portal, nên nó kiểm được trong
                jsdom, tức ô AC "chơi hết level 1 chỉ bằng bàn phím" có một phép
                đo tự động thay vì một lời khẳng định.
              */}
              <select
                id={levelSelectId}
                value={levelId ?? ''}
                onChange={(event) => {
                  setLevelId(event.target.value);
                  setSelectedUid(null);
                }}
                className={cn(
                  'h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                {levels.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.chapter}. {item.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <Button type="button" variant="outline" size="sm" onClick={toggleScene3d}>
            <Boxes aria-hidden="true" className="size-4" />
            {scene3dOn ? 'Tắt hiệu ứng 3D' : 'Bật hiệu ứng 3D'}
          </Button>

          {scene3dOn ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="k8s-quality" className="text-xs text-muted-foreground">
                Chất lượng đồ hoạ
              </Label>
              <select
                id="k8s-quality"
                value={display.quality}
                onChange={(event) => display.setQuality(event.target.value as QualityChoice)}
                className={cn(
                  'h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                )}
              >
                {QUALITY_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {QUALITY_LABEL[choice]}
                    {choice === 'auto' && tier !== null ? ` (đang dùng: ${QUALITY_LABEL[tier]})` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!engineReady}
            onClick={() => dispatch((tick) => ({ tick, kind: 'wait', ticks: 1 }))}
          >
            <Clock aria-hidden="true" className="size-4" />
            Chờ một nhịp
          </Button>
        </div>

        {!engineReady ? (
          <p className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            Bộ máy mô phỏng chưa sẵn sàng, nên chưa chơi được. Giao diện bên dưới đã dựng đủ và sẽ hoạt động ngay khi
            engine được nối vào.
          </p>
        ) : null}

        {colorsDegraded ? (
          <p className="flex items-start gap-2 rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            Không đọc được màu từ hệ thiết kế, khung 3D đang dùng màu xám tạm. Trạng thái vẫn đọc đúng ở các bảng bên
            phải.
          </p>
        ) : null}

        {status.phase !== 'playing' ? (
          <p
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
              status.phase === 'won' ? 'border-success bg-success/10 text-foreground' : 'border-destructive bg-destructive/10 text-foreground',
            )}
          >
            <Sparkles aria-hidden="true" className="size-4" />
            {status.phase === 'won' ? 'Hoàn thành level. ' : 'Level thất bại. '}
            Đã dùng {status.movesUsed} nước đi và {status.hintsRevealed} gợi ý.
          </p>
        ) : null}
      </header>

      {/*
        Vùng thông báo cho các sự kiện GIAO DIỆN (chọn tài nguyên, bật/tắt 3D, hạ
        bậc chất lượng). TÁCH khỏi `EventLog`, vốn là vùng sống cho sự kiện của
        cluster: gộp lại thì mỗi lần bấm chọn một pod sẽ chen vào giữa dòng chảy
        sự cố, và nhật ký mất tác dụng làm bằng chứng chẩn đoán.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="k8s-canvas-heading" className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
          <h2 id="k8s-canvas-heading" className="sr-only">
            Khung mô phỏng cluster
          </h2>
          <div className="relative h-72 min-h-0 shrink-0 md:h-96">
            {display.scene3d === null ? (
              // `null` = chưa đo được prefers-reduced-motion và chưa đọc được
              // localStorage. KHÔNG đoán "bật": đoán sai theo chiều đó sẽ NẠP
              // chunk three một nhịp trước khi biết người dùng đã tắt nó — đúng
              // thứ §4.4 cấm.
              <SceneBootFrame />
            ) : scene3dOn ? (
              <K8sSceneLazy
                subscribe={sceneSubscribe}
                getView={sceneGetView}
                selectedUid={selectedUid}
                quality={display.quality}
                onTierChange={(next) => {
                  setTier(next);
                  setNotice(`Đã hạ chất lượng đồ hoạ xuống mức ${QUALITY_LABEL[next]} cho mượt.`);
                }}
                onDegradedColors={() => setColorsDegraded(true)}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted px-6 text-center">
                <Boxes aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Hiệu ứng 3D đang tắt. Toàn bộ trạng thái cluster nằm ở các bảng bên phải.
                </p>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1" />
          <CommandBar disabled={!engineReady} onSubmit={(command) => dispatch((tick) => ({ tick, kind: 'kubectl', command }))} />
          <ManifestEditor disabled={!engineReady} onApply={(yaml) => dispatch((tick) => ({ tick, kind: 'apply', yaml }))} />
        </section>

        <aside className="flex min-h-0 flex-col gap-4">
          <section aria-labelledby="k8s-objectives-heading" className="rounded-lg border border-border bg-card">
            <h2 id="k8s-objectives-heading" className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
              Mục tiêu{level !== null ? ` — ${level.title}` : ''}
            </h2>
            <ObjectivesPanel
              level={level}
              status={status}
              onRevealHint={(index) => dispatch((tick) => ({ tick, kind: 'hint', index }))}
            />
          </section>

          <section aria-labelledby="k8s-resources-heading" className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
            <h2 id="k8s-resources-heading" className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
              Tài nguyên
            </h2>
            <div className="max-h-64 min-h-0 overflow-y-auto">
              <ResourceList
                objects={view.objects}
                selectedUid={selectedUid}
                onSelect={(uid) => {
                  setSelectedUid(uid);
                  const object = view.objects.find((o) => o.uid === uid);
                  setNotice(object === undefined ? '' : `Đang xem ${object.ariaLabel}`);
                }}
              />
            </div>
          </section>

          <section aria-labelledby="k8s-inspector-heading" className="rounded-lg border border-border bg-card">
            <h2 id="k8s-inspector-heading" className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
              Inspector
            </h2>
            <InspectorPanel
              object={selected}
              onDelete={(object) => dispatch((tick) => ({ tick, kind: 'delete', target: toResourceRef(object) }))}
              onScale={(object, replicas) =>
                dispatch((tick) => ({ tick, kind: 'scale', target: toResourceRef(object), replicas }))
              }
              onEdit={(object, yaml) => dispatch((tick) => ({ tick, kind: 'edit', target: toResourceRef(object), yaml }))}
            />
          </section>

          <section aria-labelledby="k8s-events-heading" className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
            <h2 id="k8s-events-heading" className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
              Nhật ký sự kiện
            </h2>
            <div className="h-40 min-h-0">
              <EventLog events={view.events} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
