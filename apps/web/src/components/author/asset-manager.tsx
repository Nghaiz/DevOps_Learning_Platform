'use client';

import { useRef, useState, type ReactElement } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';
import { CONTENT_ASSET_TYPES } from '@devops-platform/shared-types/authoring';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { assetMarkdownSnippet, bytesToBase64, validateAssetFile } from './asset-upload';

/**
 * Tệp đính kèm của một bài — tải lên, liệt kê, xoá.
 *
 * ## Vì sao base64 chứ không multipart
 *
 * `authoring.uploadAsset` là một tRPC mutation, và tRPC là JSON. Server kiểm trần
 * cỡ TRƯỚC khi decode (một chuỗi base64 4 MB decode ra 3 MB, và kiểm sau decode
 * là đã cấp phát 3 MB cho một request sẽ bị từ chối) — nên `input.base64` có
 * `.max()` riêng, và bản kiểm ở client dùng chung hằng số đó.
 *
 * ## Xoá là XOÁ THẬT, khác hẳn "lưu trữ" của bài
 *
 * Bài thì lưu trữ chứ không xoá (tiến độ người học trỏ tới id bài). Asset thì
 * không có gì trỏ tới ngoài markdown của chính bài này, nên `deleteAsset` xoá
 * hàng thật. Hệ quả: markdown còn tham chiếu tới `storageKey` vừa xoá sẽ hiện
 * ảnh hỏng — và không có gì trong hệ thống báo trước, nên câu cảnh báo phải nằm
 * ngay ở nút.
 */
export function AssetManager({ contentId }: { readonly contentId: string }): ReactElement {
  const { toast } = useToast();
  const utils = api.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const listQuery = api.authoring.listAssets.useQuery({ id: contentId });

  const upload = api.authoring.uploadAsset.useMutation({
    onSuccess: (asset) => {
      void utils.authoring.listAssets.invalidate();
      toast({ title: 'Đã tải lên', description: `Dán đoạn markdown ở bảng dưới để nhúng ${asset.filename}.` });
    },
    onError: (error) => {
      setLocalError(describeTrpcError(error));
    },
  });

  const remove = api.authoring.deleteAsset.useMutation({
    onSuccess: () => {
      void utils.authoring.listAssets.invalidate();
      toast({ title: 'Đã xoá tệp' });
    },
    onError: (error) => {
      setLocalError(describeTrpcError(error));
    },
  });

  const onPick = async (file: File): Promise<void> => {
    setLocalError(null);
    const issue = validateAssetFile({ name: file.name, size: file.size });
    if (issue !== null) {
      setLocalError(issue.message);
      return;
    }
    const buffer = await file.arrayBuffer();
    upload.mutate({ id: contentId, filename: file.name, base64: bytesToBase64(new Uint8Array(buffer)) });
  };

  const assets = listQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>Ảnh nhúng trong nội dung bài</AlertTitle>
        <AlertDescription>
          Nhận {[...CONTENT_ASSET_TYPES.keys()].join(', ')}, tối đa 2 MB mỗi tệp. Đây KHÔNG phải khối &quot;Chép
          file vào pod&quot; ở tab Soạn: khối đó khai file có sẵn trong image sandbox, còn ở đây là ảnh hiện
          trong bài.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          accept={[...CONTENT_ASSET_TYPES.keys()].join(',')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void onPick(file);
            }
            // Xoá giá trị để chọn LẠI cùng một tệp vẫn kích hoạt onChange —
            // trình duyệt không phát sự kiện khi giá trị không đổi, và người
            // soạn sửa ảnh rồi tải lại cùng tên là chuyện thường.
            event.target.value = '';
          }}
        />
        <Button
          loading={upload.isPending}
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          Chọn tệp để tải lên
        </Button>
      </div>

      {localError !== null && (
        <Alert variant="destructive">
          <AlertTitle>Không tải lên được</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      {listQuery.isPending && <Skeleton className="h-24 w-full" />}

      {listQuery.isError && (
        <ErrorState
          title="Không tải được danh sách tệp"
          message={describeTrpcError(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      )}

      {listQuery.isSuccess && assets.length === 0 && (
        <EmptyState
          title="Chưa có tệp nào"
          description="Tải một ảnh lên rồi dán đoạn markdown vào ô nội dung của bước để nhúng nó."
        />
      )}

      {assets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên tệp</TableHead>
              <TableHead>Đoạn markdown để nhúng</TableHead>
              <TableHead>Tải lên</TableHead>
              <TableHead>Hành động</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => {
              const snippet = assetMarkdownSnippet(asset);
              return (
                <TableRow key={asset.storageKey}>
                  <TableCell>{asset.filename}</TableCell>
                  <TableCell>
                    <code className="font-mono text-xs break-all">{snippet}</code>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{asset.uploadedAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(snippet).then(
                            () => {
                              setCopiedKey(asset.storageKey);
                            },
                            () => {
                              // Clipboard bị từ chối (quyền, hoặc không phải
                              // ngữ cảnh bảo mật). Đoạn markdown vẫn hiện ở
                              // cột bên cạnh nên người soạn bôi đen chép tay
                              // được — nói ra thay vì im lặng không làm gì.
                              setLocalError('Trình duyệt không cho chép tự động. Bôi đen đoạn markdown rồi chép tay.');
                            },
                          );
                        }}
                      >
                        {copiedKey === asset.storageKey ? 'Đã chép' : 'Chép'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending}
                        title="Xoá thật. Markdown còn tham chiếu tệp này sẽ hiện ảnh hỏng."
                        onClick={() => {
                          setLocalError(null);
                          remove.mutate({ id: contentId, storageKey: asset.storageKey });
                        }}
                      >
                        Xoá
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
