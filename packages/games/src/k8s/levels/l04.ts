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
};
