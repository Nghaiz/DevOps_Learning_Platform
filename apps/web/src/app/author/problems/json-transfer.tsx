'use client';

import { useState, type ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Textarea, useToast } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import type { ProblemFormState } from './problem-form';
import { exportFileName, exportProblemJson, importProblemJson } from './problem-json';

/**
 * Xuất và nhập bài dưới dạng JSON — đường chuyển bài giữa các môi trường.
 *
 * ## Vì sao tải file bằng Blob chứ không bằng một endpoint
 *
 * Nội dung cần xuất là thứ đang nằm trên màn hình, kể cả phần chưa lưu. Một
 * endpoint chỉ đọc được bản trong DB, nên file tải về sẽ là bản CŨ mà không có
 * gì nói ra điều đó. Blob dựng từ chính state đang hiển thị thì không thể lệch.
 *
 * ## Vì sao lượt nhập nói ra thứ nó ĐÁNH RƠI
 *
 * File tới từ một môi trường khác có thể mang chủ đề hoặc loại tài nguyên không
 * còn trong tập đóng. Bỏ chúng trong im lặng thì một lượt nhập mất hai chủ đề
 * trông y hệt một lượt nhập sạch — và người soạn chỉ phát hiện lúc cổng xuất bản
 * báo thiếu chủ đề, không hiểu vì sao.
 *
 * ## Hai câu lỗi dự phòng đi qua bản đồ, `cause.message` thì không
 *
 * `exportProblemJson` và `importProblemJson` ném `Error` mang câu của chính
 * chúng; câu đó là dữ liệu lúc chạy nên nó hiện nguyên văn. Chỉ nhánh "không
 * phải `Error`" mới cần một câu do ta viết, và hai câu đó ở bản đồ.
 */
export function JsonTransfer(props: {
  readonly form: ProblemFormState;
  readonly code: string | null;
  readonly nextKey: () => string;
  readonly onImport: (form: ProblemFormState) => void;
}): ReactElement {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<readonly string[]>([]);

  const download = (): void => {
    let json: string;
    try {
      json = exportProblemJson(props.form, props.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('author.problem.json.export-failed'));
      return;
    }
    setError(null);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFileName(props.code, props.form.slug);
    anchor.click();
    // Thu hồi ngay sau khi bấm: giữ lại thì blob sống tới khi đóng tab, và một
    // phiên soạn dài xuất chục lượt sẽ tích lại chục bản JSON trong bộ nhớ.
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('author.problem.json.heading')}
      </h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('author.problem.json.export-heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('author.problem.json.export-lead')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={download}>
            {t('author.problem.json.download')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                void navigator.clipboard.writeText(exportProblemJson(props.form, props.code));
                toast({ title: t('author.problem.toast.json-copied') });
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t('author.problem.json.copy-failed'));
              }
            }}
          >
            {t('author.problem.json.copy')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t('author.problem.json.import-heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('author.problem.json.import-lead')}</p>
        <Textarea
          aria-label={t('author.problem.json.textarea-label')}
          className="font-mono text-xs"
          rows={10}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
            setDropped([]);
          }}
        />
        <div>
          <Button
            type="button"
            disabled={text.trim() === ''}
            onClick={() => {
              const result = importProblemJson(text, props.nextKey);
              if (!result.ok) {
                setError(result.message);
                setDropped([]);
                return;
              }
              setError(null);
              setDropped(result.dropped);
              props.onImport(result.form);
              toast({
                title: t('author.problem.toast.imported'),
                description: t('author.problem.toast.imported-body'),
              });
            }}
          >
            {t('author.problem.json.import')}
          </Button>
        </div>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.problem.json.import-error-title')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dropped.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>{t('author.problem.json.dropped-title', { n: dropped.length })}</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {dropped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
