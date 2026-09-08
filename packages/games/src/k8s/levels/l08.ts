import type { Level } from '../contract.ts';

/**
 * Rolling update ở trạng thái LÀNH — phải có level này trước l09, vì l09 dạy
 * rollout hỏng và người chơi cần biết một rollout thành công trông thế nào để
 * nhận ra cái treo giữa chừng.
 *
 * `pod-count-running` giữ min = 4 trong suốt: đó là cách duy nhất ở đây khẳng
 * định "không đứt dịch vụ" bằng một vị từ có sẵn, thay vì tin lời brief.
 */
export const l08: Level = {
  id: 'k8s-08-rollout-khong-dut-dich-vu',
  chapter: 2,
  title: 'Đổi phiên bản mà không tắt dịch vụ',
  brief: `Bản \`1.5.0\` của API đã qua kiểm thử và cần lên production. Deployment \`api\`
trong namespace \`nen-tang\` hiện chạy 4 replica ở bản \`1.4.2\`, và đang phục
vụ khách hàng thật ngay lúc này.

Cách làm sai kinh điển là xoá Deployment cũ rồi tạo cái mới. Nó chạy được, và nó
để lại một khoảng vài chục giây không ai phục vụ request.

Kubernetes có sẵn đường khác. Khi bạn đổi image trong template, Deployment không
thay thế toàn bộ pod cùng lúc — nó tạo một **ReplicaSet mới**, cho ReplicaSet đó
lên từng bậc, và chỉ hạ ReplicaSet cũ xuống theo đúng nhịp đó. Hai tham số
\`maxSurge\` và \`maxUnavailable\` quy định nhịp: được phép vượt bao nhiêu pod so
với mong muốn, và được phép thiếu bao nhiêu.

Đó cũng là lý do tầng ReplicaSet tồn tại. Nếu Deployment quản pod trực tiếp thì
không có cách nào giữ hai thế hệ pod cùng sống trong lúc chuyển giao.

**Việc cần làm:** đưa Deployment \`api\` sang image
\`ghcr.io/dlp/api:1.5.0\`, giữ đủ 4 replica sẵn sàng khi xong, và **không để số
pod đang chạy tụt xuống dưới 4** trong lúc chuyển.`,
  difficulty: 'basic',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['nen-tang'],
    resources: [
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          replicas: 4,
          selector: { matchLabels: { app: 'api' } },
          strategy: { type: 'RollingUpdate', maxSurge: 1, maxUnavailable: 0 },
          template: {
            labels: { app: 'api' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.4.2',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
    ],
  },
  allowedResources: ['Deployment'],
  objectives: [
    {
      id: 'image-moi',
      label: 'Deployment `api` chạy image `ghcr.io/dlp/api:1.5.0`',
      check: 'container-image-is',
      args: {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        image: 'ghcr.io/dlp/api:1.5.0',
      },
      required: true,
    },
    {
      id: 'du-bon-replica',
      label: 'Deployment `api` có đủ 4 replica sẵn sàng sau khi chuyển xong',
      check: 'deployment-ready',
      args: { name: 'api', namespace: 'nen-tang', replicas: 4 },
      required: true,
    },
    {
      id: 'khong-dut-dich-vu',
      label: 'Luôn có ít nhất 4 pod `app=api` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'nen-tang', labelSelector: 'app=api', min: 4 },
      required: true,
    },
  ],
  hints: [
    'Bạn không cần xoá gì cả. Deployment nhận nhiệm vụ đưa thực tế về khớp mong muốn — nên hãy đổi mong muốn: sửa image trong template của nó.',
    'Theo dõi tiến trình bằng `kubectl rollout status deployment/api -n nen-tang`. Lệnh này chỉ trả về khi rollout hoàn tất, nên nó cũng là cách viết script chờ đúng cách.',
    '`kubectl set image deployment/api api=ghcr.io/dlp/api:1.5.0 -n nen-tang` (hoặc sửa thẳng field image). Cấu hình sẵn của Deployment là `maxUnavailable: 0`, nên nó tự giữ đủ 4 pod suốt quá trình — bạn không phải làm gì thêm.',
  ],
  parMoves: 1,
  teaches: [
    'rolling update',
    'kubectl set image',
    'kubectl rollout status',
    'maxSurge',
    'maxUnavailable',
    'ReplicaSet generation',
  ],
  teaching: {
    primer: `Đổi phiên bản mà không đứt dịch vụ là việc Deployment sinh ra để làm.

Khi bạn sửa \`template\` (thường là image), Deployment không sửa pod đang chạy.
Pod là bất biến: đổi image nghĩa là **thay pod**. Deployment tạo một
**ReplicaSet mới** cho thế hệ mới, rồi vừa cho ReplicaSet mới lên từng bậc vừa
hạ ReplicaSet cũ xuống, đúng nhịp mà hai tham số này quy định:

- \`maxSurge\`: được phép có bao nhiêu pod **vượt** số mong muốn trong lúc chuyển.
- \`maxUnavailable\`: được phép **thiếu** bao nhiêu pod so với số mong muốn.

\`maxUnavailable: 0\` là một cái phanh an toàn: Deployment không được hạ pod cũ
trước khi pod mới sẵn sàng. Đổi lại, nó cần chỗ trống cho pod thứ 5 tạm thời tồn
tại, nên \`maxSurge\` phải lớn hơn 0.

Đây cũng là lý do tầng ReplicaSet tồn tại. Nếu Deployment quản pod trực tiếp thì
không có cách nào giữ hai thế hệ cùng sống trong lúc chuyển giao, và không có
cách nào quay lại thế hệ trước.

Thứ đo tiến trình là \`kubectl rollout status\`: nó chỉ trả về khi rollout xong,
nên nó vừa là cách theo dõi vừa là cách chờ đúng trong script.

Nhìn vào đâu: \`kubectl get rs\` để thấy hai ReplicaSet cùng tồn tại trong lúc
chuyển, một cái đang lên và một cái đang xuống.`,
    cheatsheet: [
      {
        command: 'kubectl set image deployment/api api=ghcr.io/dlp/api:1.5.0 -n nen-tang',
        explain: 'Đổi image trong template. Cú pháp là ten-container=image, không phải ten-deployment.',
      },
      {
        command: 'kubectl rollout status deployment/api -n nen-tang',
        explain: 'Chờ tới khi rollout hoàn tất. Lệnh treo nghĩa là rollout chưa xong, không phải lệnh hỏng.',
      },
      {
        command: 'kubectl get rs -n nen-tang',
        explain: 'Trong lúc chuyển sẽ thấy hai ReplicaSet: thế hệ cũ đang giảm, thế hệ mới đang tăng.',
      },
      {
        command: 'kubectl rollout history deployment/api -n nen-tang',
        explain: 'Liệt kê các revision đã đi qua, tức là đường lùi nếu bản mới hỏng.',
      },
      {
        command: 'kubectl get pods -n nen-tang -w',
        explain: 'Đếm pod đang chạy suốt quá trình để tự chứng minh dịch vụ không đứt.',
      },
    ],
    takeaways: [
      'Pod là bất biến: đổi image nghĩa là thay pod, và Deployment thay bằng cách dựng một thế hệ ReplicaSet mới.',
      'maxSurge và maxUnavailable quy định nhịp chuyển; maxUnavailable bằng 0 là cam kết không bao giờ thiếu bản chạy.',
      '`kubectl rollout status` là cách chờ đúng trong script, thay cho việc ngủ một khoảng rồi đoán.',
      'ReplicaSet cũ được giữ lại chứ không bị xoá, và đó là thứ cho phép quay về sau này.',
    ],
    proTips: [
      'Xoá Deployment rồi tạo lại cũng ra kết quả đúng, nhưng để lại một khoảng không ai phục vụ. Đường có sẵn đã tránh được khoảng đó.',
      'maxUnavailable 0 kèm maxSurge 0 là cấu hình bế tắc: không được thiếu, cũng không được thừa, nên rollout không nhúc nhích được.',
    ],
    pitfalls: [
      'Dùng tag `latest` cho tiện, vì như thế không phải sửa Deployment mỗi lần ra bản mới. Hệ quả là template không đổi nên Deployment không thấy có gì để rollout, và mỗi pod có thể đang chạy một bản khác nhau mà không ai biết.',
      'Thấy `rollout status` treo và bấm Ctrl-C rồi coi như xong. Lệnh treo chính là câu trả lời: rollout chưa hoàn tất, và level sau nói về đúng tình huống đó.',
    ],
  },
};
