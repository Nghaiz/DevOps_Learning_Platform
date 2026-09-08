'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Boxes, Clock, Crosshair, PanelRightClose, ScrollText, X } from 'lucide-react';
import type { ClusterView, CreateSession, GameAction, K8sSession, Level, ObjectView } from '@devops-platform/games';
import { Button, cn } from '@devops-platform/ui';
import { useMinWidth } from '../shell/use-min-width';
import { CommandBar, ManifestEditor } from './command-bar';
import { EventLog } from './event-log';
import { EMPTY_VIEW, toResourceRef, useSessionSnapshot } from './game-session';
import { useDisplayPreference } from './game-preferences';
import { HUD_PANEL, MiniMap, TopBar, WinOverlay } from './game-hud';
import { InspectorPanel } from './inspector-panel';
import { LevelCard } from './level-card';
import { ResourceRail } from './resource-rail';
import { QUALITY_CHOICES, QUALITY_LABEL, type QualityChoice, type QualityTier } from './scene-quality';

/**
 * ⛔ Ranh giới `three` DUY NHẤT của repo (§4.3). `dynamic()` ở tầm module KHÔNG
 * tải chunk — chunk chỉ được yêu cầu ở lần RENDER đầu tiên, nên "không render ⇒
 * không nạp" đúng theo cơ chế chứ không theo lời hứa. Đo được trên trình duyệt
 * thật 2026-09-08: tắt hiệu ứng 3D ⇒ chunk three không hề nằm trong danh sách
 * request.
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

/** Dưới ngưỡng này, overlay chồng nhau thành không dùng được (§12.6). */
const WIDE_LAYOUT_PX = 1024;

export interface K8sGameProps {
  readonly levels?: readonly Level[];
  readonly initialLevelId?: string;
  /**
   * Hàm dựng phiên chơi, do lane B hiện thực. Vắng mặt ⇒ chưa có engine.
   *
   * Là PROP chứ không import thẳng từ barrel: lane E phải chạy và test được độc
   * lập với tiến độ lane B, và một import cứng vào thứ chưa tồn tại làm đỏ
   * typecheck của cả `apps/web`, tức chặn năm lane còn lại.
   */
  readonly createSession?: CreateSession;
  readonly seed?: number;
}

const DEFAULT_SEED = 1;

/**
 * Vỏ game — bố cục **TOÀN MÀN HÌNH** (§12).
 *
 * ## Vì sao bản trước bị bác, và điều gì đã đổi
 *
 * Bản đầu theo sơ đồ chia đôi của §4.4: canvas một bên, một cột panel bên cạnh.
 * Chủ dự án gọi nó là "chia từng ô vùng, quá tệ" — đúng, vì mỗi panel thêm vào
 * lại lấy bớt bề ngang của canvas, và cuối cùng khung 3D bé tí giữa một mớ hộp
 * chữ nhật. §12 thay sơ đồ đó: **canvas tràn toàn viewport, mọi thứ khác NỔI ĐÈ
 * lên trên**. Không vùng nào chia phần diện tích với canvas nữa.
 *
 * ## Thứ tự DOM ở đây là thứ tự TAB, và nó được sắp có chủ ý
 *
 * Với overlay định vị tuyệt đối, vị trí trên màn hình không còn liên quan gì tới
 * thứ tự DOM — nên thứ tự Tab phải được sắp bằng tay theo trình tự ĐỌC (§12.4).
 * Trên xuống, trái sang phải: thanh trên → thẻ level → rail tài nguyên →
 * inspector → nhật ký → thanh công cụ → bản đồ thu nhỏ. Đây là chỗ bố cục này dễ
 * hỏng nhất, và nó được kiểm bằng một lượt Tab thật trong `k8s-game.dom.test.tsx`.
 *
 * ## A11y không đổi một chữ nào so với §4.4
 *
 * Overlay là DOM thật, nổi TRÊN canvas chứ không vẽ vào canvas. Canvas vẫn
 * `aria-hidden` và không nhận focus; mọi thao tác vẫn làm xong được bằng bàn phím.
 */
export function K8sGame({ levels = [], initialLevelId, createSession, seed = DEFAULT_SEED }: K8sGameProps): ReactElement {
  const [levelId, setLevelId] = useState<string | null>(initialLevelId ?? levels[0]?.id ?? null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [session, setSession] = useState<K8sSession | null>(null);
  const [tier, setTier] = useState<QualityTier | null>(null);
  const [colorsDegraded, setColorsDegraded] = useState(false);
  const [notice, setNotice] = useState('');
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [winDismissed, setWinDismissed] = useState(false);
  const [narrowPanel, setNarrowPanel] = useState<'level' | 'inspector' | null>(null);

  const display = useDisplayPreference();
  const wide = useMinWidth(WIDE_LAYOUT_PX);
  const level = useMemo(() => levels.find((l) => l.id === levelId) ?? null, [levels, levelId]);

  useEffect(() => {
    if (createSession === undefined || level === null) {
      setSession(null);
      return;
    }
    const created = createSession({ level, seed });
    setSession(created);
    setWinDismissed(false);
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
      // `tick` LUÔN từ `ClusterView` — đồng hồ mô phỏng, không phải giờ treo
      // tường. `Date.now()` ở đây phá tính tất định của phát lại (§8.3).
      session.dispatch(build(session.getView().tick));
    },
    [session],
  );

  const selected = useMemo<ObjectView | null>(
    () => view.objects.find((o) => o.uid === selectedUid) ?? null,
    [view.objects, selectedUid],
  );

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
  const showLevelCard = level !== null && (wide !== false || narrowPanel === 'level');
  const showInspector = selected !== null && (wide !== false || narrowPanel === 'inspector');

  const selectObject = useCallback(
    (uid: string): void => {
      setSelectedUid(uid);
      const object = view.objects.find((o) => o.uid === uid);
      setNotice(object === undefined ? '' : `Đang xem ${object.ariaLabel}`);
      if (wide === false) {
        setNarrowPanel('inspector');
      }
    },
    [view.objects, wide],
  );

  const settings = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const next = !scene3dOn;
          display.setScene3d(next);
          setNotice(
            next
              ? 'Đã bật hiệu ứng 3D.'
              : 'Đã tắt hiệu ứng 3D. Toàn bộ trò chơi vẫn dùng được qua các bảng nổi trên màn hình.',
          );
        }}
      >
        <Boxes aria-hidden="true" className="size-4" />
        {scene3dOn ? 'Tắt hiệu ứng 3D' : 'Bật hiệu ứng 3D'}
      </Button>
      {scene3dOn ? (
        <>
          <label htmlFor="k8s-quality" className="sr-only">
            Chất lượng đồ hoạ
          </label>
          <select
            id="k8s-quality"
            value={display.quality}
            onChange={(event) => display.setQuality(event.target.value as QualityChoice)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {QUALITY_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {QUALITY_LABEL[choice]}
                {choice === 'auto' && tier !== null ? ` (${QUALITY_LABEL[tier]})` : ''}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </>
  );

  return (
    // `relative` + `h-full` — vỏ ứng dụng đã khoá chiều cao đúng một viewport và
    // bỏ thanh cuộn cho route immersive (§12.3, `shell/immersive-routes.ts`).
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* ── Lớp đáy: canvas, KHÔNG bao giờ bị thu nhỏ để nhường chỗ ───────── */}
      <div className="absolute inset-0 z-0">
        {display.scene3d === null ? (
          // `null` = chưa đo được prefers-reduced-motion và chưa đọc localStorage.
          // KHÔNG đoán "bật": đoán sai theo chiều đó sẽ NẠP chunk three một nhịp
          // trước khi biết người dùng đã tắt nó — đúng thứ §4.4 cấm.
          <SceneBootFrame />
        ) : scene3dOn ? (
          <K8sSceneLazy
            subscribe={sceneSubscribe}
            getView={sceneGetView}
            selectedUid={selectedUid}
            focusNodeName={focusedNode}
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
            <p className="max-w-sm text-sm text-muted-foreground">
              Hiệu ứng 3D đang tắt. Toàn bộ trạng thái cluster nằm ở các bảng nổi trên màn hình.
            </p>
          </div>
        )}
      </div>

      {/*
        Vùng thông báo cho sự kiện GIAO DIỆN. Tách khỏi `EventLog`, vốn là vùng
        sống cho sự kiện của cluster: gộp lại thì mỗi cú chọn một pod chen vào
        giữa dòng chảy sự cố và nhật ký mất tác dụng làm bằng chứng chẩn đoán.
      */}
      <p role="status" aria-live="polite" className="sr-only">
        {notice}
      </p>

      {/* ── 1. Thanh trên ──────────────────────────────────────────────────── */}
      <TopBar view={view} level={level} settings={settings} />

      {/* ── 2. Thẻ level ───────────────────────────────────────────────────── */}
      {showLevelCard && level !== null ? (
        <LevelCard
          level={level}
          status={status}
          onRevealHint={(index) => dispatch((tick) => ({ tick, kind: 'hint', index }))}
        />
      ) : null}

      {/* ── 3. Rail tài nguyên ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="k8s-rail-heading"
        className={cn(
          'absolute z-20 overflow-auto border-border/60 bg-card/80 backdrop-blur-md',
          wide === false
            ? 'inset-x-0 top-12 h-20 border-b'
            : 'top-12 bottom-0 left-0 w-56 border-r',
        )}
      >
        <h2 id="k8s-rail-heading" className="sr-only">
          Tài nguyên trong cluster
        </h2>
        <ResourceRail objects={view.objects} selectedUid={selectedUid} onSelect={selectObject} />
      </section>

      {/* ── 4. Inspector ───────────────────────────────────────────────────── */}
      {showInspector ? (
        <section
          aria-labelledby="k8s-inspector-heading"
          className={cn(
            'absolute z-30 overflow-y-auto',
            HUD_PANEL,
            wide === false
              ? 'inset-x-3 bottom-32 max-h-[45vh]'
              : 'top-16 right-3 bottom-32 w-80',
          )}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <h2 id="k8s-inspector-heading" className="text-sm font-semibold text-foreground">
              Inspector
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedUid(null);
                setNarrowPanel(null);
              }}
            >
              <PanelRightClose aria-hidden="true" className="size-4" />
              <span className="sr-only">Đóng inspector</span>
            </Button>
          </div>
          <InspectorPanel
            object={selected}
            onDelete={(object) => dispatch((tick) => ({ tick, kind: 'delete', target: toResourceRef(object) }))}
            onScale={(object, replicas) =>
              dispatch((tick) => ({ tick, kind: 'scale', target: toResourceRef(object), replicas }))
            }
            onEdit={(object, yaml) => dispatch((tick) => ({ tick, kind: 'edit', target: toResourceRef(object), yaml }))}
          />
        </section>
      ) : null}

      {/* ── 5. Nhật ký sự kiện — vùng aria-live của cluster ────────────────── */}
      <section
        aria-labelledby="k8s-events-heading"
        className={cn(
          'absolute bottom-32 left-3 z-20 w-[min(22rem,calc(100vw-1.5rem))]',
          HUD_PANEL,
          showLog ? 'h-40' : 'h-9',
        )}
      >
        <div className="flex items-center justify-between px-2">
          <h2 id="k8s-events-heading" className="sr-only">
            Nhật ký sự kiện
          </h2>
          <button
            type="button"
            aria-expanded={showLog}
            aria-controls="k8s-events-body"
            onClick={() => setShowLog((value) => !value)}
            className="flex h-9 items-center gap-1.5 text-[11px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ScrollText aria-hidden="true" className="size-3.5" />
            Nhật ký ({view.events.length})
          </button>
        </div>
        {/*
          ⚠ Thu gọn bằng `sr-only`, **KHÔNG** bằng `hidden`.
          
          `hidden` gỡ phần tử khỏi CÂY KHẢ TRUY, nên một vùng `aria-live` nằm
          trong đó ngừng thông báo hoàn toàn — người dùng trình đọc màn hình mất
          sạch sự kiện cluster trong suốt thời gian nhật ký đóng, mà nhật ký thì
          mặc định đóng. Bản đầu của bố cục này viết `hidden` kèm một chú thích
          khẳng định điều ngược lại; test bàn phím sau khi đổi bố cục là thứ phát
          hiện ra (`role="log"` không còn tìm thấy).
          
          `sr-only` giấu khỏi MẮT mà giữ nguyên trong cây khả truy, đúng thứ cần:
          nhìn thì gọn, nghe thì vẫn đủ.
        */}
        <div id="k8s-events-body" className={showLog ? 'h-[calc(100%-2.25rem)]' : 'sr-only'}>
          <EventLog events={view.events} />
        </div>
      </section>

      {/* ── 6. Thanh công cụ ───────────────────────────────────────────────── */}
      <div
        className={cn(
          // `bottom-32` — nằm TRÊN ô nhập lệnh ở đáy, không đè lên nó.
          'absolute bottom-32 left-1/2 z-30 -translate-x-1/2',
          HUD_PANEL,
          'flex items-center gap-1 p-1',
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!engineReady}
          onClick={() => dispatch((tick) => ({ tick, kind: 'wait', ticks: 1 }))}
        >
          <Clock aria-hidden="true" className="size-4" />
          Chờ một nhịp
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setFocusedNode(null)}>
          <Crosshair aria-hidden="true" className="size-4" />
          Về góc nhìn
        </Button>
        {wide === false && level !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNarrowPanel((p) => (p === 'level' ? null : 'level'))}
          >
            Mục tiêu
          </Button>
        ) : null}
      </div>

      {/* ── 7. Bản đồ thu nhỏ ──────────────────────────────────────────────── */}
      {wide !== false ? <MiniMap view={view} focusedNode={focusedNode} onFocusNode={setFocusedNode} /> : null}

      {/*
        ── Ô nhập lệnh: đáy màn hình, tràn ngang ────────────────────────────
        
        ⚠ Hiện ở MỌI bề rộng. Bản đầu của bố cục này ẩn nó dưới 1024px cho đỡ
        chật, và như thế là cắt đứt `kubectl` — đường vạn năng của §4.4 — trên
        mọi máy hẹp, tức phá thẳng ô AC "mọi thao tác làm xong được bằng bàn
        phím" đúng ở nhóm thiết bị ít có bàn phím ngoài nhất. §12.6 cho phép gập
        rail và inspector thành drawer, KHÔNG cho phép bỏ một hành động.
      */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto w-[min(48rem,100vw)]">
          <div className={cn(HUD_PANEL, 'overflow-hidden rounded-b-none')}>
            <CommandBar
              disabled={!engineReady}
              onSubmit={(command) => dispatch((tick) => ({ tick, kind: 'kubectl', command }))}
            />
            <ManifestEditor disabled={!engineReady} onApply={(yaml) => dispatch((tick) => ({ tick, kind: 'apply', yaml }))} />
          </div>
        </div>
      </div>

      {/* ── Trạng thái ngoại lệ ────────────────────────────────────────────── */}
      {!engineReady || colorsDegraded ? (
        <div className="absolute top-14 left-1/2 z-40 w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 space-y-1">
          {!engineReady ? (
            <p className={cn('px-3 py-2 text-xs text-foreground', HUD_PANEL)}>
              Bộ máy mô phỏng chưa sẵn sàng, nên chưa chơi được. Giao diện đã dựng đủ và sẽ hoạt động ngay khi engine
              được nối vào.
            </p>
          ) : null}
          {colorsDegraded ? (
            <p className={cn('px-3 py-2 text-xs text-foreground', HUD_PANEL)}>
              Không đọc được màu từ hệ thiết kế, khung 3D đang dùng màu xám tạm. Trạng thái vẫn đọc đúng ở các bảng.
            </p>
          ) : null}
        </div>
      ) : null}

      {level !== null && !winDismissed ? (
        <WinOverlay status={status} level={level} onDismiss={() => setWinDismissed(true)} />
      ) : null}

      {/* Chọn level — cuối DOM vì nó là thao tác hiếm, không thuộc vòng chơi. */}
      {levels.length > 1 ? (
        <div className={cn('absolute top-14 right-3 z-20 p-1', HUD_PANEL)}>
          <label htmlFor="k8s-level-select" className="sr-only">
            Chọn level
          </label>
          <select
            id="k8s-level-select"
            value={levelId ?? ''}
            onChange={(event) => {
              setLevelId(event.target.value);
              setSelectedUid(null);
            }}
            className="h-7 rounded bg-transparent px-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {levels.map((item) => (
              <option key={item.id} value={item.id}>
                {item.chapter}. {item.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {wide === false && narrowPanel !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('absolute top-14 right-3 z-40', HUD_PANEL)}
          onClick={() => setNarrowPanel(null)}
        >
          <X aria-hidden="true" className="size-4" />
          Đóng bảng
        </Button>
      ) : null}
    </div>
  );
}
