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
  title: 'Ba pod, chỉ một cái là vấn đề',
  brief: `Bạn nhận ca trực và namespace \`bao-cao\` có ba pod, không cái nào giống cái nào:

| Pod | STATUS | RESTARTS |
|---|---|---|
| \`web\` | Running | 0 |
| \`xuat-thang-08\` | Succeeded | 0 |
| \`xuat-thang-07\` | Failed | 0 |

Phản xạ đầu tiên của nhiều người là xoá hết những gì không phải Running. Đó là
phản xạ sai, và level này tồn tại để bạn không mang nó theo suốt phần còn lại.

Kubernetes có năm phase cho pod, và ba trong số đó là **trạng thái kết thúc**:
pod đã chạy xong, sẽ không chạy lại nữa, và bản ghi của nó còn nằm đó chỉ để bạn
đọc kết quả. Một trong ba pod trên là bản ghi của một công việc **thành công**.
Một cái khác là bản ghi của một công việc **thất bại** — và đó mới là thứ cần
được dọn đi sau khi bạn đã đọc xong nó.

**Việc cần làm:** xoá đúng pod đã thất bại, giữ nguyên dịch vụ đang chạy. Dọn nốt
bản ghi thành công là điểm thưởng, không bắt buộc.`,
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
  teaches: [
    'pod phase',
    'Succeeded',
    'Failed',
    'exit code',
    'restartPolicy',
    'kubectl delete',
  ],
  teaching: {
    primer: `Pod có đúng **năm phase**, và chỉ hai trong số đó nghĩa là "đang có gì đó chạy".

- \`Pending\`: API server đã nhận, container chưa chạy.
- \`Running\`: ít nhất một container đang chạy.
- \`Succeeded\`: mọi container đã kết thúc với mã 0 và sẽ không chạy lại.
- \`Failed\`: mọi container đã kết thúc, ít nhất một cái với mã khác 0.
- \`Terminating\`: pod đang bị xoá, còn trong thời gian ân hạn.

\`Succeeded\` và \`Failed\` là **trạng thái kết thúc**. Pod ở đó không còn tốn CPU
hay bộ nhớ; nó chỉ còn là một bản ghi trong API, giữ lại để bạn đọc log và exit
code. Kubernetes cố ý không tự dọn chúng, vì bản ghi đó thường là bằng chứng duy
nhất về một công việc vừa chạy đêm qua.

Một pod chỉ kết thúc được khi \`restartPolicy\` của nó không phải \`Always\`. Với
\`Never\` hoặc \`OnFailure\` (loại dùng cho công việc chạy một lần), container
chết là pod chốt sổ. Với \`Always\` (mặc định, dùng cho dịch vụ), kubelet dựng
lại mãi nên pod không bao giờ tới được \`Succeeded\`.

Nhìn vào đâu: cột STATUS cho phase, và \`describe\` cho exit code. Exit code là
thứ phân biệt "xong tốt" với "xong hỏng", còn phase chỉ nói "đã xong".`,
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
        command: 'kubectl get pods -n bao-cao --field-selector status.phase=Failed',
        explain: 'Lọc thẳng theo phase, hữu ích khi namespace có hàng trăm pod.',
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
      'Ở cụm thật, dùng `ttlSecondsAfterFinished` trên Job để tự dọn thay vì xoá tay, nhưng nhớ rằng nó xoá cả Job hỏng chứ không chỉ Job thành công.',
    ],
    pitfalls: [
      '`kubectl delete pod --all` cho gọn bảng. Nó làm bảng sạch thật, và xoá luôn mọi bằng chứng bạn cần cho lần điều tra tiếp theo.',
      'Thấy Failed rồi tưởng pod vẫn đang chạy hỏng và đang ăn tài nguyên. Nó đã dừng từ lâu; cái đang chảy máu là thứ khác.',
    ],
  },
};
