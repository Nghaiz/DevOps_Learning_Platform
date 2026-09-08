'use client';

import { useEffect, useState } from 'react';
import type { ClusterView } from '@devops-platform/games';
import { pushSample, sampleFrom, type MetricSample } from './metrics-history.ts';

/**
 * Chuỗi mẫu số liệu của cả phiên chơi, thu ở MỘT chỗ.
 *
 * ⚠ Trước đây lịch sử nằm trong state của `MetricsPanel`, và chú thích ở đó nói
 * rõ vì sao: *"giữ lịch sử ở cha có nghĩa là mọi phiên chơi đều trả giá bộ nhớ
 * cho một bảng phần lớn thời gian đang tắt"*. Lập luận đó ĐÚNG khi số liệu chỉ
 * sống trong một bảng bật/tắt. Nó hết đúng kể từ khi dải số liệu nằm thường trực
 * trên thanh trên cùng: mẫu phải được thu dù bảng có mở hay không, nên thu hai
 * nơi là thu thừa một nơi.
 *
 * Đổi lại còn sửa được một hệ quả mà bảng cũ phải tự đi giải thích ở chân nó:
 * đồ thị không còn bắt đầu từ lúc MỞ bảng, mà từ lúc vào bài.
 *
 * Trần bộ nhớ vẫn do `METRICS_WINDOW` giữ (120 mẫu), nên "giữ ở cha" không phải
 * một khoản chi không đáy.
 */
export function useMetricsHistory(view: ClusterView): readonly MetricSample[] {
  const [history, setHistory] = useState<readonly MetricSample[]>([]);

  useEffect(() => {
    setHistory((current) => pushSample(current, sampleFrom(view)));
  }, [view]);

  return history;
}
