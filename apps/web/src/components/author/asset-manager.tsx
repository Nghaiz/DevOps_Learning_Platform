'use client';

import { t } from '@devops-platform/copy';
import { useId, useRef, useState, type ReactElement } from 'react';
import { CONTENT_ASSET_TYPES, MAX_CONTENT_ASSET_BYTES } from '@devops-platform/shared-types/authoring';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { AssetList } from './asset-list';
import { bytesToBase64, formatBytes, validateAssetFile } from './asset-upload';
import { Button, Icon, Notice, toast } from '@devops-platform/ds';

/**
 * Tệp đính kèm của một bài: tải lên, liệt kê, xoá.
 *
 * ## Vì sao base64 chứ không multipart
 *
 * `authoring.uploadAsset` là một tRPC mutation, và tRPC là JSON. Server kiểm trần
 * cỡ TRƯỚC khi decode (một chuỗi base64 4 MB decode ra 3 MB, và kiểm sau decode
 * là đã cấp phát 3 MB cho một request sẽ bị từ chối), nên `input.base64` có
 * `.max()` riêng, và bản kiểm ở client dùng chung hằng số đó.
 *
 * ## Xoá là XOÁ THẬT, khác hẳn "lưu trữ" của bài
 *
 * Bài thì lưu trữ chứ không xoá (tiến độ người học trỏ tới id bài). Asset thì
 * không có gì trỏ tới ngoài markdown của chính bài này, nên `deleteAsset` xoá
 * hàng thật. Hệ quả: markdown còn tham chiếu tới `storageKey` vừa xoá sẽ hiện
 * ảnh hỏng, và không có gì trong hệ thống báo trước, nên câu cảnh báo nằm ở nút.
 *
 * Trần cỡ và danh sách đuôi trên màn hình đọc từ chính hằng số server dùng
 * (`MAX_CONTENT_ASSET_BYTES`, `CONTENT_ASSET_TYPES`), không gõ lại "2 MB".
 */
export function AssetManager({ contentId }: { readonly contentId: string }): ReactElement {
  const utils = api.useUtils();
  const fileInput = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const titleId = useId();

  const listQuery = api.authoring.listAssets.useQuery({ id: contentId });

  const upload = api.authoring.uploadAsset.useMutation({
    onSuccess: (asset) => {
      void utils.authoring.listAssets.invalidate();
      toast.success(t('author.asset-manager-da-tai-len'), {
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
      toast.success(t('author.asset-manager-da-xoa-tep'));
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

  const accepted = [...CONTENT_ASSET_TYPES.keys()];

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby={titleId}
        className="relative grid animate-enter gap-5 border border-rule-2 bg-paper p-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:p-6"
      >
        <span aria-hidden className="grid size-12 place-items-center bg-acc-solid text-on-solid">
          <Icon name="upload" size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
            {t('author.asset-manager-anh-nhung-trong-noi-dung-bai')}
          </h2>
          <p className="text-sm text-ink">
            {t('author.asset-manager-dinh-dang-va-tran', {
              types: accepted.join(', '),
              max: formatBytes(MAX_CONTENT_ASSET_BYTES),
            })}
          </p>
          <p className="text-xs leading-relaxed text-ink-2">
            {t('author.asset-manager-khong-phai-khoi-chep-file-vao-pod')}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept={accepted.join(',')}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void onPick(file);
            }
            // Xoá giá trị để chọn LẠI cùng một tệp vẫn kích hoạt onChange: trình
            // duyệt không phát sự kiện khi giá trị không đổi, và người soạn sửa
            // ảnh rồi tải lại cùng tên là chuyện thường.
            event.target.value = '';
          }}
        />
        <Button
          variant="primary"
          loading={upload.isPending}
          icon="upload"
          onClick={() => {
            fileInput.current?.click();
          }}
        >
          {t('author.asset-manager-chon-tep-de-tai-len')}
        </Button>
      </section>

      {localError !== null && (
        <Notice tone="bad" title={t('author.asset-manager-khong-tai-len-duoc')} className="animate-enter">{localError}</Notice>
      )}

      <AssetList
        state={{
          status: listQuery.status,
          assets: listQuery.data ?? [],
          errorMessage: listQuery.isError ? describeTrpcError(listQuery.error) : null,
          retrying: listQuery.isFetching,
          onRetry: () => void listQuery.refetch(),
        }}
        removing={remove.isPending}
        onRemove={(storageKey) => {
          setLocalError(null);
          remove.mutate({ id: contentId, storageKey });
        }}
        onCopyFailed={() => {
          setLocalError(
            t('author.asset-manager-trinh-duyet-khong-cho-chep-tu-dong-boi-den-doan-markdown-roi-chep-tay'),
          );
        }}
      />
    </div>
  );
}
