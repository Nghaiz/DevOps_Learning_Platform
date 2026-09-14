'use client';

import { useId, useState, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Badge, Button, Checkbox, Input, Label } from '@devops-platform/ui';

/**
 * Hai khối lọc dùng lại: danh sách ô đánh dấu cho tập ĐÓNG, và ô nhập tag cho
 * phân loại TỰ DO. Tách khỏi `problems-toolbar.tsx` vì thanh công cụ đã đủ dài,
 * và vì cả hai đều là component thuần giao diện có thể kiểm riêng.
 */

/**
 * Một nhóm ô đánh dấu nhiều lựa chọn.
 *
 * `<fieldset>`/`<legend>` chứ không phải `<div>` + một dòng chữ: trình đọc màn
 * hình đọc `legend` TRƯỚC mỗi ô trong nhóm, nên người dùng nghe "Độ khó, Dễ"
 * thay vì một chuỗi mười ba ô rời rạc không biết ô nào thuộc nhóm nào.
 *
 * `Checkbox` (Radix) + `Label htmlFor` là mẫu đã dùng ở `/quiz`: `button` là
 * phần tử gán nhãn được, nên bấm vào chữ cũng bật ô và ô nhận focus bàn phím.
 */
export function FilterChecklist<T extends string>(props: {
  readonly legend: string;
  readonly options: readonly T[];
  readonly labels: Readonly<Record<T, string>>;
  readonly selected: readonly T[];
  readonly onToggle: (value: T) => void;
  /** Câu giải thích LUẬT gộp khi chọn nhiều — chủ đề là HOẶC, tag là VÀ. */
  readonly hint?: string;
}): ReactElement {
  const groupId = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium text-muted-foreground">{props.legend}</legend>
      {props.hint !== undefined && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {props.options.map((option) => {
          const id = `${groupId}-${option}`;
          return (
            <div key={option} className="flex items-center gap-2">
              <Checkbox
                id={id}
                checked={props.selected.includes(option)}
                onCheckedChange={() => {
                  props.onToggle(option);
                }}
              />
              <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                {props.labels[option]}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Ô lọc theo tag — tập MỞ, nên là ô nhập chứ không phải danh sách ô đánh dấu.
 *
 * Luật gộp ở đây là VÀ (bài phải có đủ mọi tag), cố ý khác luật HOẶC của chủ
 * đề — hợp đồng ghi rõ chỗ lệch đó, và câu `hint` bên dưới là cách người dùng
 * biết được nó mà không phải đoán từ kết quả trả về.
 *
 * `<form onSubmit>` chứ không bắt phím `Enter` bằng tay: form cho Enter hoạt
 * động sẵn, cho nút "Thêm" hoạt động bằng cả chuột lẫn bàn phím, và không cần
 * `keydown` handler nào.
 */
export function TagFilter(props: {
  readonly tags: readonly string[];
  readonly onAdd: (raw: string) => void;
  readonly onRemove: (tag: string) => void;
}): ReactElement {
  const inputId = useId();
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        {t('catalog.problems.tag-legend')}
      </Label>
      <p className="text-xs text-muted-foreground">{t('catalog.problems.tag-hint')}</p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onAdd(draft);
          setDraft('');
        }}
      >
        <Input
          id={inputId}
          value={draft}
          placeholder={t('catalog.problems.tag-placeholder')}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
        <Button type="submit" variant="outline" size="sm" disabled={draft.trim() === ''}>
          {t('catalog.problems.tag-add')}
        </Button>
      </form>
      {props.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {props.tags.map((tag) => (
            <li key={tag}>
              <Badge variant="outline" icon={null} className="gap-1 pr-1">
                {tag}
                {/*
                  Nút bỏ tag có `aria-label` riêng vì nhãn nhìn thấy được của nó
                  là một dấu X — trình đọc màn hình nghe "nút" trống nếu không
                  nói rõ nó bỏ tag NÀO trong nhiều tag giống nhau về hình.
                */}
                <button
                  type="button"
                  aria-label={t('catalog.problems.tag-remove', { tag })}
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => {
                    props.onRemove(tag);
                  }}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
