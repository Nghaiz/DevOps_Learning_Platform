import type { Level } from '../contract.ts';

/**
 * Nửa sau của l11 cũ, tách ra thành level riêng (2026-09-08).
 *
 * l11 từng ôm hai việc: chẩn đoán một Job hỏng, và soạn một CronJob mới. Đó là
 * hai mục tiêu dạy học khác nhau, nên phần đúc kết phải nói hai chuyện và
 * khoảnh khắc "à ra thế" bị chia đôi. Ở đây nó có nhịp đóng của riêng nó.
 *
 * ⚠ SỐ 36 KHÔNG PHẢI VỊ TRÍ CHƠI. Level này chơi ngay sau l11, nhưng lấy số ở
 * cuối dãy vì `RunResult.levelId` nằm trong localStorage của người chơi: đánh số
 * lại l12–l35 để nhét số 12 vào đây sẽ xoá sổ tiến độ đã lưu của mọi người, im
 * lặng và không hồi phục được. Xem ô `Level.id` trong `contract.ts`. Thứ tự chơi
 * là thứ tự trong mảng `LEVELS` ở `index.ts`.
 *
 * Level KHÔNG gieo sự cố. l11 vừa chẩn đoán xong; đây là chỗ người chơi tự tay
 * dựng thứ mình vừa hiểu, và chương 2 cần ít nhất một level như thế trước khi
 * sang chương 3. CronJob `sao-luu` được gieo sẵn và ĐANG CHẠY ĐÚNG: nó là mẫu
 * để đọc, theo đúng cách l02 đặt tag đúng trong cụm thay vì trong brief.
 *
 * ⚠ `sao-luu` CỐ Ý không khai `startingDeadlineSeconds`, dù primer và pitfalls có
 * dạy trường đó. Từ vựng CronJob mà engine đọc (`resources.ts`) là
 * `schedule` · `everyTicks` · `jobTemplate` · `labels` · `concurrencyPolicy` ·
 * `suspend`, và `levels-vocabulary.test.ts` bắt mọi field ngoài danh sách đó.
 * Dạy một trường có thật của Kubernetes trong văn xuôi là đúng; gieo nó vào
 * `spec` rồi để mô phỏng lặng lẽ bỏ qua mới là nói dối. Đừng "sửa" bằng cách
 * thêm nó lại vào tài nguyên.
 */
export const l36: Level = {
  id: 'k8s-36-cronjob-theo-lich',
  chapter: 2,
  title: 'Việc tự chạy mỗi đêm, không ai bấm nút',
  brief: `Job bạn vừa cứu ở level trước là việc chạy một lần rồi thôi. Còn việc dọn log thì
phải chạy lại mỗi đêm, mãi mãi, và không ai muốn thức dậy lúc 2 giờ sáng để bấm.

**CronJob** là object cho việc đó. Nó không tự chạy gì cả: tới giờ trong lịch, nó
**tạo ra một Job**, và Job đó tạo pod đúng như bạn đã thấy. Mọi thứ học được ở
level trước vẫn nguyên giá trị, chỉ thêm một tầng ở trên.

Trong namespace \`du-lieu\` đã có sẵn CronJob \`sao-luu\` chạy tốt từ lâu. Nó là
mẫu tham khảo tốt hơn bất cứ tài liệu nào: mở ra xem một CronJob thật có hình
dạng gì.

**Việc cần làm:** tạo CronJob \`don-log\` trong \`du-lieu\`, chạy image
\`busybox:1.37\`, theo lịch **2 giờ sáng mỗi ngày**. Đừng đụng vào \`sao-luu\`.

Lịch viết bằng cú pháp cron năm trường. Đây là chỗ dễ sai nhất và cũng là chỗ
sai âm thầm nhất: một lịch viết nhầm vẫn được API server nhận, CronJob vẫn hiện
ra trong \`kubectl get\`, và bạn chỉ phát hiện ra khi công việc không chạy vào
đêm mà bạn cần nó.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['du-lieu'],
    resources: [
      {
        kind: 'CronJob',
        name: 'sao-luu',
        namespace: 'du-lieu',
        spec: {
          schedule: '0 3 * * 0',
          concurrencyPolicy: 'Forbid',
          jobTemplate: {
            template: {
              labels: { job: 'sao-luu' },
              restartPolicy: 'OnFailure',
              containers: [
                {
                  name: 'sao-luu',
                  image: 'ghcr.io/dlp/sao-luu:2.0.0',
                  command: ['/app/backup', '--dich', '/luu-tru'],
                },
              ],
            },
          },
        },
      },
    ],
  },
  allowedResources: ['CronJob'],
  objectives: [
    {
      id: 'co-cronjob',
      label: 'Có CronJob `don-log` trong namespace `du-lieu`',
      check: 'resource-exists',
      args: { kind: 'CronJob', name: 'don-log', namespace: 'du-lieu' },
      required: true,
    },
    {
      id: 'dung-lich',
      label: 'CronJob `don-log` chạy lúc 2 giờ sáng mỗi ngày',
      check: 'cronjob-schedule-is',
      args: { name: 'don-log', namespace: 'du-lieu', schedule: '0 2 * * *' },
      required: true,
    },
    {
      id: 'khong-dung-cai-dang-chay',
      label: 'CronJob `sao-luu` vẫn còn nguyên',
      check: 'resource-exists',
      args: { kind: 'CronJob', name: 'sao-luu', namespace: 'du-lieu' },
      required: true,
    },
  ],
  hints: [
    'Đừng viết từ đầu. `kubectl get cronjob sao-luu -n du-lieu -o yaml` cho bạn một CronJob thật đang chạy tốt, đủ mọi trường cần có.',
    'Một CronJob tối thiểu cần hai thứ: `schedule` dạng cron, và `jobTemplate` chứa pod template y như của Job. Chú ý pod trong đó phải dùng `restartPolicy` là `Never` hoặc `OnFailure` — `Always` không hợp lệ ở đây, vì một công việc theo lịch phải kết thúc được.',
    'Cron có năm trường theo thứ tự: phút, giờ, ngày trong tháng, tháng, thứ trong tuần. Dấu sao nghĩa là "mọi giá trị". 2 giờ sáng mỗi ngày là `"0 2 * * *"`: phút 0, giờ 2, còn ba trường sau để sao.',
  ],
  parMoves: 1,
  teaches: [
    'CronJob',
    'cron schedule',
    'jobTemplate',
    'concurrencyPolicy',
    'startingDeadlineSeconds',
    'CronJobMissedSchedule',
  ],
  teaching: {
    primer: `**CronJob không chạy gì cả.** Nó là một cái máy tạo Job: tới giờ trong lịch, nó
sinh ra một Job, Job sinh ra pod. Ba tầng, và mọi thứ bạn học ở level trước về
Job vẫn đúng nguyên với từng Job mà nó đẻ ra.

Lịch viết bằng **cú pháp cron năm trường**, theo thứ tự:

\`\`\`
phút  giờ  ngày-trong-tháng  tháng  thứ-trong-tuần
0     2    *                 *      *
\`\`\`

Dấu sao là "mọi giá trị". Dòng trên đọc là: phút thứ 0 của giờ thứ 2, mọi ngày,
mọi tháng, mọi thứ. Tức 02:00 hằng đêm.

Hai trường tuỳ chọn quyết định hành vi khi mọi thứ không diễn ra êm:

- \`concurrencyPolicy\` trả lời "lần chạy trước còn sống thì sao?". Mặc định
  \`Allow\` cho chạy chồng lên nhau. \`Forbid\` bỏ qua lần mới; \`Replace\` giết lần
  cũ.
- \`startingDeadlineSeconds\` là hạn muộn nhất còn được phép khởi động. Trễ hơn
  thế thì lần chạy đó bị **bỏ hẳn**, không dồn lại chạy bù.

Điểm đáng nhớ của cả level: một lịch sai vẫn được API server chấp nhận. Không có
lỗi, không có cảnh báo, CronJob vẫn nằm đó trong \`kubectl get\`. Nó chỉ đơn giản
là không chạy vào lúc bạn tưởng.

Nhìn vào đâu: cột SCHEDULE và LAST SCHEDULE trong \`get cronjob\`, và danh sách
Job nó đã sinh ra.`,
    cheatsheet: [
      {
        command: 'kubectl get cronjob sao-luu -n du-lieu -o yaml',
        explain: 'Đọc một CronJob thật đang chạy tốt. Nhanh hơn và đúng hơn mọi trí nhớ về cú pháp.',
      },
      {
        command: 'kubectl get cronjob -n du-lieu',
        explain: 'Cột SCHEDULE và LAST SCHEDULE: lịch đang khai, và lần gần nhất nó thật sự chạy.',
      },
      {
        command: 'kubectl describe cronjob don-log -n du-lieu',
        explain: 'Events ghi lại từng lần tạo Job, và cả những lần bị bỏ lỡ.',
      },
      {
        command: 'kubectl get jobs -n du-lieu --sort-by=.status.startTime',
        explain: 'Xem CronJob đã đẻ ra những Job nào, theo thứ tự thời gian.',
      },
      {
        command: 'kubectl create job chay-thu --from=cronjob/don-log -n du-lieu',
        explain: 'Chạy thử ngay một lần thay vì chờ tới giờ. Cách kiểm chứng rẻ nhất trước khi tin vào lịch.',
      },
    ],
    takeaways: [
      'CronJob chỉ là bộ tạo Job theo lịch: mọi quy tắc của Job vẫn áp cho từng Job nó sinh ra.',
      'Cron có năm trường theo thứ tự phút, giờ, ngày, tháng, thứ, và dấu sao nghĩa là mọi giá trị.',
      'Một lịch viết sai vẫn được chấp nhận mà không có lỗi nào, nên nó chỉ lộ ra vào đêm công việc không chạy.',
      'concurrencyPolicy và startingDeadlineSeconds quyết định điều gì xảy ra khi lần chạy trước chưa xong hoặc cụm đang bận.',
    ],
    proTips: [
      'Chạy thử bằng `create job --from=cronjob/...` ngay sau khi tạo. Nó kiểm được image và lệnh, phần duy nhất nó không kiểm là lịch.',
      'Đặt lịch theo múi giờ nào là câu hỏi thật: mặc định CronJob tính theo giờ của control plane, thường là UTC. 2 giờ sáng của cụm chưa chắc là 2 giờ sáng của bạn.',
    ],
    pitfalls: [
      'Để `concurrencyPolicy` mặc định cho một công việc không được chạy chồng. Mặc định là `Allow`, và nó không sai ở đâu cả cho tới hôm lần chạy trước kéo dài quá một chu kỳ; khi đó hai bản cùng ghi vào một chỗ. Việc dọn log hay di trú dữ liệu nên dùng `Forbid`.',
      'Đặt `startingDeadlineSeconds` quá ngắn cho gọn. Nghe như một mức an toàn hợp lý, nhưng cụm bận đúng vài chục giây vào phút đó là lần chạy bị bỏ hẳn, và Kubernetes KHÔNG chạy bù. Công việc lặng lẽ mất một đêm và không ô đỏ nào bật lên.',
      'Đọc `0 2 * * *` thành "mỗi 2 giờ một lần". Trường đầu là phút chứ không phải chu kỳ; "mỗi 2 giờ" là `0 */2 * * *`, một lịch chạy nhiều hơn 12 lần so với ý bạn.',
    ],
  },
};
