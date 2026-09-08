import type { Level } from '../contract.ts';

/**
 * Đóng chương 2 bằng loại workload NGƯỢC với Deployment: một Job thành công là
 * một Job đã dừng hẳn. Người chơi vừa dành năm level học "không Running là đáng
 * ngờ"; ở đây Running mãi mới là hỏng.
 *
 * `backoffLimit: 4` được gieo sẵn có chủ ý — nó giải thích vì sao Job hỏng lại
 * đẻ ra nhiều pod Failed chứ không phải một, và đó là chi tiết hay bị đọc nhầm
 * thành "Job chạy nhiều lần song song".
 *
 * ⚠ Level này TỪNG ôm thêm một việc thứ hai: tự tay tạo một CronJob. Đã bỏ.
 * Hai lý do, và cả hai đều là lỗi thiết kế chứ không phải chuyện dài ngắn:
 *
 *   1. Chẩn đoán một Job hỏng và soạn một CronJob mới là HAI mục tiêu dạy học
 *      khác nhau. Nhét chung một level thì phần đúc kết phải nói hai chuyện, và
 *      khoảnh khắc "à ra thế" bị chia đôi.
 *   2. Ô mục tiêu cho phần CronJob chỉ là `resource-exists`, trong khi brief đòi
 *      "mỗi ngày một lần". Không vị từ nào đang có kiểm được `schedule`, nên nó
 *      là một ô khẳng định nhiều hơn thứ nó kiểm — đúng lỗi vừa sửa ở l05.
 *
 * Phần CronJob thuộc về một level riêng; lead xếp số cho nó.
 */
export const l11: Level = {
  id: 'k8s-11-job-chay-mot-lan',
  chapter: 2,
  title: 'Chạy xong một Job đang thất bại',
  mission: 'Tìm vì sao Job `di-tru-v3` thất bại, sửa, và đưa nó tới trạng thái hoàn thành.',
  brief: `Trong namespace \`du-lieu\` có Job \`di-tru-v3\` và nó không xong.
\`kubectl get jobs\` ghi \`COMPLETIONS 0/1\`, còn danh sách pod thì có mấy pod
Failed nằm rải rác.

Pod đã Failed vẫn giữ nguyên log của nó. Đó là toàn bộ bằng chứng bạn có.`,
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
  allowedResources: ['Job'],
  objectives: [
    {
      id: 'job-hoan-thanh',
      label: 'Job `di-tru-v3` kết thúc ở trạng thái Succeeded',
      check: 'job-succeeded',
      args: { name: 'di-tru-v3', namespace: 'du-lieu' },
      required: true,
    },
  ],
  hints: [
    'Pod của Job đã Failed vẫn còn trong cluster — `kubectl get pods -n du-lieu` sẽ thấy chúng. Log của chúng chính là log của Job, và ở đây bạn không cần `--previous` vì pod không hề bị restart, nó chỉ chết một lần rồi thôi.',
    '`kubectl describe job di-tru-v3 -n du-lieu` cho biết đã thử bao nhiêu lần trên tổng `backoffLimit`. Log của pod Failed nói rõ lệnh bên trong container hỏng ở đâu. Job đã tạo ra rồi thì trường `template` bất biến — muốn đổi lệnh, phải xoá Job và tạo lại.',
    'Log của pod Failed báo không tìm thấy file thực thi. Đối chiếu `command` của container với đường dẫn thật trong image, sửa cho đúng, rồi xoá Job cũ và tạo lại với lệnh đã sửa.',
  ],
  parMoves: 2,
  teaches: ['Job', 'backoffLimit', 'completions', 'restartPolicy Never', 'immutable job template'],
  teaching: {
    primer: `Với **Job**, phản xạ "pod không Running là đáng ngờ" bị lật ngược: Job thành công
là Job đã dừng hẳn.

\`restartPolicy\` quyết định điều đó. Pod của dịch vụ dùng \`Always\` nên kubelet
dựng lại mãi; pod của Job dùng \`Never\` hoặc \`OnFailure\` để tới được trạng thái
kết thúc.

Hai giá trị đó khác nhau ở chỗ đi tìm log. Với \`Never\`, mỗi lần thử là một **pod
mới**, nên một Job hỏng để lại nhiều pod \`Failed\` nằm cạnh nhau — đó là các lần
thử nối tiếp, không phải nhiều bản chạy song song. Với \`OnFailure\`, kubelet
restart container ngay trong pod cũ.

\`backoffLimit\` là số lần thử tối đa trước khi Job bỏ cuộc.`,
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
        explain:
          'Đọc log của các pod thuộc Job. Pod Failed không bị restart nên không cần --previous.',
      },
      {
        command: 'kubectl delete job di-tru-v3 -n du-lieu',
        explain: 'Bắt buộc trước khi sửa lệnh: template của Job đã tạo là bất biến.',
      },
      {
        command: 'kubectl describe job di-tru-v3 -n du-lieu',
        explain:
          'Khối Spec in ra cả template, kèm lệnh khởi động đang khai — chỗ để so từng ký tự với đường dẫn thật trong image.',
      },
    ],
    takeaways: [
      'Job xong là dừng hẳn, nên với Job thì Running mãi mới là dấu hiệu bất thường.',
      'Mỗi lần Job thử lại là một pod mới, nên nhiều pod Failed cạnh nhau là các lần thử nối tiếp chứ không phải chạy song song.',
      'Template của Job bất biến: muốn đổi lệnh thì phải xoá Job và tạo lại.',
      'Pod của Job phải dùng restartPolicy Never hoặc OnFailure, vì Always làm nó không bao giờ tới được trạng thái kết thúc.',
    ],
    proTips: [
      '`ttlSecondsAfterFinished` tự dọn Job đã xong, nhưng nó xoá cả Job hỏng chứ không chỉ Job thành công. Đừng dùng nó cho Job mà bạn cần đọc lại log khi có sự cố.',
      '`backoffLimit: 0` khi bạn muốn thất bại lộ ra ngay lần đầu. Mặc định thử lại nhiều lần rất hợp cho lỗi thoáng qua, nhưng nó kéo dài thời gian trước khi ai đó nhận ra lệnh bên trong sai hẳn.',
    ],
    pitfalls: [
      'Dùng Deployment cho một việc chạy một lần. Nó chạy đúng ngay lần đầu nên trông như đã xong, rồi pod kết thúc bị dựng lại vô hạn và công việc chạy đi chạy lại mãi.',
      'Xoá các pod Failed cho gọn trước khi đọc log. Chúng là bản ghi duy nhất về lý do Job hỏng, và Job thì không giữ lại nội dung đó.',
      'Sửa `command` ngay trong Job đang có, vì nó trông y hệt một Deployment. `template` của Job là bất biến sau khi tạo, nên lệnh sửa bị từ chối và bạn mất thời gian trước khi nhận ra đường đúng là xoá rồi tạo lại.',
    ],
  },
};
