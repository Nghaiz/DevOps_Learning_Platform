'use client';

import { t } from '@devops-platform/copy';
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
      toast({
        title: t('author.asset-manager-da-tai-len'),
        description: t('author.asset-manager-dan-doan-markdown-o-bang-duoi-de-nhung', {
          assetFilename: String(asset.filename),
        }),
      });
    },
    onError: (error) => {
      setLocalError(describeTrpcError(error));
    },
  });

  const remove = api.authoring.deleteAsset.useMutation({
    onSuccess: () => {
      void utils.authoring.listAssets.invalidate();
      toast({ title: t('author.asset-manager-da-xoa-tep') });
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
    upload.mutate({
      id: contentId,
      filename: file.name,
      base64: bytesToBase64(new Uint8Array(buffer)),
    });
  };

  const assets = listQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>{t('author.asset-manager-anh-nhung-trong-noi-dung-bai')}</AlertTitle>
        <AlertDescription>
          {t('author.asset-manager-nhan')} {[...CONTENT_ASSET_TYPES.keys()].join(', ')}
          {t(
            'author.asset-manager-toi-da-2-mb-moi-tep-day-khong-phai-khoi-chep-file-vao-pod-o-tab-soan-khoi-d',
          )}
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
          {t('author.asset-manager-chon-tep-de-tai-len')}
        </Button>
      </div>

      {localError !== null && (
        <Alert variant="destructive">
          <AlertTitle>{t('author.asset-manager-khong-tai-len-duoc')}</AlertTitle>
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}

      {listQuery.isPending && <Skeleton className="h-24 w-full" />}

      {listQuery.isError && (
        <ErrorState
          title={t('author.asset-manager-khong-tai-duoc-danh-sach-tep')}
          message={describeTrpcError(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      )}

      {listQuery.isSuccess && assets.length === 0 && (
        <EmptyState
          title={t('author.asset-manager-chua-co-tep-nao')}
          description={t(
            'author.asset-manager-tai-mot-anh-len-roi-dan-doan-markdown-vao-o-noi-dung-cua-buoc-de-nhung-no',
          )}
        />
      )}

      {assets.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('author.asset-manager-ten-tep')}</TableHead>
              <TableHead>{t('author.asset-manager-doan-markdown-de-nhung')}</TableHead>
              <TableHead>{t('author.asset-manager-tai-len')}</TableHead>
              <TableHead>{t('author.asset-manager-hanh-dong')}</TableHead>
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
                  <TableCell className="text-xs text-muted-foreground">
                    {asset.uploadedAt.slice(0, 10)}
                  </TableCell>
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
                              setLocalError(
                                t(
                                  'author.asset-manager-trinh-duyet-khong-cho-chep-tu-dong-boi-den-doan-markdown-roi-chep-tay',
                                ),
                              );
                            },
                          );
                        }}
                      >
                        {copiedKey === asset.storageKey
                          ? t('author.asset-manager-da-chep')
                          : t('author.asset-manager-chep')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending}
                        title={t(
                          'author.asset-manager-xoa-that-markdown-con-tham-chieu-tep-nay-se-hien-anh-hong',
                        )}
                        onClick={() => {
                          setLocalError(null);
                          remove.mutate({ id: contentId, storageKey: asset.storageKey });
                        }}
                      >
                        {t('common.action.delete')}
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
