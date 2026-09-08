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
  teaching: {
    primer: `Năm level vừa rồi dạy một phản xạ: pod không Running là đáng ngờ. Với **Job**
thì ngược lại. Một Job thành công là một Job đã dừng hẳn; Job còn chạy mãi mới
là chuyện phải xem.

\`restartPolicy\` là thứ quyết định điều đó. Pod của dịch vụ dùng \`Always\` nên
kubelet dựng lại mãi. Pod của Job phải dùng \`Never\` hoặc \`OnFailure\`, nếu
không nó không bao giờ tới được trạng thái kết thúc.

Khi container của Job chết, Job **thử lại bằng một pod mới**, không phải bằng
cách restart pod cũ. Vì thế một Job hỏng để lại nhiều pod \`Failed\` nằm cạnh
nhau. Đó là các lần thử nối tiếp nhau, không phải nhiều bản chạy song song, và
\`backoffLimit\` là số lần thử tối đa trước khi Job bỏ cuộc. Mỗi pod đó giữ log
của lần thử tương ứng.

Một đặc tính hay bị vấp: \`template\` của Job là **bất biến** sau khi tạo. Sửa
lệnh bên trong nghĩa là xoá Job rồi tạo lại, không phải sửa tại chỗ.

**CronJob** không tự chạy gì cả. Nó chỉ là cái máy tạo Job theo lịch cron, và
mọi thứ ở trên vẫn đúng với từng Job nó sinh ra.

Nhìn vào đâu: \`describe job\` cho số lần đã thử, log của pod \`Failed\` cho lý do.`,
    cheatsheet: [
      {
        command: 'kubectl get jobs -n du-lieu',
        explain: 'Cột COMPLETIONS dạng x/y: đã xong bao nhiêu trên tổng số cần xong.',
      },
      {
        command: 'kubectl describe job di-tru-v3 -n du-lieu',
        explain: 'Cho biết đã thử mấy lần trên backoffLimit, và Events của từng lần tạo pod.',
      },
      {
        command: 'kubectl logs -n du-lieu -l job=di-tru-v3',
        explain: 'Đọc log của các pod thuộc Job. Pod Failed không bị restart nên không cần --previous.',
      },
      {
        command: 'kubectl delete job di-tru-v3 -n du-lieu',
        explain: 'Bắt buộc trước khi sửa lệnh: template của Job đã tạo là bất biến.',
      },
      {
        command: 'kubectl create job chay-thu --from=cronjob/don-log -n du-lieu',
        explain: 'Chạy CronJob ngay một lần để thử, không phải chờ tới giờ trong lịch.',
      },
    ],
    takeaways: [
      'Job xong là dừng hẳn, nên với Job thì Running mãi mới là dấu hiệu bất thường.',
      'Mỗi lần Job thử lại là một pod mới, nên nhiều pod Failed cạnh nhau là các lần thử nối tiếp chứ không phải chạy song song.',
      'Template của Job bất biến: muốn đổi lệnh thì phải xoá Job và tạo lại.',
      'CronJob chỉ là bộ tạo Job theo lịch; mọi quy tắc của Job vẫn áp cho từng Job nó sinh ra.',
    ],
    proTips: [
      '`ttlSecondsAfterFinished` tự dọn Job đã xong, nhưng nó xoá cả Job hỏng chứ không chỉ Job thành công. Đừng dùng nó cho Job mà bạn cần đọc lại log khi có sự cố.',
      '`concurrencyPolicy: Forbid` chặn lần chạy mới khi lần trước còn sống, hợp cho việc di trú dữ liệu không được chạy chồng.',
    ],
    pitfalls: [
      'Dùng Deployment cho một việc chạy một lần. Nó chạy đúng ngay lần đầu nên trông như đã xong, rồi pod kết thúc bị dựng lại vô hạn và công việc chạy đi chạy lại mãi.',
      'Xoá các pod Failed cho gọn trước khi đọc log. Chúng là bản ghi duy nhất về lý do Job hỏng, và Job thì không giữ lại nội dung đó.',
    ],
  },
};
