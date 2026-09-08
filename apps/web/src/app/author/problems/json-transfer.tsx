'use client';

import { useState, type ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Textarea, useToast } from '@devops-platform/ui';
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
      setError(cause instanceof Error ? cause.message : 'Không xuất được.');
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
      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">Xuất và nhập JSON</h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Xuất</h3>
        <p className="text-sm text-muted-foreground">
          Tải về đúng thứ đang hiện trên màn hình, kể cả phần chưa lưu. Mang sang môi trường khác rồi nhập lại ở
          ô bên dưới.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={download}>
            Tải file JSON
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              try {
                void navigator.clipboard.writeText(exportProblemJson(props.form, props.code));
                toast({ title: 'Đã chép JSON vào clipboard' });
                setError(null);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Không chép được.');
              }
            }}
          >
            Chép vào clipboard
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">Nhập</h3>
        <p className="text-sm text-muted-foreground">
          Dán nội dung file vào đây. Lượt nhập GHI ĐÈ toàn bộ biểu mẫu đang soạn, và không đụng tới bản đã lưu
          cho tới khi bạn bấm lưu.
        </p>
        <Textarea
          aria-label="JSON bài tập cần nhập"
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
              toast({ title: 'Đã nhập vào biểu mẫu', description: 'Kiểm lại rồi lưu — nhập không tự lưu.' });
            }}
          >
            Nhập vào biểu mẫu
          </Button>
        </div>
      </div>

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>Không nhập được</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {dropped.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Đã nhập, nhưng {String(dropped.length)} giá trị bị bỏ</AlertTitle>
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
