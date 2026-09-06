'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, Button, Card, CardContent } from '@devops-platform/ui';
import type { AssetDirectiveFormState } from './draft-form';
import { TextField } from './field';

/**
 * `ScenarioAsset[]` — chỉ thị CHÉP FILE VÀO POD lúc dựng sandbox.
 *
 * ⚠ Đây KHÔNG phải tệp tải lên. Hai thứ trùng tên "asset" trong cùng một router
 * và chúng không liên quan gì tới nhau:
 *
 * | | Ở đâu | Dùng làm gì |
 * |---|---|---|
 * | `assets` (khối này) | cột `content_items.assets` | chép file có sẵn trong image vào pod |
 * | `content_assets` (tab Tệp đính kèm) | bảng riêng, `uploadAsset` | ảnh nhúng trong markdown |
 *
 * Người soạn gõ nhầm khối này để mong tải ảnh lên là chuyện sẽ xảy ra, nên câu
 * cảnh báo nằm ngay trên đầu chứ không nằm trong tài liệu.
 */
export function AssetDirectiveFields(props: {
  readonly value: readonly AssetDirectiveFormState[];
  readonly onChange: (next: readonly AssetDirectiveFormState[]) => void;
  readonly onAdd: () => void;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { value, onChange, disabled } = props;
  const patchAt = (index: number, part: Partial<AssetDirectiveFormState>): void => {
    onChange(value.map((item, i) => (i === index ? { ...item, ...part } : item)));
  };

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>
          Khối này KHÔNG tải tệp lên. Nó khai một file <em>đã có trong image sandbox</em> và chỗ cần chép tới
          trong pod. Muốn nhúng ảnh vào bài thì dùng tab <strong>Tệp đính kèm</strong>.
        </AlertDescription>
      </Alert>

      {value.map((asset, index) => (
        <Card key={asset.key}>
          <CardContent className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Chỉ thị {index + 1}</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((_, i) => i !== index));
                }}
              >
                Xoá
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Host"
                value={asset.host}
                onChange={(host) => {
                  patchAt(index, { host });
                }}
                disabled={disabled}
                placeholder="host01"
              />
              <TextField
                label="File"
                value={asset.file}
                onChange={(file) => {
                  patchAt(index, { file });
                }}
                disabled={disabled}
                placeholder="start.sh"
              />
              <TextField
                label="Đích trong pod"
                value={asset.target}
                onChange={(target) => {
                  patchAt(index, { target });
                }}
                disabled={disabled}
                placeholder="/root/"
              />
              <TextField
                label="chmod"
                value={asset.chmod}
                onChange={(chmod) => {
                  patchAt(index, { chmod });
                }}
                disabled={disabled}
                placeholder="0755"
                hint="Bỏ trống thì giữ quyền mặc định."
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <div>
        <Button variant="outline" onClick={props.onAdd} disabled={disabled}>
          Thêm chỉ thị
        </Button>
      </div>
    </div>
  );
}
