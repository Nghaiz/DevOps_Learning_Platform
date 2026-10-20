'use client';

import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import type { ProblemState } from '@devops-platform/games';
import {
  FormBlock,
  IssueList,
  RailSection,
  StateChip,
  StudioEditorFrame,
  StudioPanel,
  focusFieldByPath,
  type SaveStatus,
} from '../../../components/author/studio';
import { topicLook } from '../../../lib/topic-look';
import { ArenaPreview } from './arena-preview';
import { ClassifyFields } from './classify-fields';
import { ClusterFields } from './cluster-fields';
import type { ClusterFormState, FieldIssue } from './cluster-form';
import { GameSelectField } from './game-select-field';
import { pluginViewFor } from './game-plugin-view';
import { HintListFields } from './hint-fields';
import { JsonTransfer } from './json-transfer';
import { ObjectiveList } from './objective-list';
import { PluginFields } from './plugin-fields';
import { STATE_KEYS } from './problem-labels';
import { toStudioIssues } from './problem-issues';
import { PROBLEM_MODES, modeForIssuePath, type ProblemMode } from './problem-modes';
import { formWithGame, type ProblemFormState } from './problem-form';
import { StatementFields } from './statement-fields';
import { toast } from '@devops-platform/ds';

/** Hai việc trang gọi cần làm trên trình soạn: nhảy về một ô, mở một chế độ. */
export interface EditorNav {
  readonly jump: (path: string) => void;
  readonly open: (mode: ProblemMode) => void;
}

/**
 * Trình soạn đề, dùng chung cho `/new` lẫn `/[code]`, dựng trên khung Xưởng soạn.
 *
 * Hai trang chỉ khác nhau ở HÀNH ĐỘNG (tạo mới vs. lưu, xuất bản, xoá), ở việc
 * đã có mã hay chưa, và ở khối độ sẵn sàng trong cột kiểm. Phần soạn giống hệt,
 * nên nó ở một chỗ: hai bản sẽ trôi khỏi nhau đúng ở chỗ một bên thêm ô.
 *
 * `toolbar`, `readiness`, `publish` là hàm nhận `EditorNav`, vì nút trên thanh
 * dính và khối trong cột kiểm cũng phải nhảy được về một ô, mà chế độ đang mở
 * do trình soạn giữ. Chế độ Xuất bản chỉ có khi trang gọi truyền `publish`.
 */
export function ProblemEditor(props: {
  readonly form: ProblemFormState;
  readonly onChange: (next: ProblemFormState) => void;
  readonly nextKey: () => string;
  /** `null` với bài chưa lưu: máy chủ cấp mã, client không đoán. */
  readonly code: string | null;
  readonly state: ProblemState;
  readonly title: string;
  /** Lỗi hiện cạnh ô và trong cột kiểm. */
  readonly issues: readonly FieldIssue[];
  readonly saveStatus: SaveStatus;
  readonly toolbar: (nav: EditorNav) => ReactNode;
  readonly readiness: (nav: EditorNav) => ReactNode;
  readonly publish?: ((nav: EditorNav) => ReactNode) | undefined;
}): ReactElement {
  const { form, onChange } = props;
  const [mode, setMode] = useState<string>(PROBLEM_MODES.statement);

  /** `null` khi game chưa có plugin: một câu trả lời hợp lệ, `GameSelectField` nói ra ca đó. */
  const view = pluginViewFor(form.gameId);
  const specFields = useMemo(() => view?.authorFields ?? [], [view]);
  const look = topicLook({ gameId: form.gameId });
  const studioIssues = useMemo(() => toStudioIssues(props.issues, specFields), [props.issues, specFields]);

  const nav: EditorNav = {
    open: setMode,
    jump: (path) => {
      const target = modeForIssuePath(path, specFields.map((field) => field.path));
      if (target === null) return;
      setMode(target);
      focusFieldByPath(path, () => {
        toast.warning(t('author.problem.jump-missing'));
      });
    },
  };

  const patch = (part: Partial<ProblemFormState>): void => {
    onChange({ ...form, ...part });
  };
  const patchCluster = (part: Partial<ClusterFormState>): void => {
    onChange({ ...form, cluster: { ...form.cluster, ...part } });
  };

  const modes = [
    { value: PROBLEM_MODES.statement, label: t('author.problem.tab.statement') },
    // Nhãn tới từ PLUGIN: "Cụm ban đầu" đúng với K8s và sai với mọi game khác.
    // Đây cũng là dấu hiệu rẻ nhất trên màn hình cho thấy ô chọn game đã ăn.
    { value: PROBLEM_MODES.spec, label: view?.specTabLabel ?? t('author.problem.tab.spec') },
    { value: PROBLEM_MODES.objectives, label: t('author.problem.tab.objectives', { n: form.objectives.length }) },
    { value: PROBLEM_MODES.hints, label: t('author.problem.tab.hints', { n: form.hints.length }) },
    { value: PROBLEM_MODES.arena, label: t('author.problem.tab.arena') },
    { value: PROBLEM_MODES.json, label: t('author.problem.tab.json') },
    ...(props.publish === undefined
      ? []
      : [{ value: PROBLEM_MODES.publish, label: t('author.problem.tab.publish') }]),
  ];

  return (
    // Màu của game đang soạn (`--tp-*`) phủ cả trình soạn: số thứ tự của mục lặp, ô chọn
    // game và khung chơi thử đọc nó, không phải truyền xuống từng component.
    <div data-topic={look.topic}>
    <StudioEditorFrame
      crumbs={[
        { href: '/author/problems', label: t('shell.nav.author-problems') },
        { label: props.code ?? t('author.problem.new.crumb') },
      ]}
      title={props.title}
      status={<StateChip state={props.state} label={t(STATE_KEYS[props.state])} />}
      toolbar={props.toolbar(nav)}
      modes={modes}
      mode={mode}
      onModeChange={setMode}
      rail={
        <>
          <RailSection title={t('author.studio.rail.issues')} tone={studioIssues.length > 0 ? 'bad' : 'ok'}>
            {studioIssues.length > 0 ? (
              <IssueList issues={studioIssues} onJump={nav.jump} />
            ) : (
              <p className="text-ink-2">{t('author.studio.rail.issues-clean')}</p>
            )}
          </RailSection>
          {props.readiness(nav)}
        </>
      }
    >
      <StudioPanel value={PROBLEM_MODES.statement}>
        <FormBlock title={t('author.problem.game.label')}>
          <GameSelectField
            gameId={form.gameId}
            // Đổi game trên bài ĐÃ LƯU là đổi kiểu `initialState` của nó, mà máy
            // chủ chưa có đường nhận chuyện đó: khoá ở trang sửa thì giới hạn
            // nhìn thấy được, mở thì người soạn mất cụm đã dựng đổi lấy lỗi 400.
            canChange={props.code === null}
            onChange={(gameId) => {
              onChange(formWithGame(form, gameId));
            }}
          />
        </FormBlock>
        <FormBlock title={t('problem.statement-fields-mo-ta')}>
          <StatementFields form={form} onChange={patch} issues={props.issues} code={props.code} />
        </FormBlock>
        <FormBlock title={t('problem.classify-fields-phan-loai')}>
          <ClassifyFields
            form={form}
            onChange={patch}
            issues={props.issues}
            topics={view?.topics ?? []}
            // §18.D.6: `false` khi plugin không khai `seedSpec`, tức hôm nay là mọi game.
            canSeed={view?.canSeed ?? false}
          />
        </FormBlock>
      </StudioPanel>

      <StudioPanel value={PROBLEM_MODES.spec}>
        {view !== null && view.specEditor === 'generic' ? (
          <FormBlock title={view.specTabLabel}>
            <PluginFields
              fields={view.authorFields}
              value={form.specText}
              issues={props.issues}
              onChange={(path, next) => {
                onChange({ ...form, specText: { ...form.specText, [path]: next } });
              }}
            />
          </FormBlock>
        ) : (
          <ClusterFields
            cluster={form.cluster}
            issues={props.issues}
            nextKey={props.nextKey}
            onChange={patchCluster}
            onReplace={(cluster) => {
              onChange({ ...form, cluster });
            }}
          />
        )}
      </StudioPanel>

      <StudioPanel value={PROBLEM_MODES.objectives}>
        <ObjectiveList form={form} onChange={patch} issues={props.issues} nextKey={props.nextKey} />
      </StudioPanel>

      <StudioPanel value={PROBLEM_MODES.hints}>
        <FormBlock title={t('problem.hint-fields-goi-y')}>
          <HintListFields
            hints={form.hints}
            issues={props.issues}
            nextKey={props.nextKey}
            onChange={(hints) => {
              patch({ hints });
            }}
          />
        </FormBlock>
      </StudioPanel>

      <StudioPanel value={PROBLEM_MODES.arena}>
        <ArenaPreview code={props.code} gameId={form.gameId} saveStatus={props.saveStatus} />
      </StudioPanel>

      <StudioPanel value={PROBLEM_MODES.json}>
        <JsonTransfer form={form} code={props.code} nextKey={props.nextKey} onImport={onChange} />
      </StudioPanel>

      {props.publish !== undefined && (
        <StudioPanel value={PROBLEM_MODES.publish}>{props.publish(nav)}</StudioPanel>
      )}
    </StudioEditorFrame>
    </div>
  );
}
