'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@devops-platform/ui';
import { PREDICATE_NAMES, type PredicateName } from '@devops-platform/games';
import { TextField, issueFor } from '../../../components/author/field';
import type { FieldIssue } from './cluster-form';
import { ObjectiveArgField } from './objective-arg-field';
import { PREDICATE_SPECS, isPredicateName } from './predicate-spec';
import type { ObjectiveFormState } from './problem-form';

/**
 * Một mục tiêu: nhãn tiếng Việt + vị từ + tham số + cờ bắt buộc.
 *
 * ## Vị từ là ô CHỌN, và đó là cả lý do hệ OJ này khả thi
 *
 * Bản của k8sgames.com chấm bằng một `switch` 35 nhánh viết cứng, nên thêm bài
 * là sửa mã — họ không thể có trình soạn bài. Của ta tra theo tên trong bảng
 * `PREDICATES`, nên soạn bài bằng biểu mẫu là làm được.
 *
 * Điều kiện để nó thật sự làm được: tên vị từ phải LUÔN nằm trong bảng. Một ô gõ
 * tay phá đúng tính chất đó, và phá lặng lẽ — vị từ lạ không ném, `PREDICATES`
 * chỉ không tra ra gì, mục tiêu trả sai vĩnh viễn, và người phát hiện ra là
 * người học đầu tiên ngồi làm bài. Nên không có ô gõ tay ở đây, và
 * `problem-validate.ts` vẫn kiểm lại một lượt cho bài nhập từ JSON.
 */
export function ObjectiveFields(props: {
  readonly objective: ObjectiveFormState;
  readonly index: number;
  readonly issues: readonly FieldIssue[];
  readonly namespaces: readonly string[];
  readonly nodes: readonly string[];
  readonly onChange: (patch: Partial<ObjectiveFormState>) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
  /**
   * §18.D.2 — đổi thứ tự. `delta` là `-1` (lên) hoặc `+1` (xuống).
   *
   * Thứ tự testcase KHÔNG đổi cách chấm (`Submission.passed` lưu **id**, đúng vì
   * lý do hợp đồng ghi: *"chỉ số vỡ khi tác giả đổi thứ tự"*), nhưng nó là thứ
   * tự người làm ĐỌC đề. Một bài dẫn từ dễ tới khó đọc khác hẳn cùng bài xáo
   * trộn, và trước đợt này cách duy nhất để sắp lại là xoá đi gõ lại.
   */
  readonly onMove: (delta: -1 | 1) => void;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}): ReactElement {
  const base = `objectives.${String(props.index)}`;
  const check = props.objective.check;
  const spec = check !== '' && isPredicateName(check) ? PREDICATE_SPECS[check] : null;
  const visibleId = `objective-visible-${props.objective.key}`;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium text-foreground">
          {t('problem.objective-fields-muc-tieu')} {String(props.index + 1)}
        </h4>
        <div className="flex items-center gap-1">
          {/*
            Nút CHỮ chứ không phải mũi tên trần, và mỗi nút có `aria-label` riêng
            kèm số thứ tự: AC-8 đòi 0 vi phạm axe trên màn soạn bài, và một hàng
            nút giống hệt nhau lặp lại N lần là thứ trình đọc màn hình đọc thành
            "nút, nút, nút" mà không biết đang ở mục tiêu nào.
          */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!props.canMoveUp}
            aria-label={t('author.problem.objectives.move-up', { n: props.index + 1 })}
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
            aria-label={t('author.problem.objectives.move-down', { n: props.index + 1 })}
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
            onClick={props.onRemove}
          >
            {t('common.action.delete')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('problem.hint-fields-dinh-danh')}
          value={props.objective.id}
          onChange={(id) => {
            props.onChange({ id });
          }}
          error={issueFor(props.issues, `${base}.id`)}
          hint={t('problem.objective-fields-on-dinh-lich-su-nop-bai-tham-chieu-toi-no')}
        />
        <TextField
          label={t('problem.objective-fields-nhan-tieng-viet')}
          value={props.objective.label}
          onChange={(label) => {
            props.onChange({ label });
          }}
          error={issueFor(props.issues, `${base}.label`)}
          placeholder={t('problem.objective-fields-deployment-thanh-toan-co-du-3-replica-san-sang')}
          hint={t('problem.objective-fields-noi-nguoi-lam-phai-lam-duoc-gi-khong-noi-lam-the-nao')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`objective-check-${props.objective.key}`}>
          {t('problem.objective-fields-vi-tu-kiem-tra')}
        </Label>
        {/*
          Truyền `value` bằng cách RẢI có điều kiện chứ không truyền `undefined`:
          `exactOptionalPropertyTypes` của repo phân biệt "không khai prop" với
          "khai prop bằng undefined", và Radix chỉ nhận vế đầu. Truyền `''` thì
          Radix coi đó là một giá trị đã chọn và nuốt mất placeholder.
        */}
        <Select
          {...(check === '' ? {} : { value: check })}
          onValueChange={(value) => {
            props.onChange({ check: value as PredicateName });
          }}
        >
          <SelectTrigger id={`objective-check-${props.objective.key}`}>
            <SelectValue placeholder={t('problem.objective-fields-chon-mot-trong-32-vi-tu')} />
          </SelectTrigger>
          <SelectContent>
            {PREDICATE_NAMES.map((predicate) => (
              <SelectItem key={predicate} value={predicate}>
                {t(PREDICATE_SPECS[predicate].label)}: {predicate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {issueFor(props.issues, `${base}.check`) !== null && (
          <p className="text-xs text-destructive">{issueFor(props.issues, `${base}.check`)}</p>
        )}
      </div>

      {spec !== null && spec.args.length > 0 && (
        <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          {spec.args.map((argSpec) => (
            <ObjectiveArgField
              key={argSpec.key}
              spec={argSpec}
              controlId={`arg-${props.objective.key}-${argSpec.key}`}
              path={`${base}.args.${argSpec.key}`}
              value={props.objective.args[argSpec.key] ?? ''}
              issues={props.issues}
              namespaces={props.namespaces}
              nodes={props.nodes}
              onChange={(value) => {
                props.onChange({ args: { ...props.objective.args, [argSpec.key]: value } });
              }}
            />
          ))}
        </div>
      )}

      {spec?.requireOneOf !== undefined && (
        <p className="text-xs text-muted-foreground">
          {t('problem.objective-fields-phai-dien-it-nhat-mot-trong')}{' '}
          {spec.requireOneOf
            .map((key) => {
              const arg = spec.args.find((candidate) => candidate.key === key);
              return arg === undefined ? key : t(arg.label);
            })
            .join(t('problem.objective-fields-hoac'))}
          {t(
            'problem.objective-fields-thieu-ca-hai-thi-vi-tu-luon-tra-sai-va-bai-khong-bao-gio-qua-duoc',
          )}
        </p>
      )}

      {/*
        §18.B.4 + §18.D.2 — ô đánh dấu ẨN/HIỆN, thay cho ô "bắt buộc" cũ.

        ⛔ KHÔNG phải ô cũ đổi nhãn. Ô cũ hỏi *không đạt thì có chặn không*, và
        quyết định #20 đã bỏ hẳn câu hỏi đó (mọi testcase đều chặn — đó là nghĩa
        của `AC`). Ô này hỏi một câu khác hẳn: *người làm có được XEM testcase
        này trước khi nộp không*. Bảng so sánh ở `server/problems/testcases.ts`.

        Nhãn nói HỆ QUẢ chứ không nói trạng thái ("ẩn"/"hiện"): người soạn cần
        biết mình vừa quyết định gì cho người học, và "ẩn" một mình không nói ra
        rằng người làm vẫn đếm được nó trong mẫu số `n/m`.
      */}
      <div className="flex items-center gap-3">
        <Switch
          id={visibleId}
          checked={props.objective.visible}
          onCheckedChange={(visible) => {
            props.onChange({ visible });
          }}
        />
        <Label htmlFor={visibleId}>
          {props.objective.visible
            ? t('author.problem.objectives.visible-on')
            : t('author.problem.objectives.visible-off')}
        </Label>
      </div>
    </div>
  );
}
