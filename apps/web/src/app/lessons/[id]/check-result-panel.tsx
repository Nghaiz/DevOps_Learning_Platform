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
        className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        <p className="font-medium">Không chấm được</p>
        <p className="mt-1">{outcome.message}</p>
      </div>
    );
  }

  const tone = outcome.passed
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div role="status" className={`mt-3 rounded-md border p-3 text-sm ${tone}`}>
      <p className="font-medium">
        {outcome.passed ? 'Đạt' : `Chưa đạt (exit ${String(outcome.exitCode)})`}
      </p>
      {outcome.output.trim() !== '' && (
        // `overflow-x-auto` chứ không bọc dòng: output là văn bản terminal, và
        // bẻ dòng một bảng `kubectl get` làm nó không đọc được.
        <pre className="mt-2 max-h-48 overflow-auto rounded bg-white/60 p-2 font-mono text-xs">
          {outcome.output}
        </pre>
      )}
    </div>
  );
}
