'use client';

import type { ReactElement } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@devops-platform/ui';
import type { GameId, PredicateName } from '@devops-platform/games';
import { Field, TextField, issueFor } from '../../../components/author/field';
import type { TopicLine } from '../../../components/kit';
import type { FieldIssue } from './cluster-form';
import { ItemBlock } from './item-block';
import { ObjectiveArgField } from './objective-arg-field';
import { ObjectiveArgGeneric } from './objective-arg-generic';
import { genericArgs, k8sSpec, predicateOptions } from './predicate-catalog';
import type { ObjectiveFormState } from './problem-form';

/**
 * Một mục tiêu: định danh, nhãn tiếng Việt, vị từ, tham số, cờ hiện/ẩn.
 *
 * Vị từ là ô CHỌN, không có ô gõ tay: tên vị từ phải luôn nằm trong bảng tra.
 * Một tên lạ không ném lỗi nào, vị từ chỉ không tra ra gì, mục tiêu trả sai vĩnh
 * viễn, và người phát hiện là người học đầu tiên ngồi làm bài.
 * `problem-validate.ts` vẫn kiểm lại một lượt cho bài nhập từ JSON.
 *
 * HAI nguồn đặc tả tham số, chọn theo game (`predicate-catalog.ts`): K8s giữ bản
 * giàu (bộ chọn namespace/node/kind + `requireOneOf`), mọi game khác đi bảng
 * chung của hợp đồng plugin.
 */
export function ObjectiveFields(props: {
  readonly objective: ObjectiveFormState;
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  readonly namespaces: readonly string[];
  readonly nodes: readonly string[];
  /** ⛔ BẮT BUỘC (P20): thiếu nó là quay về bảng vị từ của riêng K8s. */
  readonly gameId: GameId;
  readonly line: TopicLine;
  readonly onChange: (patch: Partial<ObjectiveFormState>) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
  /** `delta` là `-1` (lên) hoặc `+1` (xuống). Thứ tự không đổi cách chấm, nó đổi thứ tự người làm ĐỌC đề. */
  readonly onMove: (delta: -1 | 1) => void;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}): ReactElement {
  const base = `objectives.${String(props.index)}`;
  const { objective } = props;
  const check = objective.check;
  const spec = k8sSpec(props.gameId, check);
  const generic = spec === null ? genericArgs(props.gameId, check) : [];
  const options = predicateOptions(props.gameId);
  const n = props.index + 1;
  const setArg = (key: string, value: string): void => {
    props.onChange({ args: { ...objective.args, [key]: value } });
  };

  return (
    <ItemBlock
      index={props.index}
      line={props.line}
      path={base}
      title={objective.label.trim() === '' ? `${t('problem.objective-fields-muc-tieu')} ${String(n)}` : objective.label}
      actions={
        <>
          {/*
            Mỗi nút có `aria-label` kèm số thứ tự: một hàng nút giống hệt nhau lặp
            N lần là thứ trình đọc màn hình đọc thành "nút, nút, nút" (AC-8).
          */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!props.canMoveUp}
            aria-label={t('author.problem.objectives.move-up', { n })}
            iconLeft={<ArrowUp aria-hidden className="size-4" />}
            onClick={() => {
              props.onMove(-1);
            }}
          >
            {t('author.problem.objectives.move-up-short')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!props.canMoveDown}
            aria-label={t('author.problem.objectives.move-down', { n })}
            iconLeft={<ArrowDown aria-hidden className="size-4" />}
            onClick={() => {
              props.onMove(1);
            }}
          >
            {t('author.problem.objectives.move-down-short')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!props.canRemove}
            iconLeft={<Trash2 aria-hidden className="size-4" />}
            onClick={props.onRemove}
          >
            {t('common.action.delete')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={t('problem.hint-fields-dinh-danh')}
          value={objective.id}
          path={`${base}.id`}
          onChange={(id) => {
            props.onChange({ id });
          }}
          error={issueFor(props.issues, `${base}.id`)}
          hint={t('problem.objective-fields-on-dinh-lich-su-nop-bai-tham-chieu-toi-no')}
        />
        <TextField
          label={t('problem.objective-fields-nhan-tieng-viet')}
          value={objective.label}
          path={`${base}.label`}
          onChange={(label) => {
            props.onChange({ label });
          }}
          error={issueFor(props.issues, `${base}.label`)}
          placeholder={t('problem.objective-fields-deployment-thanh-toan-co-du-3-replica-san-sang')}
          hint={t('problem.objective-fields-noi-nguoi-lam-phai-lam-duoc-gi-khong-noi-lam-the-nao')}
        />
      </div>

      <Field
        label={t('problem.objective-fields-vi-tu-kiem-tra')}
        path={`${base}.check`}
        error={issueFor(props.issues, `${base}.check`)}
      >
        {({ id, describedBy, invalid }) => (
          // `value` RẢI có điều kiện chứ không truyền `undefined`: Radix coi `''`
          // là một giá trị đã chọn và nuốt mất placeholder.
          <Select
            {...(check === '' ? {} : { value: check })}
            onValueChange={(value) => {
              props.onChange({ check: value as PredicateName });
            }}
          >
            <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
              <SelectValue placeholder={t('problem.objective-fields-chon-mot-vi-tu', { n: options.length })} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {spec !== null && spec.args.length > 0 && (
        <div className="grid gap-5 bg-muted p-4 sm:grid-cols-2">
          {spec.args.map((argSpec) => (
            <ObjectiveArgField
              key={argSpec.key}
              spec={argSpec}
              path={`${base}.args.${argSpec.key}`}
              value={objective.args[argSpec.key] ?? ''}
              issues={props.issues}
              namespaces={props.namespaces}
              nodes={props.nodes}
              onChange={(value) => {
                setArg(argSpec.key, value);
              }}
            />
          ))}
        </div>
      )}

      {generic.length > 0 && (
        <div className="grid gap-5 bg-muted p-4 sm:grid-cols-2">
          {generic.map((argSpec) => (
            <ObjectiveArgGeneric
              key={argSpec.name}
              spec={argSpec}
              path={`${base}.args.${argSpec.name}`}
              value={objective.args[argSpec.name] ?? ''}
              issues={props.issues}
              onChange={(value) => {
                setArg(argSpec.name, value);
              }}
            />
          ))}
        </div>
      )}

      {spec?.requireOneOf !== undefined && (
        <p className="text-sm text-muted-foreground">
          {t('problem.objective-fields-phai-dien-it-nhat-mot-trong')}{' '}
          {spec.requireOneOf
            .map((key) => {
              const arg = spec.args.find((candidate) => candidate.key === key);
              return arg === undefined ? key : t(arg.label);
            })
            .join(t('problem.objective-fields-hoac'))}
          {t('problem.objective-fields-thieu-ca-hai-thi-vi-tu-luon-tra-sai-va-bai-khong-bao-gio-qua-duoc')}
        </p>
      )}

      {/*
        §18.B.4 + §18.D.2: cờ HIỆN/ẨN, không phải cờ "bắt buộc" cũ đổi nhãn. Mọi
        testcase đều chặn (đó là nghĩa của AC); cờ này hỏi người làm có được XEM
        nhãn trước khi nộp không. Nhãn nói HỆ QUẢ, không nói trạng thái.
      */}
      <VisibleSwitch
        visible={objective.visible}
        onChange={(visible) => {
          props.onChange({ visible });
        }}
      />
    </ItemBlock>
  );
}

function VisibleSwitch(props: { readonly visible: boolean; readonly onChange: (next: boolean) => void }): ReactElement {
  return (
    <Field
      label={t('author.problem.objectives.visible-label')}
      hint={props.visible ? t('author.problem.objectives.visible-on') : t('author.problem.objectives.visible-off')}
    >
      {({ id, describedBy }) => (
        <Switch id={id} aria-describedby={describedBy} checked={props.visible} onCheckedChange={props.onChange} />
      )}
    </Field>
  );
}
