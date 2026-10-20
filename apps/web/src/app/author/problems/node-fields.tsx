'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Field, TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue, NodeFormState } from './cluster-form';
import { ItemBlock } from './item-block';
import { Button, Switch } from '@devops-platform/ds';

/**
 * Một node trong cụm ban đầu.
 *
 * CPU tính bằng milli-core và bộ nhớ bằng MiB, đúng đơn vị của `NodeSpec`, và
 * nhãn ô nói ra đơn vị. Khai `4` thay vì `4000` là một node 4 milli-core: không
 * lịch nổi pod nào, và triệu chứng đọc ra như "bộ lập lịch hỏng" chứ không như
 * "gõ thiếu ba số 0".
 */
export function NodeFields(props: {
  readonly node: NodeFormState;
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  readonly onChange: (patch: Partial<NodeFormState>) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
}): ReactElement {
  const base = `nodes.${String(props.index)}`;
  const { node } = props;

  return (
    <ItemBlock
      index={props.index}
      path={base}
      title={node.name.trim() === '' ? `${t('problem.cluster-fields-node')} ${String(props.index + 1)}` : node.name}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!props.canRemove}
          icon="trash"
          onClick={props.onRemove}
        >
          {t('common.action.delete')}
        </Button>
      }
    >
      <TextField
        label={t('problem.node-fields-ten-node')}
        value={node.name}
        path={`${base}.name`}
        onChange={(name) => {
          props.onChange({ name });
        }}
        error={issueFor(props.issues, `${base}.name`)}
        placeholder={t('problem.node-fields-node-1')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('problem.node-fields-cpu-milli-core-1-core-1000')}
          value={node.cpu}
          path={`${base}.cpu`}
          onChange={(cpu) => {
            props.onChange({ cpu });
          }}
          inputMode="numeric"
          error={issueFor(props.issues, `${base}.cpu`)}
        />
        <TextField
          label={t('problem.cluster-to-spec-bo-nho-mib')}
          value={node.memory}
          path={`${base}.memory`}
          onChange={(memory) => {
            props.onChange({ memory });
          }}
          inputMode="numeric"
          error={issueFor(props.issues, `${base}.memory`)}
        />
      </div>

      <Field label={t('problem.node-fields-node-o-trang-thai-ready')}>
        {({ id }) => (
          <Switch
            id={id}
            checked={node.ready}
            onCheckedChange={(ready) => {
              props.onChange({ ready });
            }}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextAreaField
          label={t('problem.node-fields-nhan')}
          value={node.labels}
          onChange={(labels) => {
            props.onChange({ labels });
          }}
          rows={3}
          mono
          placeholder={t('problem.node-labels-example')}
          hint={t('problem.node-fields-moi-dong-mot-cap-k-v')}
        />
        <TextAreaField
          label={t('problem.node-fields-taint')}
          value={node.taints}
          onChange={(taints) => {
            props.onChange({ taints });
          }}
          rows={3}
          mono
          placeholder={t('problem.node-fields-dedicated-gpu-noschedule')}
          hint={t('problem.node-fields-moi-dong-mot-taint')}
        />
      </div>
    </ItemBlock>
  );
}
