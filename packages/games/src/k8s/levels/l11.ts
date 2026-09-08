import type { Level } from '../contract.ts';

/**
 * Đóng chương 2 bằng loại workload NGƯỢC với Deployment: một Job thành công là
 * một Job đã dừng hẳn. Người chơi vừa dành năm level học "không Running là đáng
 * ngờ"; ở đây Running mãi mới là hỏng.
 *
 * `backoffLimit: 4` được gieo sẵn có chủ ý — nó giải thích vì sao Job hỏng lại
 * đẻ ra nhiều pod Failed chứ không phải một, và đó là chi tiết hay bị đọc nhầm
 * thành "Job chạy nhiều lần song song".
 */
export const l11: Level = {
  id: 'k8s-11-job-va-cronjob',
  chapter: 2,
  title: 'Công việc chạy một lần rồi thôi',
  brief: `Không phải workload nào cũng phải sống mãi. Việc di trú dữ liệu chạy một lần rồi
kết thúc; việc dọn log chạy mỗi đêm rồi kết thúc. Đưa những thứ đó vào Deployment
là sai loại: Deployment thấy pod dừng sẽ dựng lại, và một công việc đã xong sẽ bị
chạy lại vô hạn.

Kubernetes có hai object cho việc này. **Job** chạy pod tới khi thành công rồi
dừng hẳn. **CronJob** tạo Job theo lịch.

Trong namespace \`du-lieu\` đang có Job \`di-tru-v3\` và nó không xong. Bảng
\`kubectl get jobs\` ghi \`COMPLETIONS 0/1\`, còn danh sách pod thì có mấy pod
Failed nằm rải rác — mỗi lần Job thử lại là một pod mới, và Job đã dùng gần hết
số lần thử cho phép (\`backoffLimit\`).

**Việc cần làm:**

1. Tìm ra vì sao Job thất bại, sửa, và đưa nó tới trạng thái hoàn thành.
2. Tạo thêm CronJob \`don-log\` trong cùng namespace, chạy \`busybox:1.37\` theo
   lịch mỗi ngày một lần.

Với phần 1, hãy nhớ pod đã Failed vẫn giữ nguyên log của nó — đó là lý do
Kubernetes không xoá chúng ngay.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['du-lieu'],
    resources: [
      {
        kind: 'Job',
        name: 'di-tru-v3',
        namespace: 'du-lieu',
        spec: {
          backoffLimit: 4,
          completions: 1,
          template: {
            labels: { job: 'di-tru-v3' },
            restartPolicy: 'Never',
            containers: [
              {
                name: 'di-tru',
                image: 'ghcr.io/dlp/di-tru:3.0.0',
                command: ['/app/migrate', '--tu', 'v2', '--den', 'v3'],
                env: [{ name: 'DB_HOST', value: 'postgres.du-lieu.svc.cluster.local' }],
              },
            ],
          },
        },
        seededIncident: 'lenh-entrypoint-sai',
      },
    ],
  },
  allowedResources: ['Job', 'CronJob'],
  objectives: [
    {
      id: 'job-hoan-thanh',
      label: 'Job `di-tru-v3` kết thúc ở trạng thái Succeeded',
      check: 'job-succeeded',
      args: { name: 'di-tru-v3', namespace: 'du-lieu' },
      required: true,
    },
    {
      id: 'co-cronjob',
      label: 'Có CronJob `don-log` trong namespace `du-lieu`',
      check: 'resource-exists',
      args: { kind: 'CronJob', name: 'don-log', namespace: 'du-lieu' },
      required: true,
    },
  ],
  hints: [
    'Pod của Job đã Failed vẫn còn trong cluster — `kubectl get pods -n du-lieu` sẽ thấy chúng. Log của chúng chính là log của Job, và ở đây bạn không cần `--previous` vì pod không hề bị restart, nó chỉ chết một lần rồi thôi.',
    '`kubectl describe job di-tru-v3 -n du-lieu` cho biết đã thử bao nhiêu lần trên tổng `backoffLimit`. Log của pod Failed nói rõ lệnh bên trong container hỏng ở đâu. Job đã tạo ra rồi thì trường `template` bất biến — muốn đổi lệnh, phải xoá Job và tạo lại.',
    'Sửa `command` của container cho đúng đường dẫn thật rồi tạo lại Job. Với CronJob, tối thiểu cần một `schedule` dạng cron (`"0 2 * * *"` là 2 giờ sáng mỗi ngày) và một `jobTemplate` chứa pod template.',
  ],
  parMoves: 3,
  teaches: [
    'Job',
    'CronJob',
    'backoffLimit',
    'completions',
    'restartPolicy Never',
    'cron schedule',
    'immutable job template',
  ],
};
