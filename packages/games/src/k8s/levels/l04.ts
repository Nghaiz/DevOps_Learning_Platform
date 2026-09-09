import type { Level } from '../contract.ts';

/**
 * Ba pod, ba trạng thái, và chỉ MỘT trong ba là vấn đề.
 *
 * Đây là level đầu tiên dạy phân biệt thay vì sửa chữa. Nó tồn tại vì `Succeeded`
 * hay bị người mới đọc thành "hỏng" chỉ vì nó không phải `Running` — và phản xạ
 * xoá sạch mọi thứ không-Running là cách đánh mất bằng chứng của một Job vừa
 * chạy xong. Mục tiêu thưởng cố ý tách khỏi mục tiêu bắt buộc để nói rõ điều đó:
 * dọn pod Succeeded là việc VỆ SINH, không phải việc SỬA LỖI.
 */
export const l04: Level = {
  id: 'k8s-04-doc-trang-thai-pod',
  chapter: 1,
  title: 'Dọn đúng pod hỏng, chừa pod đang chạy',
  mission: 'Xoá đúng pod đã thất bại trong `bao-cao`, giữ nguyên pod `web` đang phục vụ.',
  brief: `Bạn nhận ca trực và namespace \`bao-cao\` có ba pod: \`web\` đang Running,
\`xuat-thang-08\` ở Succeeded, \`xuat-thang-07\` ở Failed.

Phản xạ đầu tiên của nhiều người là xoá hết những gì không phải Running. Level này
tồn tại để bạn không mang phản xạ đó đi tiếp.`,
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['bao-cao'],
    resources: [
      {
        kind: 'Pod',
        name: 'web',
        namespace: 'bao-cao',
        spec: {
          labels: { app: 'web' },
          phase: 'Running',
          containers: [{ name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] }],
        },
      },
      {
        kind: 'Pod',
        name: 'xuat-thang-08',
        namespace: 'bao-cao',
        spec: {
          labels: { app: 'xuat-bao-cao' },
          phase: 'Succeeded',
          restartPolicy: 'Never',
          containers: [{ name: 'xuat', image: 'ghcr.io/dlp/xuat-bao-cao:1.0.0' }],
        },
      },
      {
        kind: 'Pod',
        name: 'xuat-thang-07',
        namespace: 'bao-cao',
        spec: {
          labels: { app: 'xuat-bao-cao' },
          phase: 'Failed',
          restartPolicy: 'Never',
          containers: [{ name: 'xuat', image: 'ghcr.io/dlp/xuat-bao-cao:1.0.0' }],
        },
      },
    ],
  },
  allowedResources: ['Pod'],
  objectives: [
    {
      id: 'xoa-pod-that-bai',
      label: 'Pod `xuat-thang-07` đã bị xoá',
      check: 'resource-absent',
      args: { kind: 'Pod', name: 'xuat-thang-07', namespace: 'bao-cao' },
      required: true,
    },
    {
      id: 'giu-dich-vu',
      label: 'Pod `web` vẫn đang chạy',
      check: 'pod-running',
      args: { namespace: 'bao-cao', name: 'web' },
      required: true,
    },
    {
      id: 'don-ban-ghi-thanh-cong',
      label: 'Đã dọn nốt pod `xuat-thang-08` sau khi đọc kết quả',
      check: 'resource-absent',
      args: { kind: 'Pod', name: 'xuat-thang-08', namespace: 'bao-cao' },
      required: false,
    },
  ],
  hints: [
    'Năm phase của pod là Pending, Running, Succeeded, Failed, Terminating. Hai trong số đó nghĩa là "đã chạy xong" — và chỉ MỘT trong hai nghĩa là "đã chạy xong và hỏng".',
    '`kubectl get pods -n bao-cao` cho bạn phase. `kubectl describe pod xuat-thang-07 -n bao-cao` cho bạn exit code của container — số khác 0 là dấu hiệu công việc kết thúc trong lỗi.',
    'Xoá `xuat-thang-07` bằng `kubectl delete pod`. Đừng đụng vào `web`. `xuat-thang-08` xoá cũng được, không xoá cũng không sao — nó chỉ là bản ghi của một lần chạy thành công.',
  ],
  parMoves: 2,
  teaches: ['pod phase', 'Succeeded', 'Failed', 'exit code', 'restartPolicy', 'kubectl delete'],
  teaching: {
    primer: `Pod có đúng **năm phase**, và chỉ hai trong số đó nghĩa là "đang có gì đó chạy".

- \`Pending\`: API server đã nhận, container chưa chạy.
- \`Running\`: ít nhất một container đang chạy.
- \`Succeeded\`: mọi container kết thúc với mã 0, sẽ không chạy lại.
- \`Failed\`: mọi container đã kết thúc, ít nhất một cái với mã khác 0.
- \`Terminating\`: pod đang bị xoá, còn trong thời gian ân hạn.

\`Succeeded\` và \`Failed\` là **trạng thái kết thúc**: pod không còn tốn CPU hay bộ
nhớ, nó chỉ là một bản ghi giữ lại để bạn đọc log và exit code. Kubernetes cố ý
không tự dọn chúng.`,
    cheatsheet: [
      {
        command: 'kubectl get pods -n bao-cao',
        explain: 'Cột STATUS là phase. Đọc nó trước khi quyết định xoá bất cứ thứ gì.',
      },
      {
        command: 'kubectl describe pod xuat-thang-07 -n bao-cao',
        explain: 'Phần State cho Exit Code và Reason của container đã kết thúc.',
      },
      {
        command: 'kubectl get pods -n bao-cao --show-labels',
        explain:
          'Hai pod xuất báo cáo mang chung một label, nên chúng là hai lần chạy của cùng một việc.',
      },
      {
        command: 'kubectl logs xuat-thang-07 -n bao-cao',
        explain: 'Pod đã kết thúc vẫn đọc được log. Đọc trước khi xoá, vì xoá là mất.',
      },
      {
        command: 'kubectl delete pod xuat-thang-07 -n bao-cao',
        explain: 'Xoá đúng một pod theo tên. Đây là việc vệ sinh, không phải việc sửa lỗi.',
      },
    ],
    takeaways: [
      'Không phải Running thì chưa chắc là hỏng: Succeeded là kết quả tốt của một công việc chạy một lần.',
      'Phase nói công việc đã kết thúc hay chưa, exit code nói nó kết thúc tốt hay xấu. Cần cả hai.',
      'Pod ở trạng thái kết thúc không tiêu tài nguyên tính toán, nó chỉ giữ lại log và kết quả.',
      'restartPolicy quyết định pod có bao giờ tới được trạng thái kết thúc hay không.',
    ],
    proTips: [
      'Đọc log rồi mới xoá. Trong sự cố thật, pod Failed thường là bản ghi duy nhất còn lại của lần chạy hỏng.',
      '`restartPolicy` quyết định pod có bao giờ tới được trạng thái kết thúc: `Always` (mặc định của dịch vụ) làm kubelet dựng lại mãi, còn `Never` và `OnFailure` mới dành cho việc chạy một lần.',
      'Ở cụm thật, dùng `ttlSecondsAfterFinished` trên Job để tự dọn thay vì xoá tay, nhưng nhớ rằng nó xoá cả Job hỏng chứ không chỉ Job thành công.',
    ],
    pitfalls: [
      'Xoá sạch mọi thứ không phải Running cho gọn bảng. Bảng sạch thật, và mọi bằng chứng bạn cần cho lần điều tra tiếp theo cũng biến mất theo.',
      'Thấy Failed rồi tưởng pod vẫn đang chạy hỏng và đang ăn tài nguyên. Nó đã dừng từ lâu; cái đang chảy máu là thứ khác.',
    ],
  },
};
