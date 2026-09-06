'use client';

/**
 * Kết quả một lượt chấm.
 *
 * ⛔ BA nhánh, không phải hai. `passed: false` (bài làm chưa đạt) và `error`
 * (phiên hết hạn / gateway hỏng / apiserver trục trặc) PHẢI hiện khác nhau:
 * `lessons.checkStep` cố ý ném lỗi hệ thống thay vì gộp chúng thành
 * `passed: false`, và gộp lại ở tầng hiển thị sẽ vứt bỏ đúng sự phân biệt mà
 * tầng dưới đã giữ — người học bị bảo "chưa đạt" rồi đi sửa một bài vốn đã đúng.
 */
export type CheckOutcome =
  | { kind: 'running' }
  | { kind: 'result'; passed: boolean; exitCode: number; output: string }
  | { kind: 'error'; message: string };

export function CheckResultPanel({
  outcome,
}: {
  outcome: CheckOutcome | null;
}): React.ReactElement | null {
  if (outcome === null || outcome.kind === 'running') {
    return null;
  }

  if (outcome.kind === 'error') {
    return (
      <div
        role="alert"
        className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
      >
        <p className="font-medium">Không chấm được</p>
        <p className="mt-1">{outcome.message}</p>
      </div>
    );
  }

  // Token C1, không màu trần: `success` cho ĐẠT, `warning` cho CHƯA ĐẠT.
  // Chưa-đạt cố ý KHÔNG dùng `destructive` — nó là kết quả bình thường của một
  // lượt chấm, không phải một lỗi hệ thống; nhánh `error` ở trên mới là.
  const tone = outcome.passed
    ? 'border-success/30 bg-success/10'
    : 'border-warning/30 bg-warning/10';

  return (
    <div role="status" className={`mt-3 rounded-md border p-3 text-sm text-foreground ${tone}`}>
      <p className="font-medium">
        {outcome.passed ? 'Đạt' : `Chưa đạt (exit ${String(outcome.exitCode)})`}
      </p>
      {outcome.output.trim() !== '' && (
        // `overflow-x-auto` chứ không bọc dòng: output là văn bản terminal, và
        // bẻ dòng một bảng `kubectl get` làm nó không đọc được.
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-background/60 p-2 font-mono text-xs">
          {outcome.output}
        </pre>
      )}
    </div>
  );
}
