import type { Level } from '../contract.ts';

/**
 * Nửa sau của cặp dễ nhầm: endpoint ĐỦ mà request vẫn chết.
 *
 * Đặt ngay sau l13 là cố ý. Người chơi vừa học một phản xạ ("rỗng thì lỗi
 * selector") và level này lập tức cho thấy phản xạ đó chưa đủ: cùng một triệu
 * chứng bề mặt, endpoint đầy đủ, nguyên nhân nằm ở cổng. Một công cụ không bao
 * giờ đủ để chẩn đoán mạng — đó mới là bài học, không phải cú pháp `targetPort`.
 */
export const l14: Level = {
  id: 'k8s-14-endpoint-du-ma-van-loi',
  chapter: 3,
  title: 'Lần này endpoint đầy đủ, và vẫn hỏng',
  brief: `Cũng triệu chứng như hôm qua: request tới Service \`kho-hang\` trong namespace
\`kho\` đều thất bại. Bạn đã có phản xạ rồi, nên chạy \`kubectl get endpoints\`
đầu tiên.

Lần này nó liệt kê đủ 3 địa chỉ.

Nghĩa là selector đúng, pod Ready, danh sách nối đầy đủ. Vậy mà kết nối vẫn không
đi tới đâu — nó không timeout kiểu "không ai nghe", nó bị **từ chối** ngay lập
tức.

Một endpoint gồm hai phần: địa chỉ IP của pod, và **cổng**. Danh sách endpoint có
đủ ba dòng chỉ chứng minh Service tìm đúng pod — không chứng minh nó đang gõ
đúng cửa. Service chuyển request tới cổng ghi ở \`targetPort\`; nếu bên trong
container không có tiến trình nào nghe cổng đó, kernel trả lời "cổng đóng" và
người dùng nhận lỗi ngay.

**Việc cần làm:** làm Service \`kho-hang\` chuyển request tới đúng cổng mà
container đang nghe, và giữ nguyên 3 endpoint hiện có.

Cổng thật của container nằm trong template của Deployment. Đọc nó, đừng suy từ
cổng của Service.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['kho'],
    resources: [
      {
        kind: 'Deployment',
        name: 'kho-hang',
        namespace: 'kho',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'kho-hang' } },
          template: {
            labels: { app: 'kho-hang' },
            containers: [
              {
                name: 'kho-hang',
                image: 'ghcr.io/dlp/kho-hang:2.2.0',
                ports: [{ containerPort: 9090 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'kho-hang',
        namespace: 'kho',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'kho-hang' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
        seededIncident: 'service-sai-targetport',
      },
    ],
  },
  allowedResources: ['Service'],
  objectives: [
    {
      id: 'het-su-co-cong',
      label: 'Service `kho-hang` chuyển request tới đúng cổng container đang nghe',
      check: 'no-incident-active',
      args: { namespace: 'kho', kind: 'service-sai-targetport' },
      required: true,
    },
    {
      id: 'giu-ba-endpoint',
      label: 'Service `kho-hang` vẫn giữ đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'kho-hang', namespace: 'kho', min: 3 },
      required: true,
    },
    {
      id: 'khong-dung-workload',
      label: 'Deployment `kho-hang` vẫn đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'kho-hang', namespace: 'kho', replicas: 3 },
      required: true,
    },
  ],
  hints: [
    'Endpoint đầy đủ đã loại trừ selector và tình trạng pod. Còn lại đúng một thứ nằm giữa Service và container mà bạn có thể cấu hình sai: cổng.',
    'Service có hai cổng và chúng KHÔNG phải một: `port` là cổng người khác gọi vào Service, `targetPort` là cổng Service gõ vào container. Đối chiếu `targetPort` trong `kubectl describe svc kho-hang -n kho` với `containerPort` trong `kubectl get deploy kho-hang -n kho -o yaml`.',
    'Container nghe cổng 9090 nhưng Service đang chuyển tới 8080. Sửa `targetPort` của Service thành 9090. Giữ nguyên `port: 80` — người gọi không cần biết cổng bên trong đổi.',
  ],
  parMoves: 1,
  teaches: [
    'targetPort',
    'containerPort',
    'connection refused',
    'endpoint address and port',
    'chẩn đoán phân biệt',
  ],
  teaching: {
    primer: `Một endpoint không phải chỉ là một địa chỉ IP. Nó là cặp **IP và cổng**. Danh
sách endpoints đầy đủ chứng minh Service tìm **đúng pod**; nó không chứng minh
Service đang gõ **đúng cửa**.

Ba con số dễ bị gộp làm một, và chúng ở ba tầng khác nhau:

- \`port\` của Service: cổng mà người khác gọi vào Service.
- \`targetPort\` của Service: cổng mà Service chuyển request tới, bên trong pod.
- \`containerPort\` của container: khai báo mang tính tài liệu về cổng ứng dụng
  nghe. Nó **không** mở cổng nào cả; thứ mở cổng là chính tiến trình trong
  container.

Nếu \`targetPort\` trỏ tới một cổng không có ai nghe, kernel trong pod trả lời
ngay: **connection refused**. Đây là chi tiết chẩn đoán đáng nhớ nhất của level.
*Refused* nghĩa là gói tin **đã tới nơi** và bị từ chối, nên định tuyến và mạng
đều ổn. *Timeout* thì ngược lại: không ai trả lời, nên nghi ngờ hướng khác.

Đọc cổng thật từ template của Deployment, đừng suy từ cổng của Service. Hai số
đó trùng nhau ở level 12 là tình cờ, không phải quy tắc.

Nhìn vào đâu: \`targetPort\` trong \`describe svc\` đặt cạnh \`containerPort\`
trong template của Deployment.`,
    cheatsheet: [
      {
        command: 'kubectl get endpoints kho-hang -n kho',
        explain: 'Cột ENDPOINTS in cả IP lẫn cổng. Cổng ở đó chính là targetPort đang được dùng.',
      },
      {
        command: 'kubectl describe svc kho-hang -n kho',
        explain: 'Đọc riêng hai dòng Port và TargetPort. Chúng là hai thứ khác nhau.',
      },
      {
        command: 'kubectl get deploy kho-hang -n kho -o yaml',
        explain: 'Tìm containerPort trong template để biết ứng dụng thật sự nghe ở đâu.',
      },
      {
        command: 'kubectl exec -n kho <ten-pod> -- wget -qO- localhost:9090',
        explain: 'Gọi thẳng từ trong pod, bỏ qua Service. Có trả lời là ứng dụng khoẻ và lỗi nằm ở Service.',
      },
    ],
    takeaways: [
      'Endpoint là cặp IP và cổng: danh sách đầy đủ chỉ chứng minh đúng pod, chưa chứng minh đúng cổng.',
      'port là cửa ngoài của Service, targetPort là cửa trong của pod, và containerPort chỉ là tài liệu.',
      'Connection refused nghĩa là gói tin đã tới nơi và bị từ chối, khác hẳn timeout về mặt chẩn đoán.',
      'Một công cụ không bao giờ đủ để chẩn đoán mạng, kể cả công cụ vừa cứu bạn ở level trước.',
    ],
    proTips: [
      'Đặt tên cho cổng trong container (`name: http`) rồi cho targetPort trỏ theo tên. Đổi số cổng sau này thì Service không phải sửa.',
      'Đổi cổng bên trong không ảnh hưởng người gọi, miễn là `port` giữ nguyên. Đó chính là lớp gián tiếp mà Service mang lại.',
    ],
    pitfalls: [
      'Đặt targetPort bằng port cho dễ nhớ. Nó đúng ở dịch vụ đầu tiên nên trở thành thói quen, rồi hỏng lặng lẽ ở dịch vụ đầu tiên nghe một cổng khác.',
      'Thấy endpoints đầy đủ rồi loại Service khỏi danh sách nghi ngờ. Đó chính là phản xạ level trước vừa dựng lên, và ở đây nó dẫn bạn đi sai đường.',
    ],
  },
};
