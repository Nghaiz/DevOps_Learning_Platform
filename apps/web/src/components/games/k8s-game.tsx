'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Boxes, Clock, Crosshair, PanelRightClose, ScrollText } from 'lucide-react';
import type { ClusterView, CreateSession, GameAction, K8sSession, Level, ObjectView } from '@devops-platform/games';
import { LEVELS, createSession as createRealSession } from '@devops-platform/games';
import { Button, cn } from '@devops-platform/ui';
import { useMinWidth } from '../shell/use-min-width';
import { CommandBar, ManifestEditor } from './command-bar';
import { EventLog } from './event-log';
import { EMPTY_VIEW, toResourceRef, useSessionSnapshot } from './game-session';
import { useDisplayPreference } from './game-preferences';
import { HUD_PANEL, HUD_PANEL_FLUSH, MiniMap, TopBar, WinOverlay, Z } from './game-hud';
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

/**
 * ⚠ Mọi prop đều TUỲ CHỌN, và mặc định là dữ liệu THẬT — không phải để tiện, mà
 * vì route không truyền được chúng.
 *
 * `app/games/k8s/page.tsx` là **server component**, và một hàm không serialize
 * được qua ranh giới server→client: truyền `createSession` xuống dưới dạng prop
 * sẽ ném lúc chạy, không phải lúc biên dịch. Nên vỏ game tự import lấy, còn
 * route giữ đúng vai một lớp mỏng chỉ sở hữu `metadata`.
 *
 * Prop vẫn còn để TEST tiêm được bản giả (`k8s-game.dom.test.tsx` dựng một
 * `K8sSession` ghi lại action) — đó là lý do duy nhất chúng tồn tại.
 */
export interface K8sGameProps {
  /** Mặc định: `LEVELS` thật từ `@devops-platform/games`. */
  readonly levels?: readonly Level[];
  readonly initialLevelId?: string;
  /**
   * Hàm dựng phiên chơi, do lane B hiện thực.
   *
   * Mặc định là `createSession` THẬT từ barrel. Prop còn lại chỉ để test tiêm
   * bản giả.
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
export function K8sGame({
  levels = LEVELS,
  initialLevelId,
  createSession = createRealSession,
  seed = DEFAULT_SEED,
}: K8sGameProps): ReactElement {
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
  const [speed, setSpeedState] = useState(1);

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

  const changeSpeed = useCallback(
    (multiplier: number): void => {
      setSpeedState(multiplier);
      // `setSpeed` là method của PHIÊN, không phải một `GameAction`: tốc độ đổi
      // nhịp đồng hồ treo tường chứ không đổi chuỗi tick, nên nó không được vào
      // `RunLog` — lúc phát lại, "chạy gấp bốn" là một chỉ thị vô nghĩa.
      session?.setSpeed(multiplier);
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

  /*
   * ⚠ Cầu nối scene ↔ phiên chơi. Đây là chỗ đã hỏng một lần, và triệu chứng của
   * nó đúng bằng lời chủ dự án: "không có cảnh 3D nào".
   *
   * Bản trước dựng `sceneSubscribe`/`sceneGetView` bằng `useMemo([session])`, nên
   * khi `session` còn `null` (nó được tạo trong một effect, tức LUÔN null ở lượt
   * render đầu) hai hàm đó là bản rỗng. Scene đăng ký nghe ĐÚNG MỘT LẦN trong
   * effect dựng của nó — và nó đăng ký vào bản rỗng đó. Phiên thật đến sau, prop
   * đổi, nhưng không có gì đăng ký lại: cảnh treo ở `EMPTY_VIEW` vĩnh viễn.
   *
   * Không một test cấu trúc nào bắt được (jsdom không dựng WebGL) và không một
   * assertion nào của bản trước bắt được — `objects: 0` đọc ra hệt như "cụm rỗng",
   * mà cụm rỗng là trạng thái hợp lệ của level 1.
   *
   * Cách sửa: hai hàm này ỔN ĐỊNH vĩnh viễn (`useCallback` deps rỗng) và đọc qua
   * ref, còn một effect riêng nối phiên hiện tại vào tập listener rồi bắn một
   * lượt đồng bộ ngay khi phiên đổi.
   */
  const sessionRef = useRef<K8sSession | null>(session);
  sessionRef.current = session;
  const sceneListeners = useRef<Set<() => void>>(new Set());

  const sceneSubscribe = useCallback((listener: () => void) => {
    sceneListeners.current.add(listener);
    return () => {
      sceneListeners.current.delete(listener);
    };
  }, []);

  const sceneGetView = useCallback((): ClusterView => sessionRef.current?.getView() ?? EMPTY_VIEW, []);

  useEffect(() => {
    if (session === null) {
      return;
    }
    const notify = (): void => {
      for (const listener of sceneListeners.current) {
        listener();
      }
    };
    // Bắn ngay một lượt: phiên vừa đổi (đổi level) thì cảnh phải vẽ lại NGAY,
    // không đợi tick đầu tiên của mô phỏng.
    notify();
    return session.subscribe(notify);
  }, [session]);

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

  const inspectorOpen = showInspector;

  return (
    /*
     * ⛔ `dark` CHỐT CỨNG (§14.2) — trang game không theo theme của ứng dụng.
     *
     * Chủ dự án bác bản trước vì "trắng xoá, không màu, không hiệu ứng": app đang
     * ở theme sáng và game thừa hưởng nó. Bloom, phát sáng emissive, sương mù và
     * bóng đổ đều được thiết kế cho nền tối và KHÔNG cái nào đọc được trên nền
     * trắng — một cảnh 3D sáng trưng không phải một biến thể phong cách, nó là
     * cùng cảnh đó bị hỏng.
     *
     * Không phá hợp đồng token: `.dark` là biến thể theo class khai ở
     * `globals.css`, nên mọi token bên trong tự phân giải sang nhánh tối. Không
     * hex, không giá trị cứng, không token mới. Trang `/games` (catalog) vẫn theo
     * theme người dùng — chỉ route immersive chốt tối.
     */
    <div className="dark relative h-full w-full overflow-hidden bg-background text-foreground">
      {/* ── z-0: canvas, KHÔNG bao giờ bị thu nhỏ để nhường chỗ ───────────── */}
      <div className="absolute inset-0 z-0">
        {display.scene3d === null ? (
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
              Hiệu ứng 3D đang tắt. Toàn bộ trạng thái cluster nằm ở các bảng trên màn hình.
            </p>
          </div>
        )}
      </div>

      {/*
        ── Lớp overlay: TRONG SUỐT với chuột, con của nó thì không ───────────

        Đây là cơ chế mà cả bố cục toàn màn hình đứng lên: một lớp phủ kín màn
        hình với `pointer-events-none`, và mỗi phần tử con tự bật lại `auto`.
        Nhờ vậy mọi KHOẢNG TRỐNG giữa các panel vẫn thuộc về canvas — kéo xoay
        camera ở đó vẫn được — trong khi panel vẫn bấm được như thường.

        Không có nó thì phải tự hit-test toạ độ chuột để đoán xem cú bấm rơi vào
        panel hay vào cảnh, và đó là loại mã không bao giờ đúng hết mọi trường hợp.
      */}
      <div className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto">
        {/*
          Vùng thông báo cho sự kiện GIAO DIỆN. Tách khỏi `EventLog`, vốn là vùng
          sống cho sự kiện của cluster: gộp lại thì mỗi cú chọn một pod chen vào
          giữa dòng chảy sự cố và nhật ký mất tác dụng làm bằng chứng chẩn đoán.
        */}
        <p role="status" aria-live="polite" className="sr-only">
          {notice}
        </p>

        <TopBar view={view} level={level} speed={speed} onSpeed={changeSpeed} settings={settings} />

        {/*
          ── Rail trái: tài nguyên + nhật ký ─────────────────────────────────

          Nhật ký ĐẶT TRONG rail chứ không nổi riêng ở góc dưới-trái. Bản trước
          để nó nổi riêng và nó đè lên rail ở màn 1280px — mỗi hộp trôi nổi là
          thêm một cơ hội chồng lấn. Ở đây cột trái đọc thành một câu: "cụm có
          gì", rồi "vừa xảy ra chuyện gì".

          `w-52` (208px) chứ không phải 68px như bản gốc: rail của họ chỉ có icon,
          rail của ta có nhãn tiếng Việt.
        */}
        <section
          aria-labelledby="k8s-rail-heading"
          className={cn(
            'absolute flex flex-col border-border/60',
            Z.panel,
            HUD_PANEL_FLUSH,
            wide === false ? 'inset-x-0 top-12 h-24 border-b' : 'top-12 bottom-0 left-0 w-52 border-r',
          )}
        >
          <h2 id="k8s-rail-heading" className="sr-only">
            Tài nguyên trong cluster
          </h2>
          <div className="min-h-0 flex-1 overflow-auto">
            <ResourceRail objects={view.objects} selectedUid={selectedUid} onSelect={selectObject} />
          </div>
          {wide !== false ? (
            <div className="shrink-0 border-t border-border/60">
              <button
                type="button"
                aria-expanded={showLog}
                aria-controls="k8s-events-body"
                className="flex h-8 w-full items-center gap-1.5 px-3 text-[11px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => setShowLog((value) => !value)}
              >
                <ScrollText aria-hidden="true" className="size-3.5" />
                Nhật ký ({view.events.length})
              </button>
              {/*
                ⚠ Thu gọn bằng `sr-only`, KHÔNG bằng `hidden`. `hidden` gỡ phần
                tử khỏi CÂY KHẢ TRUY, nên vùng `aria-live` bên trong ngừng thông
                báo — mà nhật ký mặc định đóng, tức người dùng trình đọc màn hình
                mất sạch sự kiện cluster gần như suốt ván chơi.
              */}
              <div id="k8s-events-body" className={showLog ? 'h-44' : 'sr-only'}>
                <EventLog events={view.events} />
              </div>
            </div>
          ) : null}
        </section>

        {/*
          ── Thẻ level ────────────────────────────────────────────────────────

          `left-56` = 224px, tức NGAY SAU rail 208px cộng 16px thở. Bản trước đặt
          `left-3` và thẻ chui xuống dưới rail, mất hẳn mép trái — chữ hiện ra
          thành "…ainer trực", "…ếp lên node". Không assertion cấu trúc nào bắt
          được: phần tử vẫn tồn tại, vẫn đúng vị trí đã khai, chỉ là bị một phần
          tử khác đè lên. Chỉ ảnh chụp mới thấy.
        */}
        {showLevelCard && level !== null ? (
          <LevelCard
            level={level}
            status={status}
            onRevealHint={(index) => dispatch((tick) => ({ tick, kind: 'hint', index }))}
            className={wide === false ? 'inset-x-3 top-40 max-h-[45vh]' : 'top-14 left-56 w-80'}
          />
        ) : null}

        {/* ── Inspector ──────────────────────────────────────────────────── */}
        {showInspector ? (
          <section
            aria-labelledby="k8s-inspector-heading"
            className={cn(
              'absolute flex flex-col overflow-hidden',
              Z.panel,
              wide === false
                ? cn('inset-x-3 bottom-28 max-h-[45vh]', HUD_PANEL)
                : cn('top-12 right-0 bottom-0 w-96 border-l', HUD_PANEL_FLUSH),
            )}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
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
            <div className="min-h-0 flex-1 overflow-y-auto">
              <InspectorPanel
                object={selected}
                onDelete={(object) => dispatch((tick) => ({ tick, kind: 'delete', target: toResourceRef(object) }))}
                onScale={(object, replicas) =>
                  dispatch((tick) => ({ tick, kind: 'scale', target: toResourceRef(object), replicas }))
                }
                onEdit={(object, yaml) => dispatch((tick) => ({ tick, kind: 'edit', target: toResourceRef(object), yaml }))}
              />
            </div>
          </section>
        ) : null}

        {/*
          ── Cụm đáy: thanh công cụ + ô lệnh, GỘP làm một ────────────────────

          Bản trước để chúng là hai khối nổi riêng ở hai độ cao khác nhau, và mỗi
          khối nổi riêng là thêm một cơ hội chồng lấn. Gộp lại thì quan hệ trên
          dưới do flexbox giữ, không do hai con số `bottom-*` phải khớp bằng tay.

          Trái căn theo rail, phải căn theo inspector — nên cụm này KHÔNG bao giờ
          chui xuống dưới hai panel đó, ở bất kỳ bề rộng nào.
        */}
        <div
          className={cn(
            'absolute bottom-4 flex justify-center',
            Z.input,
            wide === false ? 'inset-x-3' : cn('left-56', inspectorOpen ? 'right-[25rem]' : 'right-4'),
          )}
        >
          <div className={cn('w-[min(42rem,100%)] overflow-hidden', HUD_PANEL)}>
            <div className="flex flex-wrap items-center gap-1 border-b border-border/60 p-1">
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
                  onClick={() => setNarrowPanel((current) => (current === 'level' ? null : 'level'))}
                >
                  Mục tiêu
                </Button>
              ) : null}
              {wide === false ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowLog((value) => !value)}>
                  <ScrollText aria-hidden="true" className="size-4" />
                  Nhật ký
                </Button>
              ) : null}
            </div>
            <CommandBar
              disabled={!engineReady}
              onSubmit={(command) => dispatch((tick) => ({ tick, kind: 'kubectl', command }))}
            />
            <ManifestEditor disabled={!engineReady} onApply={(yaml) => dispatch((tick) => ({ tick, kind: 'apply', yaml }))} />
          </div>
        </div>

        {/*
          Ở màn hẹp nhật ký không nằm trong rail (rail lúc đó là một dải ngang),
          nên nó cần chỗ riêng — nhưng vùng `aria-live` phải LUÔN có mặt, kể cả
          khi mắt không thấy, nếu không thông báo im lặng biến mất.
        */}
        {wide === false ? (
          <section
            aria-label="Nhật ký sự kiện"
            className={cn('absolute inset-x-3 bottom-28', Z.panel, showLog ? cn('h-40', HUD_PANEL) : 'sr-only')}
          >
            <EventLog events={view.events} />
          </section>
        ) : null}

        {/* ── Bản đồ thu nhỏ ─────────────────────────────────────────────── */}
        {wide !== false ? (
          <MiniMap
            view={view}
            focusedNode={focusedNode}
            onFocusNode={setFocusedNode}
            // Né inspector thay vì chui xuống dưới nó. Bản gốc có đúng lỗi này
            // (nghiên cứu §2.7: drawer phủ lên rail ở màn rộng) — biết trước thì
            // không việc gì phải chép lại.
            // `bottom-52` (208px), KHÔNG phải `bottom-32`: cụm đáy cao ~185px, nên
            // ở 1280×720 bản đồ nằm đúng ngang tầm nó và bị cắt mất cột trái.
            // Thấy được trên ẢNH CHỤP 1280, không thấy được ở 1920 — đúng lý do
            // §14.4 đòi hai bề rộng chứ không phải một.
            className={cn('bottom-52', inspectorOpen ? 'right-[25rem]' : 'right-4')}
          />
        ) : null}

        {/* ── Trạng thái ngoại lệ ────────────────────────────────────────── */}
        {colorsDegraded ? (
          <p
            className={cn(
              'absolute top-14 left-1/2 w-[min(30rem,calc(100vw-1.5rem))] -translate-x-1/2 px-3 py-2 text-xs text-foreground',
              Z.hud,
              HUD_PANEL,
            )}
          >
            Không đọc được màu từ hệ thiết kế, khung 3D đang dùng màu xám tạm. Trạng thái vẫn đọc đúng ở các bảng.
          </p>
        ) : null}

        {level !== null && !winDismissed ? (
          <WinOverlay status={status} level={level} onDismiss={() => setWinDismissed(true)} />
        ) : null}

        {/* Chọn level — thao tác hiếm, nằm cuối DOM vì nó không thuộc vòng chơi. */}
        {levels.length > 1 ? (
          <div
            className={cn(
              'absolute top-14 right-3 p-1',
              Z.panel,
              HUD_PANEL,
              inspectorOpen && wide !== false ? 'hidden' : '',
            )}
          >
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
              className="h-7 max-w-56 rounded bg-transparent px-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {levels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.chapter}. {item.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </div>
  );
}
