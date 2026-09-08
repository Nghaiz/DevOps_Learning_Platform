'use client';

import { useState, type ReactElement } from 'react';
import { Alert, AlertDescription, AlertTitle, Button, Textarea } from '@devops-platform/ui';
import type { ClusterSpec } from '@devops-platform/games';
import { clusterFromSpec, type ClusterFormState } from './cluster-form';
import { clusterToSpec } from './cluster-to-spec';

/**
 * Đường dán JSON thô cho người dùng thạo — nhanh hơn điền hai chục ô khi đã có
 * sẵn một cụm ở nơi khác.
 *
 * ## Vì sao KHÔNG áp dụng ngay khi gõ
 *
 * Một `ClusterSpec` gõ dở là một JSON hỏng ở gần như mọi thời điểm. Phân tích
 * theo từng phím thì ô báo lỗi nhấp nháy suốt lúc gõ và biểu mẫu bên kia bị đập
 * đi dựng lại liên tục. Nên có một nút, và nút đó chỉ sáng khi JSON thật sự đọc
 * được.
 *
 * ## Vì sao kiểm bằng `clusterToSpec` chứ không chỉ `JSON.parse`
 *
 * `JSON.parse` chỉ nói cú pháp đúng. Một `{"nodes": []}` hợp lệ về cú pháp và vô
 * nghĩa về nội dung. Đường nhập đi qua đúng phép kiểm mà biểu mẫu đi qua — nếu
 * không, dán JSON trở thành cửa sau lách được mọi ràng buộc.
 */
export function ClusterJsonFields(props: {
  readonly cluster: ClusterFormState;
  readonly nextKey: () => string;
  readonly onApply: (next: ClusterFormState) => void;
}): ReactElement {
  const current = clusterToSpec(props.cluster);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chưa chạm vào ô ⇒ hiện bản đọc ra từ biểu mẫu. Chạm rồi ⇒ giữ nguyên thứ
  // người ta đang gõ, kể cả khi biểu mẫu bên kia đổi.
  const text =
    draft ??
    (current.ok
      ? JSON.stringify(current.value, null, 2)
      : '// Biểu mẫu đang có ô sai nên chưa đọc ra JSON được. Sửa ở tab Biểu mẫu, hoặc dán một cụm mới vào đây.');

  return (
    <div className="flex flex-col gap-3 pt-2">
      <Textarea
        aria-label="Trạng thái cụm dạng JSON"
        className="font-mono text-xs"
        rows={18}
        value={text}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
      />

      {error !== null && (
        <Alert variant="destructive">
          <AlertTitle>Không áp dụng được</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={draft === null}
          onClick={() => {
            const parsed = readClusterJson(draft ?? '');
            if (!parsed.ok) {
              setError(parsed.message);
              return;
            }
            const form = clusterFromSpec(parsed.value, props.nextKey);
            const recheck = clusterToSpec(form);
            if (!recheck.ok) {
              setError(
                `Cụm đọc được nhưng chưa hợp lệ: ${recheck.issues.map((issue) => issue.message).join(' ')}`,
              );
              return;
            }
            setDraft(null);
            setError(null);
            props.onApply(form);
          }}
        >
          Áp dụng vào biểu mẫu
        </Button>
        {draft !== null && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
          >
            Bỏ thay đổi
          </Button>
        )}
      </div>
    </div>
  );
}

function readClusterJson(
  raw: string,
): { readonly ok: true; readonly value: ClusterSpec } | { readonly ok: false; readonly message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, message: `JSON không đọc được: ${error instanceof Error ? error.message : 'lỗi cú pháp'}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'Phải là một object JSON có ba khoá nodes, namespaces, resources.' };
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record['nodes']) || !Array.isArray(record['namespaces']) || !Array.isArray(record['resources'])) {
    return { ok: false, message: 'Thiếu một trong ba khoá bắt buộc: nodes, namespaces, resources (đều phải là mảng).' };
  }
  return { ok: true, value: parsed as ClusterSpec };
}
