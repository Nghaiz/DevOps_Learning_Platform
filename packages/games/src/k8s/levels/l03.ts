import type { Level } from '../contract.ts';

/**
 * CrashLoopBackOff. Cặp đôi khó tách của nó (OOMKilled, LivenessProbeFailure)
 * để dành tới chương 5 và 6 — ở đây người chơi mới học một nguyên nhân, và học
 * đúng công cụ để thấy nó: `logs --previous`.
 *
 * Vì sao cần `--previous`: container đã chết rồi, `kubectl logs` không có gì để
 * đọc. Đây là chỗ người mới bế tắc lâu nhất, nên nó xứng đáng một level riêng
 * thay vì một dòng trong gợi ý của level khác.
 */
export const l03: Level = {
  id: 'k8s-03-doc-log-truoc-khi-doan',
  chapter: 1,
  title: 'Container khởi động rồi chết ngay',
  brief: `Dịch vụ \`bao-cao\` được deploy lúc nửa đêm và chưa phục vụ được request nào.
Nhìn \`kubectl get pods\`, pod ở trạng thái Running một khoảnh khắc rồi lại đổi,
và cột RESTARTS tăng đều: 3, rồi 5, rồi 8. Khoảng cách giữa hai lần restart mỗi
lúc một dài.

Con số restart tăng lên nói với bạn một điều rất cụ thể, khác hẳn level trước:
container đã được **tạo ra và chạy** — chỉ là nó chết ngay sau đó, và kubelet cứ
dựng lại, mỗi lần chờ lâu hơn lần trước.

**Việc cần làm:** tìm ra vì sao container chết, sửa nó, và giữ pod \`bao-cao\` ở
Running mà không còn lý do lỗi nào.

Ở level trước, ứng dụng chưa từng chạy nên không có gì để đọc. Lần này thì có —
nhưng nó nằm ở một chỗ mà lệnh log mặc định không nhìn tới.`,
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['van-hanh'],
    resources: [
      {
        kind: 'Pod',
        name: 'bao-cao',
        namespace: 'van-hanh',
        spec: {
          labels: { app: 'bao-cao' },
          containers: [
            {
              name: 'bao-cao',
              image: 'ghcr.io/dlp/bao-cao:2.1.0',
              command: ['/app/bao-caoo'],
              ports: [{ containerPort: 8080 }],
            },
          ],
        },
        seededIncident: 'lenh-entrypoint-sai',
      },
    ],
  },
  allowedResources: ['Pod'],
  objectives: [
    {
      id: 'bao-cao-chay',
      label: 'Pod `bao-cao` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'van-hanh', name: 'bao-cao' },
      required: true,
    },
    {
      id: 'khong-con-ly-do-loi',
      label: 'Không pod nào của `bao-cao` còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'van-hanh', labelSelector: 'app=bao-cao' },
      required: true,
    },
    {
      id: 'het-su-co',
      label: 'Sự cố trong namespace đã được xử lý dứt điểm',
      check: 'no-incident-active',
      args: { namespace: 'van-hanh' },
      required: false,
    },
  ],
  hints: [
    'RESTARTS tăng nghĩa là container chạy được rồi mới chết — khác hẳn pod chưa bao giờ có container. Nguyên nhân nằm trong ứng dụng hoặc trong cách bạn bảo nó khởi động, không nằm ở registry.',
    '`kubectl logs bao-cao -n van-hanh` hầu như luôn trống ở tình huống này, vì container hiện tại vừa mới bị dựng lại. Thêm `--previous` để đọc log của LẦN CHẠY TRƯỚC — đó mới là lần đã chết.',
    'Log lần trước báo không tìm thấy file thực thi. Đối chiếu trường `command` của container với đường dẫn thật trong image (`/app/bao-cao`) — có một ký tự thừa.',
  ],
  parMoves: 2,
  teaches: [
    'CrashLoopBackOff',
    'kubectl logs --previous',
    'restart count',
    'exponential backoff',
    'container command',
    'entrypoint',
  ],
};
