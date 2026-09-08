'use client';

/**
 * Mọi lớp nổi trên canvas 3D.
 *
 * ⛔ Vỏ ngoài đặt `pointer-events-none`; từng bảng con tự bật lại
 * `pointer-events-auto`. Bỏ luật này thì một `div` trong suốt phủ toàn màn sẽ
 * nuốt mọi cú kéo camera, và người dùng không xoay được cảnh mà cũng không thấy
 * gì chặn mình.
 *
 * ⛔ Bảng thông số KHÔNG có nhánh "chưa chọn gì". `InspectorPanel` tự trả `null`
 * khi không có object, và ở đây không được thêm một khung rỗng thay thế.
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { Level, NodeView, ObjectView } from '@devops-platform/games';
import { computeScore } from '@devops-platform/games';
import type { ArenaModeContext, CameraCommand, QualityTier, ScreenPoint } from './arena-contract';
import type { ArenaSessionHandle } from './arena-session';
import { ArenaAnnouncer } from './arena-announcer';
import { PaletteRail } from './hud/palette-rail';
import { MissionCard } from './hud/mission-card';
import { CodexDrawer } from './hud/codex-drawer';
import { TerminalPanel } from './hud/terminal-panel';
import { TopBar } from './hud/top-bar';
import { ArenaDock } from './hud/arena-dock';
import { useOverlayManager } from './hud/overlay-manager';
import { InspectorPanel } from './hud/inspector-panel';
import { ArenaContextMenu } from './hud/context-menu';
import { MetricsPanel } from './hud/metrics-panel';
import { IncidentsPanel } from './hud/incidents-panel';
import { Minimap } from './hud/minimap';
import { SettingsPanel } from './hud/settings-panel';
import { SceneMenu, type SceneMenuAction } from './hud/scene-menu';
import { EventLog } from './hud/event-log';
import type { TerminalInsert } from './hud/terminal-panel';

export interface ArenaOverlaysProps {
  readonly engine: ArenaSessionHandle;
  readonly level: Level;
  readonly mode: ArenaModeContext;
  readonly quality: QualityTier;
  readonly startedAt: number;
  readonly selectedObject: ObjectView | null;
  readonly describeText: string | null;
  readonly menuUid: string | null;
  readonly menuAnchor: ScreenPoint | null;
  /** Chuột phải vào chỗ trống. `null` ⇒ menu cảnh không tồn tại trong DOM. */
  readonly sceneMenuAnchor: ScreenPoint | null;
  readonly listObjects: () => readonly ObjectView[];
  readonly onSelect: (uid: string | null) => void;
  /** Chọn VÀ bay camera tới. Tách khỏi `onSelect` — xem `selectObject` ở `arena-root`. */
  readonly onFocusObject: (uid: string) => void;
  readonly onSelectNode: (nodeName: string) => void;
  readonly onCloseMenu: () => void;
  readonly onCloseSceneMenu: () => void;
  readonly onCamera: (kind: CameraCommand['kind']) => void;
  readonly onQuality: (tier: QualityTier) => void;
  readonly showLabels: boolean;
  readonly onShowLabels: (next: boolean) => void;
  readonly showEdges: boolean;
  readonly onShowEdges: (next: boolean) => void;
  /** Có tài nguyên nào đang bị kéo lệch khỏi bố cục tự động không. */
  readonly canAutoAlign: boolean;
  readonly onAutoAlign: () => void;
  readonly onExit: () => void;
}

export function ArenaOverlays(props: ArenaOverlaysProps): ReactElement {
  const { engine, level, mode, selectedObject, listObjects, onSelect } = props;
  const [insert, setInsert] = useState<TerminalInsert | null>(null);

  const overlays = useOverlayManager({
    codexAvailable: mode.codexAvailable,
    onCamera: props.onCamera,
    onPauseResume: engine.togglePause,
    onAutoAlign: props.onAutoAlign,
  });

  /*
   * Menu chuột phải trên chỗ trống. Mọi mục ở đây đều thao tác trên CẢ CẢNH —
   * không mục nào cần một tài nguyên đang chọn, nên menu này mở được ở bất kỳ
   * đâu và không bao giờ rơi vào trạng thái rỗng nghĩa.
   */
  const sceneActions = useMemo<readonly SceneMenuAction[]>(
    () => [
      {
        id: 'auto-align',
        label: 'Sắp xếp lại',
        hint: 'Trả mọi tài nguyên bạn đã kéo về đúng chỗ bố cục tự động tính.',
        disabled: !props.canAutoAlign,
        run: props.onAutoAlign,
      },
      {
        id: 'frame-all',
        label: 'Xem toàn cụm',
        hint: 'Lùi camera ra đủ xa để cả cụm lọt khung, giữ nguyên hướng nhìn.',
        run: () => props.onCamera('frame-all'),
      },
      {
        id: 'reset-camera',
        label: 'Đặt lại góc nhìn',
        hint: 'Về góc nhìn chéo mặc định.',
        run: () => props.onCamera('reset'),
      },
      {
        id: 'pause',
        label: engine.paused ? 'Chạy tiếp mô phỏng' : 'Tạm dừng mô phỏng',
        hint: 'Dừng hẳn đồng hồ mô phỏng để đọc kỹ một trạng thái.',
        run: engine.togglePause,
      },
      {
        id: 'settings',
        label: 'Cài đặt…',
        hint: 'Tốc độ, bậc chất lượng, nhãn và dây quan hệ.',
        run: () => overlays.show('settings'),
      },
    ],
    [props, engine.paused, engine.togglePause, overlays],
  );

  const insertCommand = useCallback(
    (command: string) => {
      overlays.show('terminal');
      setInsert({ command, issuedAt: performance.now() });
    },
    [overlays],
  );

  const selectedNode = useMemo<NodeView | null>(() => {
    if (selectedObject === null) {
      return null;
    }
    return engine.view.nodes.find((node) => node.name === (selectedObject.kind === 'Node' ? selectedObject.name : selectedObject.nodeName)) ?? null;
  }, [engine.view, selectedObject]);

  const menuObject = useMemo<ObjectView | null>(
    () => (props.menuUid === null ? null : (engine.view.objects.find((o) => o.uid === props.menuUid) ?? null)),
    [engine.view, props.menuUid],
  );

  /*
   * Manifest THẬT của tài nguyên đang chọn — nguồn của ô soạn thảo YAML.
   *
   * Tính lại theo `engine.view` chứ không theo tick: bảng HUD đã được tiết chế
   * xuống 100ms, nên đây là nhịp chậm nhất mà nội dung vẫn không bị đọc ra là
   * cũ. Bám theo tick sẽ dựng lại chuỗi YAML nhiều lần mỗi giây cho một ô mà
   * hầu hết thời gian không ai mở.
   */
  const manifestYaml = useMemo(
    () => (selectedObject === null ? null : engine.manifest(selectedObject.uid)),
    [engine, selectedObject, engine.view],
  );

  const stars = useStars(level, engine);

  return (
    <div className="pointer-events-none absolute inset-0">
      <ArenaAnnouncer events={engine.view.events} />
      <ArenaDock
        overlays={overlays}
        onCamera={props.onCamera}
        codexAvailable={mode.codexAvailable}
        canAutoAlign={props.canAutoAlign}
        onAutoAlign={props.onAutoAlign}
      />

      <div className="pointer-events-auto absolute inset-x-0 top-0 z-30">
        <TopBar
          code={level.id}
          title={level.title}
          objectives={level.objectives}
          metIds={engine.status.objectivesMet}
          guardIds={engine.guardObjectiveIds}
          startedAt={props.startedAt}
          simulationTick={engine.view.tick}
          stars={stars}
          speed={engine.paused ? 0 : engine.speed}
          onSpeedChange={engine.setSpeed}
          onExit={props.onExit}
          onSettings={() => overlays.toggle('settings')}
        />
      </div>

      <PaletteRail
        open={overlays.isOpen('palette')}
        featuredResources={level.allowedResources}
        listObjects={listObjects}
        dispatch={engine.dispatch}
        getTick={engine.getTick}
      />

      <MissionCard
        open={overlays.isOpen('mission')}
        code={level.id}
        goal={level.mission}
        objectives={level.objectives}
        metIds={engine.status.objectivesMet}
        guardIds={engine.guardObjectiveIds}
        hints={level.hints}
        hintsRevealed={engine.hintsRevealed}
        codexAvailable={mode.codexAvailable}
        hintsCostPoints={mode.hintsCostPoints}
        dispatch={engine.dispatch}
        getTick={engine.getTick}
        onOpenCodex={() => overlays.show('codex')}
      />

      {mode.codexAvailable ? (
        <CodexDrawer
          open={overlays.isOpen('codex')}
          teaching={level.teaching}
          showTakeaways={engine.status.phase === 'won'}
          onClose={() => overlays.hide('codex')}
          onInsertCommand={insertCommand}
        />
      ) : null}

      <TerminalPanel
        open={overlays.isOpen('terminal')}
        onClose={() => overlays.hide('terminal')}
        onRun={engine.runCommand}
        listObjects={listObjects}
        insert={insert}
      />

      {/*
        Bảng thông số: KHÔNG bọc điều kiện ở đây. `InspectorPanel` giữ nội dung
        sống thêm một nhịp để chạy nốt hiệu ứng trượt ra rồi mới tự trả `null`.
        Bọc thêm `selectedObject !== null` ở ngoài sẽ cắt nó khỏi cây ngay lập
        tức và hiệu ứng đó không bao giờ chạy.
      */}
      <InspectorPanel
        object={selectedObject}
        node={selectedNode}
        tick={engine.view.tick}
        events={engine.view.events}
        describeText={props.describeText}
        manifestYaml={manifestYaml}
        dispatch={engine.dispatch}
        onEdit={engine.editResource}
        onClose={() => onSelect(null)}
      />

      <ArenaContextMenu
        object={menuObject}
        anchor={props.menuAnchor}
        tick={engine.view.tick}
        dispatch={engine.dispatch}
        onClose={props.onCloseMenu}
        onInspect={onSelect}
        onFocus={props.onFocusObject}
      />

      <SceneMenu
        anchor={props.sceneMenuAnchor}
        actions={sceneActions}
        onClose={props.onCloseSceneMenu}
      />

      <SettingsPanel
        open={overlays.isOpen('settings')}
        speed={engine.speed}
        paused={engine.paused}
        onSpeed={engine.setSpeed}
        onTogglePause={engine.togglePause}
        quality={props.quality}
        onQuality={props.onQuality}
        showLabels={props.showLabels}
        onShowLabels={props.onShowLabels}
        showEdges={props.showEdges}
        onShowEdges={props.onShowEdges}
        canAutoAlign={props.canAutoAlign}
        onAutoAlign={props.onAutoAlign}
        onClose={() => overlays.hide('settings')}
      />

      {overlays.isOpen('minimap') ? (
        <Minimap
          view={engine.view}
          onSelectNode={props.onSelectNode}
          className="arena-minimap pointer-events-auto absolute bottom-20 right-4 z-20"
        />
      ) : null}

      {overlays.isOpen('metrics') ? (
        <MetricsPanel
          view={engine.view}
          onClose={() => overlays.hide('metrics')}
          className="pointer-events-auto absolute bottom-20 left-28 z-20"
        />
      ) : null}

      {overlays.isOpen('incidents') ? (
        <IncidentsPanel
          incidents={engine.view.incidents}
          objects={engine.view.objects}
          tick={engine.view.tick}
          onSelect={onSelect}
          onClose={() => overlays.hide('incidents')}
          className="pointer-events-auto absolute left-1/2 top-16 z-20 -translate-x-1/2"
        />
      ) : null}

      {overlays.isOpen('eventLog') ? (
        <EventLog
          events={engine.view.events}
          onClose={() => overlays.hide('eventLog')}
          className="pointer-events-auto absolute bottom-20 left-1/2 z-20 -translate-x-1/2"
        />
      ) : null}
    </div>
  );
}

/**
 * Số sao hiện trên thanh trên cùng, 0..3.
 *
 * TÍNH từ điểm, không lưu — `SessionStatus` cố ý không mang số sao, và thêm nó
 * vào đó sẽ là một trường suy ra được nằm cạnh chính các trường suy ra nó.
 */
function useStars(level: Level, engine: ArenaSessionHandle): number {
  return useMemo(() => {
    if (engine.status.phase !== 'won') {
      return 0;
    }
    const score = computeScore({
      objectivesMet: engine.status.objectivesMet.length,
      objectivesTotal: level.objectives.length,
      movesUsed: engine.status.movesUsed,
      parMoves: level.parMoves,
      hintsUsed: engine.status.hintsRevealed,
      hintsAvailable: level.hints.length,
    });
    if (score >= 900) {
      return 3;
    }
    if (score >= 700) {
      return 2;
    }
    return 1;
  }, [engine.status, engine.hintsRevealed, level]);
}

