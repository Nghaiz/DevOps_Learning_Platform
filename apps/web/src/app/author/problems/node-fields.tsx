'use client';

import type { ReactElement } from 'react';
import { Button, Label, Switch } from '@devops-platform/ui';
import { TextAreaField, TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue, NodeFormState } from './cluster-form';

/**
 * Một node trong cụm ban đầu.
 *
 * CPU tính bằng milli-core và bộ nhớ bằng MiB — đúng đơn vị của `NodeSpec`, và
 * nhãn ô nói ra đơn vị thay vì để người soạn đoán. Khai `4` thay vì `4000` là
 * một node 4 milli-core: không lịch nổi pod nào, và triệu chứng sẽ đọc ra như
 * "bộ lập lịch hỏng" chứ không như "gõ thiếu ba số 0".
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
  const switchId = `node-ready-${props.node.key}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">Node {String(props.index + 1)}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!props.canRemove}
          onClick={props.onRemove}
        >
          Xoá
        </Button>
      </div>

      <TextField
        label="Tên node"
        value={props.node.name}
        onChange={(name) => {
          props.onChange({ name });
        }}
        error={issueFor(props.issues, `${base}.name`)}
        placeholder="node-1"
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="CPU (milli-core, 1 core = 1000)"
          value={props.node.cpu}
          onChange={(cpu) => {
            props.onChange({ cpu });
          }}
          inputMode="numeric"
          error={issueFor(props.issues, `${base}.cpu`)}
        />
        <TextField
          label="Bộ nhớ (MiB)"
          value={props.node.memory}
          onChange={(memory) => {
            props.onChange({ memory });
          }}
          inputMode="numeric"
          error={issueFor(props.issues, `${base}.memory`)}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={switchId}
          checked={props.node.ready}
          onCheckedChange={(ready) => {
            props.onChange({ ready });
          }}
        />
        <Label htmlFor={switchId}>Node ở trạng thái Ready</Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextAreaField
          label="Nhãn"
          value={props.node.labels}
          onChange={(labels) => {
            props.onChange({ labels });
          }}
          rows={3}
          mono
          placeholder={'disktype=ssd\nzone=a'}
          hint="Mỗi dòng một cặp k=v."
        />
        <TextAreaField
          label="Taint"
          value={props.node.taints}
          onChange={(taints) => {
            props.onChange({ taints });
          }}
          rows={3}
          mono
          placeholder="dedicated=gpu:NoSchedule"
          hint="Mỗi dòng một taint."
        />
      </div>
    </div>
  );
}
