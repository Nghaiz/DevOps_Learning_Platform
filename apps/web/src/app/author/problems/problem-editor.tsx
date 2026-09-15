'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@devops-platform/ui';
import type { ProblemState } from '@devops-platform/games';
import { t } from '@devops-platform/copy';
import { ArenaPreview } from './arena-preview';
import { ClassifyFields } from './classify-fields';
import { ClusterFields } from './cluster-fields';
import type { ClusterFormState, FieldIssue } from './cluster-form';
import { parseList } from './text-tools';
import { GameSelectField } from './game-select-field';
import { pluginViewFor } from './game-plugin-view';
import { HintListFields } from './hint-fields';
import { JsonTransfer } from './json-transfer';
import { ObjectiveFields } from './objective-fields';
import { PluginFields } from './plugin-fields';
import { emptyObjective, formWithGame, moveObjective, type ProblemFormState } from './problem-form';
import { StatementFields } from './statement-fields';

/**
 * Khung tab của trình soạn bài — dùng chung cho cả `/new` lẫn `/[code]`.
 *
 * ## Vì sao một khung chung chứ không hai bản
 *
 * Hai trang chỉ khác nhau ở phần HÀNH ĐỘNG (tạo mới vs. lưu + xuất bản + xoá) và
 * ở việc đã có mã hay chưa. Toàn bộ phần soạn thì giống hệt. Hai bản sẽ trôi
 * khỏi nhau đúng ở chỗ dễ trôi nhất — một bên thêm ô, bên kia quên — và người
 * soạn gặp hai biểu mẫu khác nhau cho cùng một bài.
 *
 * `actions` nhận vào dưới dạng node để trang gọi tự quyết nút nào; tab "Xuất
 * bản" chỉ hiện khi `publishTab` được truyền, tức chỉ ở trang sửa.
 */
export function ProblemEditor(props: {
  readonly form: ProblemFormState;
  readonly onChange: (next: ProblemFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly code: string | null;
  readonly state: ProblemState;
  readonly nextKey: () => string;
  readonly hasUnsavedChanges: boolean;
  /** Nút lưu / tạo — trang gọi sở hữu, vì hai trang gọi hai mutation khác nhau. */
  readonly actions: ReactNode;
  readonly publishTab?: ReactNode;
}): ReactElement {
  const [tab, setTab] = useState('mo-ta');

  const patch = (part: Partial<ProblemFormState>): void => {
    props.onChange({ ...props.form, ...part });
  };
  const patchCluster = (part: Partial<ClusterFormState>): void => {
    props.onChange({ ...props.form, cluster: { ...props.form.cluster, ...part } });
  };

  const namespaces = parseList(props.form.cluster.namespacesText);
  const nodeNames = props.form.cluster.nodes
    .map((node) => node.name.trim())
    .filter((name) => name !== '');

  /**
   * Plugin của game đang chọn. `null` khi game chưa có bài tập, và đó là một
   * câu trả lời hợp lệ chứ không phải lỗi (`GameSelectField` hiện trạng thái
   * rỗng cho ca đó).
   */
  const view = pluginViewFor(props.form.gameId);

  return (
    <div className="practice-editor">
      <GameSelectField
        gameId={props.form.gameId}
        // Đổi game trên một bài ĐÃ LƯU là đổi cả kiểu `initialState` của nó,
        // mà máy chủ chưa có đường nhận chuyện đó. Khoá ô lại ở trang sửa thì
        // giới hạn nhìn thấy được; để mở thì người soạn đổi xong rồi mất bản
        // cụm đã dựng, đổi lấy một lỗi 400.
        canChange={props.code === null}
        onChange={(gameId) => {
          // Phép đổi nằm ở `formWithGame` chứ không viết thẳng ở đây: nó phải
          // đổi ba thứ cùng lúc, và một hàm thuần thì ô nghiệm thu đo được mà
          // không phải dựng DOM.
          props.onChange(formWithGame(props.form, gameId));
        }}
      />

      <Tabs
        data-slot="tabs"
        orientation="vertical"
        value={tab}
        onValueChange={(value) => {
          setTab(value);
        }}
      >
        <TabsList className="h-auto max-w-full flex-wrap justify-start [&>[data-slot=tabs-trigger]]:min-h-11">
          <TabsTrigger value="mo-ta">{t('author.problem.tab.statement')}</TabsTrigger>
          {/*
            Nhãn tab tới từ PLUGIN, không phải một hằng: "Cụm ban đầu" đúng với
            K8s và sai với mọi game khác. Đây cũng là dấu hiệu rẻ nhất trên màn
            hình cho thấy ô chọn game đã ăn.
          */}
          <TabsTrigger value="cum">
            {view?.specTabLabel ?? t('author.problem.tab.spec')}
          </TabsTrigger>
          <TabsTrigger value="muc-tieu">
            {t('author.problem.tab.objectives', { n: props.form.objectives.length })}
          </TabsTrigger>
          <TabsTrigger value="goi-y">
            {t('author.problem.tab.hints', { n: props.form.hints.length })}
          </TabsTrigger>
          <TabsTrigger value="thu">{t('author.problem.tab.arena')}</TabsTrigger>
          <TabsTrigger value="json">{t('author.problem.tab.json')}</TabsTrigger>
          {props.publishTab !== undefined && (
            <TabsTrigger value="xuat-ban">{t('author.problem.tab.publish')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="mo-ta">
          <div className="flex flex-col gap-8 pt-4">
            <StatementFields
              form={props.form}
              onChange={patch}
              issues={props.issues}
              code={props.code}
            />
            {/*
              Tập chủ đề tới từ plugin của game đang chọn. Chín chủ đề K8s
              không còn là danh sách dùng chung, và truyền `[]` khi game chưa
              có plugin là đúng nghĩa: chưa có bài tập thì chưa có chủ đề nào.
            */}
            <ClassifyFields
              form={props.form}
              onChange={patch}
              issues={props.issues}
              topics={view?.topics ?? []}
              // §18.D.6 — `false` khi plugin không khai `seedSpec`, tức HÔM NAY
              // là mọi game. `ClassifyFields` vô hiệu hoá ô đánh dấu và nói ra
              // lý do thay vì để người soạn bật một cờ không có tác dụng.
              canSeed={view?.canSeed ?? false}
            />
          </div>
        </TabsContent>

        <TabsContent value="cum">
          <div className="pt-4">
            {view !== null && view.specEditor === 'generic' ? (
              <PluginFields
                fields={view.authorFields}
                value={props.form.specText}
                issues={props.issues}
                onChange={(path, next) => {
                  props.onChange({
                    ...props.form,
                    specText: { ...props.form.specText, [path]: next },
                  });
                }}
              />
            ) : (
              <ClusterFields
                cluster={props.form.cluster}
                issues={props.issues}
                nextKey={props.nextKey}
                onChange={patchCluster}
                onReplace={(cluster) => {
                  props.onChange({ ...props.form, cluster });
                }}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="muc-tieu">
          <section className="flex flex-col gap-4 pt-4">
            <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
              {t('author.problem.objectives.heading')}
            </h2>
            {props.form.objectives.map((objective, index) => (
              <ObjectiveFields
                key={objective.key}
                objective={objective}
                index={index}
                issues={props.issues}
                namespaces={namespaces}
                nodes={nodeNames}
                canRemove={props.form.objectives.length > 1}
                canMoveUp={index > 0}
                canMoveDown={index < props.form.objectives.length - 1}
                onChange={(part) => {
                  patch({
                    objectives: props.form.objectives.map((item, i) =>
                      i === index ? { ...item, ...part } : item,
                    ),
                  });
                }}
                onRemove={() => {
                  patch({ objectives: props.form.objectives.filter((_, i) => i !== index) });
                }}
                onMove={(delta) => {
                  patch({ objectives: moveObjective(props.form.objectives, index, delta) });
                }}
              />
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = emptyObjective(props.nextKey());
                  patch({
                    objectives: [
                      ...props.form.objectives,
                      { ...next, id: `muc-tieu-${String(props.form.objectives.length + 1)}` },
                    ],
                  });
                }}
              >
                {t('author.problem.objectives.add')}
              </Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="goi-y">
          <div className="pt-4">
            <HintListFields
              hints={props.form.hints}
              issues={props.issues}
              nextKey={props.nextKey}
              onChange={(hints) => {
                patch({ hints });
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="thu">
          <div className="pt-4">
            <ArenaPreview
              code={props.code}
              gameId={props.form.gameId}
              hasUnsavedChanges={props.hasUnsavedChanges}
            />
          </div>
        </TabsContent>

        <TabsContent value="json">
          <div className="pt-4">
            <JsonTransfer
              form={props.form}
              code={props.code}
              nextKey={props.nextKey}
              onImport={props.onChange}
            />
          </div>
        </TabsContent>

        {props.publishTab !== undefined && (
          <TabsContent value="xuat-ban">
            <div className="pt-4">{props.publishTab}</div>
          </TabsContent>
        )}
      </Tabs>

      <div className="practice-editor-actions">
        <span className="practice-save-state" role="status">
          {props.hasUnsavedChanges
            ? 'Có thay đổi chưa lưu'
            : props.code === null
              ? 'Bản nháp mới'
              : 'Đã lưu'}
        </span>
        {props.actions}
      </div>
    </div>
  );
}
