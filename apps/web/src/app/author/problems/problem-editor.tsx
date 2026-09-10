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
import { HintListFields } from './hint-fields';
import { JsonTransfer } from './json-transfer';
import { ObjectiveFields } from './objective-fields';
import { emptyObjective, type ProblemFormState } from './problem-form';
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
  const nodeNames = props.form.cluster.nodes.map((node) => node.name.trim()).filter((name) => name !== '');

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
        }}
      >
        <TabsList>
          <TabsTrigger value="mo-ta">{t('author.problem.tab.statement')}</TabsTrigger>
          <TabsTrigger value="cum">{t('author.problem.tab.cluster')}</TabsTrigger>
          <TabsTrigger value="muc-tieu">{t('author.problem.tab.objectives', { n: props.form.objectives.length })}</TabsTrigger>
          <TabsTrigger value="goi-y">{t('author.problem.tab.hints', { n: props.form.hints.length })}</TabsTrigger>
          <TabsTrigger value="thu">{t('author.problem.tab.arena')}</TabsTrigger>
          <TabsTrigger value="json">{t('author.problem.tab.json')}</TabsTrigger>
          {props.publishTab !== undefined && <TabsTrigger value="xuat-ban">{t('author.problem.tab.publish')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="mo-ta">
          <div className="flex flex-col gap-8 pt-4">
            <StatementFields form={props.form} onChange={patch} issues={props.issues} code={props.code} />
            <ClassifyFields form={props.form} onChange={patch} issues={props.issues} />
          </div>
        </TabsContent>

        <TabsContent value="cum">
          <div className="pt-4">
            <ClusterFields
              cluster={props.form.cluster}
              issues={props.issues}
              nextKey={props.nextKey}
              onChange={patchCluster}
              onReplace={(cluster) => {
                props.onChange({ ...props.form, cluster });
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="muc-tieu">
          <section className="flex flex-col gap-4 pt-4">
            <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">{t('author.problem.objectives.heading')}</h2>
            {props.form.objectives.map((objective, index) => (
              <ObjectiveFields
                key={objective.key}
                objective={objective}
                index={index}
                issues={props.issues}
                namespaces={namespaces}
                nodes={nodeNames}
                canRemove={props.form.objectives.length > 1}
                onChange={(part) => {
                  patch({
                    objectives: props.form.objectives.map((item, i) => (i === index ? { ...item, ...part } : item)),
                  });
                }}
                onRemove={() => {
                  patch({ objectives: props.form.objectives.filter((_, i) => i !== index) });
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
            <ArenaPreview code={props.code} hasUnsavedChanges={props.hasUnsavedChanges} />
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

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">{props.actions}</div>
    </div>
  );
}
