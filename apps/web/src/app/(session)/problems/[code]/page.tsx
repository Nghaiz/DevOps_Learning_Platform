import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { t } from '@devops-platform/copy';
/*
 * `isAnyProblemCode`, KHÔNG phải `isProblemCode` của barrel.
 *
 * Barrel xuất bản K8s của hàm đó (hai hàm trùng tên, chỉ một ra được — xem
 * `server/problems/problem-code.ts`), và bản ấy khoá cứng vào `^K8S-\d{4}$`. Nên
 * một bài Git lưu ra từ Level Builder mang mã `GIT-0001` **không mở được**: trang
 * này trả `notFound()` trước cả khi hỏi máy chủ, và người soạn thấy 404 cho một
 * bài họ vừa lưu xong.
 *
 * ⚠ `problem-code.ts` nhập `PROBLEM_PLUGINS`, thứ kéo theo CẢ HAI engine. Nhập nó
 * ở đây an toàn vì file này là **Server Component** (không `'use client'`), nên
 * engine vào bundle máy chủ chứ không vào bundle trình duyệt. `pnpm bundle:check`
 * là cổng đo điều đó; nó đã chạy cho lượt sửa này.
 *
 * ⛔ Đừng nhập nó vào một component client. Đường tra KHÔNG kéo engine là
 * `problemTopicLabels` (dữ liệu lá), và `(session)/problems/engine-leak.test.ts`
 * gác đúng chuyện đó.
 */
import { isAnyProblemCode } from '../../../../server/problems/problem-code';
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
  if (!isAnyProblemCode(canonical)) {
    notFound();
  }
  if (canonical !== code) {
    redirect(`/problems/${canonical}`);
  }

  return <ProblemClient code={canonical} />;
}
