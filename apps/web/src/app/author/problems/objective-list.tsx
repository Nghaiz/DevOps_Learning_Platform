'use client';

import type { ReactElement } from 'react';
import { Plus } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { fieldPathProps } from '../../../components/author/studio';
import { Split, type TopicLine } from '../../../components/kit';
import type { FieldIssue } from './cluster-form';
import { ObjectiveFields } from './objective-fields';
import { emptyObjective, moveObjective, type ProblemFormState } from './problem-form';
import { parseList } from './text-tools';

/**
 * Chế độ Mục tiêu: danh sách testcase, thêm, xoá, đổi thứ tự.
 *
 * Gợi ý namespace và node cho ô tham số đọc từ CỤM đang soạn, không từ bản đã
 * lưu: người soạn vừa thêm namespace `payments` thì ô tham số phải gợi ý nó ngay.
 *
 * Khối bọc mang `data-field-path="objectives"`: lỗi "bài phải có ít nhất một mục
 * tiêu" không trỏ vào ô nào, nên bấm lỗi đó đưa focus về nút Thêm mục tiêu.
 */
export function ObjectiveList(props: {
  readonly form: ProblemFormState;
  readonly onChange: (patch: Partial<ProblemFormState>) => void;
  readonly issues: readonly FieldIssue[];
  readonly line: TopicLine;
  readonly nextKey: () => string;
}): ReactElement {
  const { objectives } = props.form;
  const namespaces = parseList(props.form.cluster.namespacesText);
  const nodes = props.form.cluster.nodes.map((node) => node.name.trim()).filter((name) => name !== '');

  return (
    <Split index="01" title={t('author.problem.objectives.heading')}>
      <div className="flex flex-col gap-6" {...fieldPathProps('objectives')}>
        {objectives.map((objective, index) => (
          <ObjectiveFields
            key={objective.key}
            objective={objective}
            gameId={props.form.gameId}
            index={index}
            line={props.line}
            issues={props.issues}
            namespaces={namespaces}
            nodes={nodes}
            canRemove={objectives.length > 1}
            canMoveUp={index > 0}
            canMoveDown={index < objectives.length - 1}
            onChange={(part) => {
              props.onChange({
                objectives: objectives.map((item, i) => (i === index ? { ...item, ...part } : item)),
              });
            }}
            onRemove={() => {
              props.onChange({ objectives: objectives.filter((_, i) => i !== index) });
            }}
            onMove={(delta) => {
              props.onChange({ objectives: moveObjective(objectives, index, delta) });
            }}
          />
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            iconLeft={<Plus aria-hidden className="size-4" />}
            onClick={() => {
              const next = emptyObjective(props.nextKey());
              props.onChange({
                objectives: [...objectives, { ...next, id: `muc-tieu-${String(objectives.length + 1)}` }],
              });
            }}
          >
            {t('author.problem.objectives.add')}
          </Button>
        </div>
      </div>
    </Split>
  );
}
