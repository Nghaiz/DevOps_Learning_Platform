import type { Level } from '../contract.ts';

/**
 * PDB, và điểm dạy là một nghịch lý: một ngân sách gián đoạn đặt QUÁ CHẶT sẽ làm
 * cluster kém an toàn hơn, vì bảo trì có kế hoạch bị chặn đứng và người vận hành
 * cuối cùng sẽ tắt node bằng tay.
 *
 * Mục tiêu ép replicas lên 4 chứ không cho hạ minAvailable: cả hai đều làm drain
 * chạy được, nhưng chỉ một cái giữ nguyên lời hứa về mức phục vụ. Chặn bằng dữ
 * liệu, không bằng lời dặn.
 */
export const l34: Level = {
  id: 'k8s-34-ngan-sach-gian-doan-qua-chat',
  chapter: 6,
  title: 'Bảo trì không bao giờ bắt đầu được',
  brief: `Đêm nay có cửa sổ bảo trì: \`may-chu-2\` cần được vá kernel và khởi động lại.
Quy trình chuẩn là **drain** node — đuổi hết pod sang node khác rồi mới tắt máy.

Lệnh drain chạy được vài giây rồi treo, in ra rằng nó không thể đuổi pod của
\`api\` vì làm vậy sẽ vi phạm một **PodDisruptionBudget**. Nó sẽ đứng đó thử lại
mãi mãi.

PDB là lời hứa với cluster: dù có gián đoạn **tự nguyện** nào xảy ra — drain,
nâng cấp node, thu nhỏ cluster — thì workload này vẫn phải còn tối thiểu bấy
nhiêu bản chạy. Mọi lệnh đuổi pod đều phải hỏi PDB trước.

Deployment \`api\` đang có 3 replica, và PDB \`api\` khai \`minAvailable: 3\`.

Đọc hai con số đó cạnh nhau. Nếu phải luôn còn 3 và chỉ có đúng 3, thì số pod
được phép đuổi tại một thời điểm là **không**. Lời hứa được giữ nguyên vẹn, và
cái giá là không bao giờ bảo trì được node nào nữa.

Nghịch lý ở chỗ: một PDB đặt quá chặt làm cluster **kém** an toàn hơn. Bảo trì có
kế hoạch bị chặn, bản vá bị hoãn, và sớm muộn ai đó sẽ tắt thẳng node bằng tay —
đúng cái kiểu gián đoạn mà PDB không bảo vệ được.

**Việc cần làm:** làm cho drain chạy được, trong khi \`api\` vẫn phải giữ được
lời hứa còn tối thiểu 3 bản chạy trong suốt quá trình.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['nen-tang'],
    resources: [
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.5.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '300m', memory: '512Mi' },
                  limits: { cpu: '800m', memory: '1Gi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'PodDisruptionBudget',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          minAvailable: 3,
          selector: { matchLabels: { app: 'api' } },
        },
        seededIncident: 'pdb-chan-drain',
      },
    ],
  },
  allowedResources: ['Deployment', 'PodDisruptionBudget'],
  objectives: [
    {
      id: 'du-bon-replica',
      label: 'Deployment `api` có đủ 4 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'api', namespace: 'nen-tang', replicas: 4 },
      required: true,
    },
    {
      id: 'pdb-van-hua-ba',
      label: 'PDB vẫn bảo đảm tối thiểu 3 bản chạy',
      check: 'pdb-satisfied',
      args: { name: 'api', namespace: 'nen-tang', minAvailable: 3 },
      required: true,
    },
    {
      id: 'drain-chay-duoc',
      label: 'Không còn sự cố chặn drain trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'nen-tang', kind: 'pdb-chan-drain' },
      required: true,
    },
    {
      id: 'bon-pod-dang-chay',
      label: 'Có ít nhất 4 pod `app=api` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'nen-tang', labelSelector: 'app=api', min: 4 },
      required: false,
    },
  ],
  hints: [
    '`kubectl get pdb -n nen-tang` in ra cột ALLOWED DISRUPTIONS. Con số đó là số pod được phép đuổi ngay lúc này, và nếu nó bằng 0 thì drain không thể nhúc nhích — không phải vì drain hỏng.',
    'ALLOWED DISRUPTIONS xấp xỉ số pod đang sẵn sàng trừ đi `minAvailable`. Hiện tại là 3 trừ 3. Có hai cách làm nó lớn hơn 0: hạ vế trừ, hoặc nâng vế bị trừ. Hai cách cho ra hai mức phục vụ khác nhau trong lúc bảo trì — hãy chọn cái giữ nguyên lời hứa.',
    'Hạ `minAvailable` xuống 2 sẽ cho drain chạy, nhưng lúc đó dịch vụ chỉ còn 2 bản trong suốt cửa sổ bảo trì. Nâng `replicas` lên 4 thì một pod đi được mà vẫn còn đủ 3 — đó mới là đáp án giữ được cả bảo trì lẫn mức phục vụ. Giữ nguyên `minAvailable: 3`.',
  ],
  parMoves: 1,
  teaches: [
    'PodDisruptionBudget',
    'minAvailable',
    'allowed disruptions',
    'kubectl drain',
    'gián đoạn tự nguyện và không tự nguyện',
    'headroom cho bảo trì',
  ],
  teaching: {
    primer: `**PodDisruptionBudget** là lời hứa về mức phục vụ tối thiểu khi có gián đoạn
**tự nguyện**. Phân biệt hai loại gián đoạn là nền của cả chủ đề:

- **Tự nguyện** — do người hoặc controller chủ động gây ra: \`kubectl drain\`,
  nâng cấp node, thu nhỏ cluster. PDB **chặn** được những thứ này.
- **Không tự nguyện** — node chết, kernel panic, mất điện, OOM. PDB **không**
  làm gì được; không có gì để hỏi ý kiến khi phần cứng biến mất.

Khai bằng một trong hai trường, không phải cả hai:

- \`minAvailable\` — luôn còn tối thiểu bấy nhiêu (số tuyệt đối hoặc phần trăm).
- \`maxUnavailable\` — được thiếu nhiều nhất bấy nhiêu.

Con số cần nhìn khi chẩn đoán là **ALLOWED DISRUPTIONS** trong \`kubectl get
pdb\`: số pod được phép đuổi ngay lúc này. Bằng 0 nghĩa là mọi lệnh đuổi sẽ bị từ
chối, và \`kubectl drain\` sẽ thử lại vô hạn thay vì báo lỗi rồi thoát.

Đây là chỗ dễ tự bắn vào chân: đặt \`minAvailable\` **bằng** số replica là khoá
cứng workload. Lời hứa được giữ tuyệt đối, và không bản vá nào lên được node nữa.

Quy tắc thực dụng: luôn để dư ít nhất một pod so với \`minAvailable\`. Đó là chỗ
trống để bảo trì diễn ra, và nó rẻ hơn nhiều so với một node không bao giờ được
vá.`,
    cheatsheet: [
      { command: 'kubectl get pdb -n <ns>', explain: 'Cột ALLOWED DISRUPTIONS — bằng 0 nghĩa là không đuổi được pod nào.' },
      { command: 'kubectl describe pdb <tên> -n <ns>', explain: 'Xem minAvailable, số pod đang khớp selector và số đang sẵn sàng.' },
      { command: 'kubectl drain <node> --ignore-daemonsets', explain: 'Đuổi pod khỏi node trước khi bảo trì; treo nếu PDB không cho phép.' },
      { command: 'kubectl get deploy <tên> -n <ns>', explain: 'So số replica với minAvailable — hiệu của chúng là chỗ trống để bảo trì.' },
      { command: 'kubectl uncordon <node>', explain: 'Cho node nhận pod trở lại sau khi bảo trì xong.' },
    ],
    takeaways: [
      'PDB chỉ chặn gián đoạn tự nguyện; node chết thì nó không bảo vệ được gì.',
      'ALLOWED DISRUPTIONS bằng 0 là lý do drain treo, và nó là một con số đọc được trước khi thử.',
      'minAvailable bằng số replica là khoá cứng workload khỏi mọi bảo trì.',
      'Luôn để dư ít nhất một pod so với minAvailable, đó là chỗ trống cho bảo trì.',
    ],
    pitfalls: [
      'Hạ `minAvailable` cho drain chạy. Nó gỡ tắc ngay và trông như đúng chỗ cần sửa vì PDB chính là thứ đang chặn — nhưng bạn vừa hạ mức phục vụ cam kết để đổi lấy một lần bảo trì, và con số đã hạ sẽ không ai nâng lại.',
      'Xoá PDB đi cho nhanh. Drain chạy ngay lập tức và có thể đuổi cả 3 pod cùng lúc — đúng cái mà PDB được dựng lên để ngăn.',
      'Đặt `minAvailable: 100%`. Nó đọc như mức bảo vệ cao nhất, và thực tế là một khoá cứng vĩnh viễn.',
    ],
  },
};
