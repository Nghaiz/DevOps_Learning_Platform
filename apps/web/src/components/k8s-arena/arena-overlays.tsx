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
import { useOverlayManager } from './hud/overlay-manager';
import { InspectorPanel } from './hud/inspector-panel';
import { ArenaContextMenu } from './hud/context-menu';
import { MetricsPanel } from './hud/metrics-panel';
import { IncidentsPanel } from './hud/incidents-panel';
import { Minimap } from './hud/minimap';
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
  readonly listObjects: () => readonly ObjectView[];
  readonly onSelect: (uid: string | null) => void;
  readonly onSelectNode: (nodeName: string) => void;
  readonly onCloseMenu: () => void;
  readonly onCamera: (kind: CameraCommand['kind']) => void;
  readonly onExit: () => void;
}

export function ArenaOverlays(props: ArenaOverlaysProps): ReactElement {
  const { engine, level, mode, selectedObject, listObjects, onSelect } = props;
  const [insert, setInsert] = useState<TerminalInsert | null>(null);

  const overlays = useOverlayManager({
    codexAvailable: mode.codexAvailable,
    onCamera: props.onCamera,
    onPauseResume: engine.togglePause,
  });

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
    return engine.view.nodes.find((node) => node.name === selectedObject.nodeName) ?? null;
  }, [engine.view, selectedObject]);

  const menuObject = useMemo<ObjectView | null>(
    () => (props.menuUid === null ? null : (engine.view.objects.find((o) => o.uid === props.menuUid) ?? null)),
    [engine.view, props.menuUid],
  );

  const stars = useStars(level, engine);

  return (
    <div className="pointer-events-none absolute inset-0">
      <ArenaAnnouncer events={engine.view.events} />

      <div className="pointer-events-auto absolute inset-x-0 top-0 z-30">
        <TopBar
          code={level.id}
          title={level.title}
          objectives={level.objectives}
          metIds={engine.status.objectivesMet}
          startedAt={props.startedAt}
          stars={stars}
          speed={engine.paused ? 0 : engine.speed}
          onSpeedChange={engine.setSpeed}
          onExit={props.onExit}
          onSettings={() => overlays.toggle('codex')}
        />
      </div>

      <PaletteRail
        open={overlays.isOpen('palette')}
        allowedResources={level.allowedResources}
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
        events={engine.view.events.filter((event) => event.involvedUid === selectedObject?.uid)}
        describeText={props.describeText}
        dispatch={engine.dispatch}
        onClose={() => onSelect(null)}
      />

      <ArenaContextMenu
        object={menuObject}
        anchor={props.menuAnchor}
        tick={engine.view.tick}
        dispatch={engine.dispatch}
        onClose={props.onCloseMenu}
        onInspect={onSelect}
      />

      {overlays.isOpen('minimap') ? (
        <Minimap
          view={engine.view}
          onSelectNode={props.onSelectNode}
          className="pointer-events-auto absolute bottom-4 right-4 z-20"
        />
      ) : null}

      {overlays.isOpen('metrics') ? (
        <MetricsPanel
          view={engine.view}
          onClose={() => overlays.hide('metrics')}
          className="pointer-events-auto absolute bottom-4 left-20 z-20"
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
          className="pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
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
