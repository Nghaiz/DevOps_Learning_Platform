import type { Level } from '../contract.ts';

/**
 * Đóng chương 5 bằng bài toán có LỜI GIẢI BỊ KẸP GIỮA HAI PHÍA: ResourceQuota ép
 * trần từ trên, LimitRange ép sàn từ dưới. Đây là level duy nhất trong game mà
 * người chơi phải tính ra một con số thay vì tra ra nó.
 *
 * `allowedResources` cố ý CHỈ có Deployment. Cho phép sửa ResourceQuota sẽ mở
 * một đường tắt — nâng trần lên là xong — và đường tắt đó chính là cách sai phổ
 * biến nhất ngoài đời. Chặn nó bằng quyền, không bằng lời khuyên.
 *
 * ResourceQuota để 1600Mi chứ không phải 1536Mi (đúng bằng 6 × 256Mi) là có chủ
 * ý: lời giải nằm THẤP HƠN trần chứ không CHẠM trần, nên không phụ thuộc vào
 * việc vị từ so `<` hay `<=`.
 */
export const l27: Level = {
  id: 'k8s-27-bi-kep-giua-quota-va-limitrange',
  chapter: 5,
  title: 'Trần từ trên, sàn từ dưới',
  brief: `Namespace \`xu-ly\` được cấp cho một đội nhỏ, và nó có hai hàng rào do quản trị
viên cluster đặt:

- **ResourceQuota** \`hạn-mức\` — trần cho **cả namespace cộng lại**. Không phải
  giới hạn của một pod: nó cộng \`requests\` của mọi pod trong namespace và từ
  chối cái nào làm tổng vượt trần.
- **LimitRange** \`khung-tai-nguyen\` — sàn và trần cho **từng container**. Nó
  cũng từ chối, nhưng theo chiều ngược lại: một container xin quá ít cũng không
  được nhận.

Deployment \`xu-ly-video\` khai 6 replica và không pod nào được tạo ra. Chú ý dấu
hiệu này, nó khác mọi level trước: pod **không hề xuất hiện ở trạng thái
Pending**. Pending nghĩa là pod đã được API server chấp nhận và đang chờ
scheduler. Ở đây API server từ chối ngay từ đầu, nên không có pod nào để mà chờ —
lỗi nằm trong Events của ReplicaSet, không nằm ở pod.

**Việc cần làm:** đưa \`xu-ly-video\` lên đủ 6 replica sẵn sàng, giữ namespace
trong hạn mức, và vẫn khai đầy đủ requests lẫn limits cho container.

Bạn không có quyền sửa hai hàng rào đó — và đó là điểm chính. Nâng trần lên cho
vừa với thứ mình đang xin là phản xạ đầu tiên của hầu hết mọi người, cũng là lý
do quota tồn tại. Việc của bạn là tìm con số vừa dưới trần vừa trên sàn.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['xu-ly'],
    resources: [
      {
        kind: 'ResourceQuota',
        name: 'han-muc',
        namespace: 'xu-ly',
        spec: {
          hard: {
            'requests.memory': '1600Mi',
            'requests.cpu': '3',
            pods: '10',
          },
        },
      },
      {
        kind: 'LimitRange',
        name: 'khung-tai-nguyen',
        namespace: 'xu-ly',
        spec: {
          limits: [
            {
              type: 'Container',
              min: { memory: '128Mi', cpu: '50m' },
              max: { memory: '512Mi', cpu: '1' },
            },
          ],
        },
      },
      {
        kind: 'Deployment',
        name: 'xu-ly-video',
        namespace: 'xu-ly',
        spec: {
          replicas: 6,
          selector: { matchLabels: { app: 'xu-ly-video' } },
          template: {
            labels: { app: 'xu-ly-video' },
            containers: [
              {
                name: 'xu-ly-video',
                image: 'ghcr.io/dlp/xu-ly-video:3.2.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '400m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'replica-vuot-quota',
      },
    ],
  },
  allowedResources: ['Deployment'],
  objectives: [
    {
      id: 'sau-replica-san-sang',
      label: 'Deployment `xu-ly-video` có đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'xu-ly-video', namespace: 'xu-ly', replicas: 6 },
      required: true,
    },
    {
      id: 'trong-han-muc',
      label: 'Namespace `xu-ly` không vượt ResourceQuota',
      check: 'quota-within-limit',
      args: { namespace: 'xu-ly' },
      required: true,
    },
    {
      id: 'van-khai-du',
      label: 'Container vẫn khai đầy đủ cả requests lẫn limits',
      check: 'resource-limits-set',
      args: { kind: 'Deployment', name: 'xu-ly-video', namespace: 'xu-ly' },
      required: true,
    },
    {
      id: 'het-su-co-quota',
      label: 'Không còn sự cố hạn mức nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'xu-ly', kind: 'replica-vuot-quota' },
      required: false,
    },
  ],
  hints: [
    'Không có pod để `describe` — đó chính là manh mối. Khi API server từ chối, dấu vết nằm ở tầng trên: `kubectl describe rs -n xu-ly` (Events của ReplicaSet) và `kubectl get events -n xu-ly`.',
    '`kubectl describe resourcequota han-muc -n xu-ly` in bảng Used / Hard — dùng bao nhiêu trên trần bao nhiêu. `kubectl describe limitrange khung-tai-nguyen -n xu-ly` cho sàn và trần của MỘT container. Viết ra phép tính: 6 replica nhân với requests hiện tại bằng bao nhiêu, so với trần.',
    '6 × 512Mi = 3072Mi, gần gấp đôi trần 1600Mi. Chia ngược lại: mỗi pod được nhiều nhất 266Mi, và LimitRange không cho xuống dưới 128Mi — vậy `requests.memory` nằm trong khoảng 128Mi tới 266Mi, chọn 256Mi là gọn nhất. Giữ `limits.memory` ở 512Mi (đúng bằng trần LimitRange cho phép) vì quota này chỉ tính requests.',
  ],
  parMoves: 1,
  teaches: [
    'ResourceQuota',
    'LimitRange',
    'ResourceQuotaExceeded',
    'API server từ chối khác scheduler từ chối',
    'không có pod thì không có Pending',
    'events của ReplicaSet',
    'quota tính requests chứ không tính mức dùng thật',
  ],
  teaching: {
    primer: `Hai object kiểm soát tài nguyên ở hai phạm vi khác nhau, và chúng chặn ở hai
chiều ngược nhau.

**ResourceQuota** — trần cho **cả namespace cộng lại**. Nó cộng \`requests\` (và
\`limits\`, nếu quota có khai) của mọi pod trong namespace, rồi từ chối object nào
làm tổng vượt trần. Nó cũng đếm được số lượng object: \`pods\`, \`services\`,
\`persistentvolumeclaims\`.

**LimitRange** — sàn và trần cho **từng container**. Nó từ chối container xin quá
nhiều, và cũng từ chối container xin quá ít. Nó còn có thể **gán mặc định** cho
container không khai gì.

Điểm quan trọng nhất và hay bị bỏ qua: cả hai chặn ở **API server**, không phải ở
scheduler. Nghĩa là pod **không hề được tạo ra**. Không có pod thì không có
\`Pending\`, không có gì để \`describe\`, và mọi phản xạ chẩn đoán ở tầng pod đều
vô dụng. Dấu vết nằm ở object cha — Events của ReplicaSet — và ở
\`kubectl get events\`.

Một hệ quả nữa: nếu quota khai \`limits.memory\` thì **mọi** container trong
namespace bắt buộc phải đặt limit, nếu không sẽ bị từ chối thẳng.

Khi cả hai cùng có hiệu lực, lời giải bị kẹp: đủ lớn để qua sàn LimitRange, đủ
nhỏ để tổng vẫn dưới trần quota.`,
    cheatsheet: [
      { command: 'kubectl describe resourcequota <tên> -n <ns>', explain: 'Bảng Used / Hard — dùng bao nhiêu trên trần bao nhiêu, theo từng loại tài nguyên.' },
      { command: 'kubectl describe limitrange <tên> -n <ns>', explain: 'Sàn, trần và giá trị mặc định áp cho MỘT container.' },
      { command: 'kubectl describe rs -n <ns>', explain: 'Khi không có pod nào, Events của ReplicaSet là nơi ghi lý do bị từ chối.' },
      { command: 'kubectl get events -n <ns> --sort-by=.lastTimestamp', explain: 'Sự kiện toàn namespace theo thời gian; thấy được cả thứ chưa kịp thành pod.' },
    ],
    takeaways: [
      'ResourceQuota giới hạn tổng của cả namespace; LimitRange giới hạn từng container.',
      'Cả hai chặn ở API server, nên pod không hề được tạo và không có gì ở trạng thái Pending.',
      'Không có pod thì đọc Events của ReplicaSet, không phải của pod.',
      'Khi cả hai cùng áp, lời giải là một khoảng: trên sàn LimitRange và dưới trần quota.',
    ],
    pitfalls: [
      'Đi tìm pod để `describe`. Phản xạ này đúng ở mọi level trước nên nó được dùng trước tiên, nhưng ở đây không có pod nào tồn tại để mà đọc.',
      'Nâng trần quota cho vừa với thứ mình đang xin. Nó giải quyết triệu chứng trong một lệnh, và đó chính là điều quota được đặt ra để ngăn — hạn mức là thoả thuận với cả cluster, không phải một tuỳ chọn của workload.',
    ],
  },
};
