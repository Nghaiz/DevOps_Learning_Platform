/**
 * Mười bài mẫu của hệ OJ, chuyển từ 10 challenge trong `challenges.ts`.
 *
 * ⛔ Đây là DỮ LIỆU GỐC để nạp vào cơ sở dữ liệu một lần, không phải nguồn đọc
 * lúc chạy. Trang danh sách và trang chi tiết đọc từ DB — nếu chúng đọc thẳng
 * từ đây thì bài do người soạn tạo ra sẽ không bao giờ hiện, và bộ lọc theo
 * người giải sẽ không có gì để nối vào.
 *
 * Thứ tự trong mảng là thứ tự mã bài, và đó cũng là khoá sắp xếp mặc định của
 * `PROBLEM_ORDER_KEYS` — trùng nhau là tình cờ có ích, không phải ràng buộc.
 */

import type { Problem } from '../problem.ts';
import { k8s0001 } from './k8s-0001.ts';
import { k8s0002 } from './k8s-0002.ts';
import { k8s0003 } from './k8s-0003.ts';
import { k8s0004 } from './k8s-0004.ts';
import { k8s0005 } from './k8s-0005.ts';
import { k8s0006 } from './k8s-0006.ts';
import { k8s0007 } from './k8s-0007.ts';
import { k8s0008 } from './k8s-0008.ts';
import { k8s0009 } from './k8s-0009.ts';
import { k8s0010 } from './k8s-0010.ts';

export const PROBLEMS_SEED: readonly Problem[] = [
  k8s0001,
  k8s0002,
  k8s0003,
  k8s0004,
  k8s0005,
  k8s0006,
  k8s0007,
  k8s0008,
  k8s0009,
  k8s0010,
];
