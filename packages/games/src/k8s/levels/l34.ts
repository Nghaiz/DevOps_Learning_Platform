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
  mission: 'Làm cho drain `may-chu-2` chạy được, trong khi `api` vẫn giữ tối thiểu 3 bản chạy.',
  brief: `Bảo trì đêm nay: \`may-chu-2\` cần vá kernel. Quy trình chuẩn là **drain** node
trước khi tắt.

Lệnh drain chạy vài giây rồi treo: nó không đuổi được pod của \`api\` vì làm vậy sẽ
vi phạm một **PodDisruptionBudget**. Nó sẽ đứng đó thử lại mãi mãi.

Deployment \`api\` có 3 replica; PDB khai \`minAvailable: 3\`.`,
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
    '`kubectl describe pdb api -n nen-tang` cho `minAvailable`, và `kubectl get deploy api -n nen-tang` cho số replica đang sẵn sàng. Hiệu của hai con số là số pod được phép đuổi ngay lúc này; bằng 0 thì drain không nhúc nhích được, và đó không phải vì drain hỏng.',
    'Số pod được phép đuổi xấp xỉ số pod đang sẵn sàng trừ đi `minAvailable`. Hiện tại là 3 trừ 3. Có hai cách làm nó lớn hơn 0: hạ vế trừ, hoặc nâng vế bị trừ. Hai cách cho ra hai mức phục vụ khác nhau trong lúc bảo trì — hãy chọn cái giữ nguyên lời hứa.',
    'Hạ `minAvailable` xuống 2 sẽ cho drain chạy, nhưng lúc đó dịch vụ chỉ còn 2 bản trong suốt cửa sổ bảo trì. Nâng `replicas` lên 4 thì một pod đi được mà vẫn còn đủ 3 — đó mới là đáp án giữ được cả bảo trì lẫn mức phục vụ. Giữ nguyên `minAvailable: 3`.',
  ],
  parMoves: 1,
  teaches: [
    'PodDisruptionBudget',
    'minAvailable',
    'số pod được phép đuổi',
    'drain node',
    'gián đoạn tự nguyện và không tự nguyện',
    'headroom cho bảo trì',
  ],
  teaching: {
    primer: `**PodDisruptionBudget** là lời hứa về mức phục vụ tối thiểu khi có gián đoạn **tự
nguyện**.

- **Tự nguyện** — do người hoặc controller chủ động gây ra: drain, nâng cấp node,
  thu nhỏ cluster. PDB **chặn** được những thứ này.
- **Không tự nguyện** — node chết, kernel panic, mất điện, OOM. PDB **không** làm
  gì được.

Con số cần nhìn khi chẩn đoán là **số pod sẵn sàng trừ \`minAvailable\`**: số pod được phép đuổi
ngay lúc này. Bằng 0 nghĩa là mọi lệnh đuổi bị từ chối, và drain sẽ thử lại vô
hạn thay vì báo lỗi rồi thoát.

Chỗ dễ tự bắn vào chân: đặt \`minAvailable\` **bằng** số replica là khoá cứng
workload.`,
    cheatsheet: [
      { command: 'kubectl get pdb -n <ns>', explain: 'Xác nhận PDB nào đang áp trong namespace.' },
      {
        command: 'kubectl describe pdb <tên> -n <ns>',
        explain: 'Đọc minAvailable trong spec, vế bị trừ của phép tính.',
      },
      {
        command: 'spec.replicas',
        explain: 'Vế còn lại. Hiệu của replicas và minAvailable là chỗ trống để bảo trì diễn ra.',
      },
      {
        command: 'kubectl get deploy <tên> -n <ns>',
        explain: 'So số replica với minAvailable — hiệu của chúng là chỗ trống để bảo trì.',
      },
      {
        command: 'kubectl get pods -n <ns>',
        explain: 'Đếm pod thật sự đang sẵn sàng, con số để trừ đi minAvailable.',
      },
    ],
    takeaways: [
      'PDB chỉ chặn gián đoạn tự nguyện; node chết thì nó không bảo vệ được gì.',
      'Số pod được phép đuổi bằng 0 là lý do drain treo, và nó tính được trước khi thử.',
      'minAvailable bằng số replica là khoá cứng workload khỏi mọi bảo trì.',
      'Luôn để dư ít nhất một pod so với minAvailable, đó là chỗ trống cho bảo trì.',
    ],
    pitfalls: [
      'Hạ `minAvailable` cho drain chạy. Nó gỡ tắc ngay và trông như đúng chỗ cần sửa vì PDB chính là thứ đang chặn — nhưng bạn vừa hạ mức phục vụ cam kết để đổi lấy một lần bảo trì, và con số đã hạ sẽ không ai nâng lại.',
      'Xoá PDB đi cho nhanh. Drain chạy ngay lập tức và có thể đuổi cả 3 pod cùng lúc — đúng cái mà PDB được dựng lên để ngăn.',
      'Đặt `minAvailable: 100%`. Nó đọc như mức bảo vệ cao nhất, và thực tế là một khoá cứng vĩnh viễn.',
    ],
    proTips: [
      'Khai bằng một trong hai trường, không phải cả hai: `minAvailable` (luôn còn tối thiểu bấy nhiêu) hoặc `maxUnavailable` (được thiếu nhiều nhất bấy nhiêu). Cả hai nhận số tuyệt đối hoặc phần trăm.',
      'Quy tắc thực dụng: luôn để dư ít nhất một pod so với `minAvailable`. Đó là chỗ trống để bảo trì diễn ra, và nó rẻ hơn nhiều so với một node không bao giờ được vá.',
    ],
  },
};
