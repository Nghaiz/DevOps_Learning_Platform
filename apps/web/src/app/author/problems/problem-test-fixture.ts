import { emptyForm, type ProblemFormState } from './problem-form';

/**
 * Bộ dựng dùng chung cho các test của trình soạn bài.
 *
 * `validForm()` là ĐỐI CHỨNG DƯƠNG: mọi test chặn bên dưới bắt đầu từ nó rồi phá
 * đúng MỘT thứ. Không có đối chứng dương thì một hàm kiểm luôn trả lỗi cũng làm
 * mọi ô đỏ-phải-đỏ xanh hết, và suite đọc ra như đang gác thứ gì đó.
 */
let counter = 0;
export const nextKey = (): string => {
  counter += 1;
  return `t-${String(counter)}`;
};

/** Bài hợp lệ tối thiểu — dùng làm ĐỐI CHỨNG DƯƠNG cho mọi phép kiểm bên dưới. */
export function validForm(): ProblemFormState {
  const base = emptyForm(nextKey);
  return {
    ...base,
    title: 'Pod không khởi động sau khi đổi image',
    slug: 'pod-khong-khoi-dong',
    statement: 'Namespace `thanh-toan` có một Deployment không lên nổi replica nào. Đưa nó về đủ 3 replica.',
    topics: ['workload', 'troubleshooting'],
    tagsText: 'CrashLoop, Chẩn Đoán',
    cluster: {
      ...base.cluster,
      nodes: base.cluster.nodes.map((node) => ({ ...node, name: 'node-1' })),
      namespacesText: 'default\nthanh-toan',
    },
    objectives: [
      {
        key: nextKey(),
        id: 'muc-tieu-1',
        label: 'Deployment thanh-toan có đủ 3 replica sẵn sàng',
        check: 'deployment-ready',
        args: { name: 'thanh-toan', namespace: 'thanh-toan', replicas: '3' },
        required: true,
      },
    ],
  };
}

