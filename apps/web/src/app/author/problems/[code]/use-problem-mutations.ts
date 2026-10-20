'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';

/** Một hành động của trang sửa, ở dạng nơi hiển thị cần: chạy, đang chạy, lỗi của chính nó. */
export interface ProblemAction {
  readonly run: (options?: { readonly onSuccess?: () => void }) => void;
  readonly pending: boolean;
  /** Câu máy chủ trả ở lượt gần nhất của RIÊNG hành động này. */
  readonly error: string | null;
  readonly reset: () => void;
}

/**
 * Bốn mutation của trang sửa, gom một chỗ vì chúng chung một cách hết hạn cache.
 *
 * Lỗi KHÔNG còn gom về một ô chung. Bản cũ đổ mọi lỗi vào một hộp đỏ đầu trang,
 * xa nút vừa bấm: người bấm Xoá trong tab Xuất bản phải cuộn lên mới biết vì sao
 * không xoá được. Nay mỗi hành động giữ lỗi của nó (`error` lấy thẳng từ
 * mutation), và nơi hiển thị đặt câu đó cạnh nút: lỗi xuất bản dưới nút Xuất
 * bản, lỗi lưu trữ và xoá trong hộp xác nhận.
 *
 * Lưu đi đường riêng (`save`) vì nó cần biết NỘI DUNG vừa gửi: ảnh chụp "đã lưu"
 * chỉ được ghi trong `onSuccess`, bằng đúng payload đã gửi, không phải bằng thứ
 * đang trên màn hình lúc máy chủ trả lời (người soạn có thể đã gõ tiếp).
 */
export function useProblemMutations(code: string) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();

  const invalidateAll = (): void => {
    void utils.problems.mine.invalidate();
    void utils.problems.forEdit.invalidate({ code });
  };

  const update = api.problems.update.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: t('author.problem.toast.saved'), variant: 'success' });
    },
  });
  const publish = api.problems.publish.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({
        title: t('author.problem.toast.published'),
        description: t('author.problem.toast.published-body'),
        variant: 'success',
      });
    },
  });
  const archive = api.problems.archive.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: t('author.problem.toast.archived') });
    },
  });
  const remove = api.problems.delete.useMutation({
    onSuccess: () => {
      void utils.problems.mine.invalidate();
      toast({ title: t('author.problem.toast.deleted') });
      router.push('/author/problems');
    },
  });

  /*
   * Đường đỏ hay gặp nhất của Xoá là `CONFLICT` (bài đã có người nộp). Câu của
   * máy chủ đã bảo dùng lưu trữ, nên nó hiện NGUYÊN VĂN qua `describeTrpcError`
   * thay vì một câu viết lại.
   */
  const action = (mutation: typeof publish | typeof archive | typeof remove): ProblemAction => ({
    run: (options) => {
      mutation.mutate({ code }, options?.onSuccess === undefined ? undefined : { onSuccess: options.onSuccess });
    },
    pending: mutation.isPending,
    error: mutation.error === null ? null : describeTrpcError(mutation.error),
    reset: mutation.reset,
  });

  const busy = update.isPending || publish.isPending || archive.isPending || remove.isPending;

  return {
    update,
    saveError: update.error === null ? null : describeTrpcError(update.error),
    publish: action(publish),
    archive: action(archive),
    remove: action(remove),
    busy,
  };
}
