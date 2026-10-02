'use client';

/**
 * Ô nhập tham số của vị từ đang chọn, §18.E.2.
 *
 * ## Vì sao không phải một ô khoá/giá trị tự do
 *
 * `evaluatePredicate` đọc tham số qua `argString`/`argNumber`/... và **im lặng**
 * khi thiếu hoặc sai kiểu: vị từ trả `false`, và trên màn người soạn thấy một
 * mục tiêu không bao giờ đạt, không kèm một dòng nào nói vì sao. Một ô tự do đẩy
 * nguyên cái bẫy đó sang người dùng: gõ `refs` thay vì `ref`, hoặc gõ `"3"` thay
 * vì `3`, và level hỏng theo đúng kiểu khó lần ra nhất.
 *
 * Nên ô này dựng ĐÚNG những trường mà vị từ đọc, đúng kiểu, và cảnh báo khi một
 * tham số BẮT BUỘC còn trống. Danh sách trường tới từ `PREDICATE_ARGS`, thứ có ô
 * gác đọc thẳng `predicates.ts` để không trôi khỏi engine.
 *
 * Đổi vị từ thì tham số cũ bị XOÁ ở nơi gọi (`objective-editor.tsx`), không ở đây.
 */

import type { ReactElement } from 'react';
import { TriangleAlert } from 'lucide-react';

import { t } from '@devops-platform/copy';
import { PREDICATE_ARGS, missingArgs, type GitObjective } from '@devops-platform/games';

import { AreaField, CheckField, TextField } from './builder-fields';

export interface ArgEditorProps {
  /** Tiền tố id ổn định của dòng mục tiêu, để id ô không đổi khi xoá dòng khác. */
  readonly idPrefix: string;
  /** Chỉ số hiện tại, CHỈ dùng cho testid; id ô đi theo `idPrefix`. */
  readonly index: number;
  readonly objective: GitObjective;
  readonly onChange: (next: GitObjective) => void;
}

export function ArgEditor({ idPrefix, index, objective, onChange }: ArgEditorProps): ReactElement {
  const specs = PREDICATE_ARGS[objective.check];
  const missing = missingArgs(objective.check, objective.args);

  if (specs.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {objective.check === 'graphShapeMatches'
          ? t('author.builder.objective.no-args-graph')
          : t('author.builder.objective.no-args')}
      </p>
    );
  }

  const setArg = (name: string, value: unknown): void => {
    onChange({ ...objective, args: { ...objective.args, [name]: value } });
  };

  return (
    <div className="flex flex-col gap-3 bg-muted p-3">
      {specs.map((spec) => {
        const id = `${idPrefix}-arg-${spec.name}`;
        const raw = objective.args?.[spec.name];
        if (spec.kind === 'boolean') {
          return (
            <CheckField
              key={spec.name}
              id={id}
              label={spec.name}
              mono
              checked={raw === true}
              onChange={(checked) => {
                setArg(spec.name, checked);
              }}
            />
          );
        }
        if (spec.kind === 'lines') {
          return (
            <AreaField
              key={spec.name}
              id={id}
              label={spec.name}
              hint={t('author.builder.objective.lines')}
              rows={3}
              mono
              value={Array.isArray(raw) ? (raw as string[]).join('\n') : ''}
              onChange={(text) => {
                setArg(spec.name, text.split('\n'));
              }}
            />
          );
        }
        return (
          <TextField
            key={spec.name}
            id={id}
            label={spec.name}
            mono
            type={spec.kind === 'number' ? 'number' : 'text'}
            value={typeof raw === 'string' || typeof raw === 'number' ? String(raw) : ''}
            onChange={(text) => {
              /*
               * Ô số gửi đi `number`, không gửi chuỗi: `argNumber` từ chối mọi
               * thứ không phải `number` hữu hạn, nên một `'3'` lọt vào args sẽ
               * làm vị từ trả `false` mãi mãi mà JSON xuất ra trông vẫn hợp lệ.
               * Ô trống gửi `null` chứ không gửi `0`: `0` là một giá trị có
               * nghĩa (`stashCount: 0`), nên đoán nó thay người soạn là sai.
               */
              if (spec.kind !== 'number') {
                setArg(spec.name, text);
                return;
              }
              setArg(spec.name, text === '' ? null : Number(text));
            }}
          />
        );
      })}
      {missing.length > 0 && (
        <p
          className="flex animate-rise gap-2 text-xs leading-relaxed text-destructive"
          data-testid={`git-builder-missing-arg-${String(index)}`}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('author.builder.objective.missing', { names: missing.join(', ') })}</span>
        </p>
      )}
    </div>
  );
}
