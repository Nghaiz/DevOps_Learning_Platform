import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { t } from '@devops-platform/copy';
import { isProblemCode } from '@devops-platform/games';
import { readViewerSession } from '../../../../components/catalog/viewer-role.server';
import { ProblemClient } from './problem-client';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  // Tiêu đề dựng từ MÃ chứ không từ tên bài: lấy tên đòi một lượt gọi máy chủ
  // thứ hai chỉ để điền thẻ `<title>`, trong khi mã bài đã là thứ người ta đọc
  // cho nhau nghe ("làm được K8S-0042 chưa?") và nó không bao giờ đổi.
  return { title: t('catalog.problem.meta-title', { code: code.toUpperCase() }) };
}

/**
 * `/problems/[code]` — vỏ route.
 *
 * Hai lượt kiểm trước khi tới component:
 *
 * 1. **Chuẩn hoá hoa/thường.** `k8s-0042` và `K8S-0042` là cùng một bài, nên
 *    đường dẫn thường được chuyển hướng về dạng chuẩn thay vì phục vụ hai URL
 *    cho một tài nguyên. Chuyển hướng chứ không âm thầm nhận: URL trên thanh
 *    địa chỉ phải là thứ người dùng gửi đi được.
 * 2. **Mã sai dạng ⇒ 404 thật.** `/problems/abc` không phải "bài không tồn tại"
 *    mà là "không phải mã bài", và bắt máy chủ đi hỏi DB một chuỗi không thể
 *    khớp là cho người ngoài một đường dò rẻ tiền.
 *
 * Bài có mã ĐÚNG dạng nhưng không tồn tại (hoặc còn ở trạng thái nháp) thì
 * `byCode` trả `NOT_FOUND` và client hiện trạng thái rỗng — xem `problem-client.tsx`.
 */
export default async function ProblemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if ((await readViewerSession()) === null) {
    redirect('/login');
  }

  const canonical = code.toUpperCase();
  if (!isProblemCode(canonical)) {
    notFound();
  }
  if (canonical !== code) {
    redirect(`/problems/${canonical}`);
  }

  return <ProblemClient code={canonical} />;
}
