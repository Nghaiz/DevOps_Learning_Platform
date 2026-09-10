'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';

/**
 * Bốn mutation của trang sửa, gom về một chỗ.
 *
 * Tách khỏi component vì chúng chia sẻ đúng hai thứ: cùng một cách hết hạn cache
 * và cùng một ô báo lỗi máy chủ. Để rải trong component thì bốn `onError` giống
 * hệt nhau nằm cách nhau ba chục dòng, và chỉ cần một cái quên `setServerError`
 * là một lượt đỏ biến mất không dấu vết.
 */
export function useProblemMutations(code: string) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();
  const [serverError, setServerError] = useState<string | null>(null);

  const invalidateAll = (): void => {
    void utils.problems.mine.invalidate();
    void utils.problems.forEdit.invalidate({ code });
  };

  const update = api.problems.update.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: t('author.problem.toast.saved'), variant: 'success' });
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
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
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });
  const archive = api.problems.archive.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast({ title: t('author.problem.toast.archived') });
    },
    onError: (error) => {
      setServerError(describeTrpcError(error));
    },
  });
  const remove = api.problems.delete.useMutation({
    onSuccess: () => {
      void utils.problems.mine.invalidate();
      toast({ title: t('author.problem.toast.deleted') });
      router.push('/author/problems');
    },
    onError: (error) => {
      // Đường đỏ hay gặp nhất ở đây là `CONFLICT` — bài đã có người nộp. Thông
      // báo của máy chủ đã nói phải dùng lưu trữ, nên hiện nguyên văn thay vì
      // viết lại một câu khác.
      setServerError(describeTrpcError(error));
    },
  });

  const busy = update.isPending || publish.isPending || archive.isPending || remove.isPending;

  return { update, publish, archive, remove, busy, serverError, setServerError };
}
