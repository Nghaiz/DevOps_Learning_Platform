import type { Level } from '../contract.ts';

/**
 * `nodeSelector` sai — và cái bẫy là scheduler KHÔNG coi đó là lỗi. Không có
 * node nào khớp thì pod chỉ đơn giản nằm Pending mãi, y hệt lúc hết tài nguyên
 * ở l23. Cùng một trạng thái, hai nguyên nhân, và chỉ Events của pod tách được.
 *
 * Nửa sau (`pod-not-on-node`) là mặt còn lại của cùng cơ chế: nodeSelector cũng
 * là cách GIỮ một workload RA KHỎI một node, chứ không chỉ để hút vào. Không có
 * vế đó thì người chơi học một chiều.
 */
export const l26: Level = {
  id: 'k8s-26-nodeselector-khong-khop-label',
  chapter: 5,
  title: 'Pending mãi, nhưng lần này không phải vì hết chỗ',
  mission: 'Cho `chi-muc` chạy đủ 3 replica, và đưa `sao-luu` ra khỏi mọi node SSD.',
  brief: `Cluster có ba node: hai node đĩa SSD, một node đĩa cơ.

- Deployment \`chi-muc\` khai \`nodeSelector: disk=ssd\` và không pod nào lên được,
  tất cả nằm \`Pending\`.
- Pod \`sao-luu\` ghi hàng trăm GB mỗi đêm, đang chiếm một node SSD.

Điều sai ở đây là một chuỗi, và bạn không đoán ra nó.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      {
        name: 'may-chu-ssd-1',
        cpu: 4000,
        memory: 8192,
        ready: true,
        labels: { 'luu-tru': 'ssd', vung: 'hn-1' },
      },
      {
        name: 'may-chu-ssd-2',
        cpu: 4000,
        memory: 8192,
        ready: true,
        labels: { 'luu-tru': 'ssd', vung: 'hn-1' },
      },
      {
        name: 'may-chu-dia-co',
        cpu: 4000,
        memory: 8192,
        ready: true,
        labels: { 'luu-tru': 'hdd', vung: 'hn-2' },
      },
    ],
    namespaces: ['tim-kiem', 'van-hanh'],
    resources: [
      {
        kind: 'Deployment',
        name: 'chi-muc',
        namespace: 'tim-kiem',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'chi-muc' } },
          template: {
            labels: { app: 'chi-muc' },
            nodeSelector: { disk: 'ssd' },
            containers: [
              {
                name: 'chi-muc',
                image: 'ghcr.io/dlp/chi-muc:5.1.0',
                ports: [{ containerPort: 9200 }],
                resources: {
                  requests: { cpu: '300m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '1Gi' },
                },
              },
            ],
          },
        },
        seededIncident: 'nodeselector-khong-khop',
      },
      {
        kind: 'Pod',
        name: 'sao-luu',
        namespace: 'van-hanh',
        spec: {
          labels: { app: 'sao-luu' },
          nodeName: 'may-chu-ssd-2',
          containers: [
            {
              name: 'sao-luu',
              image: 'ghcr.io/dlp/sao-luu:1.4.0',
              resources: {
                requests: { cpu: '200m', memory: '256Mi' },
                limits: { cpu: '500m', memory: '512Mi' },
              },
            },
          ],
        },
      },
    ],
  },
  allowedResources: ['Deployment', 'Pod', 'Node'],
  objectives: [
    {
      id: 'chi-muc-du-replica',
      label: 'Deployment `chi-muc` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'chi-muc', namespace: 'tim-kiem', replicas: 3 },
      required: true,
    },
    {
      id: 'sao-luu-roi-khoi-ssd-2',
      label: 'Pod `sao-luu` không còn nằm trên `may-chu-ssd-2`',
      check: 'pod-not-on-node',
      args: { namespace: 'van-hanh', name: 'sao-luu', nodeName: 'may-chu-ssd-2' },
      required: true,
    },
    {
      id: 'sao-luu-khong-o-ssd-1',
      label: 'Pod `sao-luu` cũng không nằm trên `may-chu-ssd-1`',
      check: 'pod-not-on-node',
      args: { namespace: 'van-hanh', name: 'sao-luu', nodeName: 'may-chu-ssd-1' },
      required: true,
    },
    {
      id: 'sao-luu-o-dia-co',
      label: 'Pod `sao-luu` nằm trên `may-chu-dia-co`',
      check: 'pod-on-node',
      args: { namespace: 'van-hanh', name: 'sao-luu', nodeName: 'may-chu-dia-co' },
      required: true,
    },
  ],
  hints: [
    'Pending có nhiều nguyên nhân và chúng nhìn giống nhau. `kubectl describe pod -n tim-kiem -l app=chi-muc` ghi lý do scheduler loại từng node — "insufficient cpu" và "node(s) didn\'t match node selector" là hai câu hoàn toàn khác nhau.',
    '`kubectl describe node` cho bạn label thật của cả ba node. So với `nodeSelector` khai trong template của `chi-muc`: tên khoá phải khớp từng ký tự, và ở đây khoá đang dùng không tồn tại trên node nào.',
    'Node dùng khoá `luu-tru`, không phải `disk`. Sửa `nodeSelector` của `chi-muc` thành `luu-tru: ssd`. Với `sao-luu`: pod đang bị ghim cứng bằng `nodeName`, nên phải xoá và tạo lại với `nodeSelector: luu-tru=hdd` — đó là cách khai "hãy đặt tôi vào nhóm node này" thay vì chỉ tên một máy.',
  ],
  parMoves: 3,
  teaches: [
    'nodeSelector',
    'node label',
    'Pending có nhiều nguyên nhân',
    'scheduler events',
    'nodeName ghim cứng',
    'giữ workload ra khỏi một nhóm node',
  ],
  teaching: {
    primer: `\`nodeSelector\` là bộ lọc cứng: scheduler chỉ xét node mang **đủ** các cặp label
bạn liệt kê. Không có so khớp gần đúng — sai một ký tự trong tên khoá là không
node nào khớp.

Và scheduler **không coi đó là lỗi**. Nó chỉ không tìm thấy ứng viên nào, nên pod
nằm \`Pending\` vô thời hạn, trông hệt lúc hết CPU. Chỉ Events của pod tách được:

- \`Insufficient cpu\` — có node phù hợp nhưng không đủ chỗ.
- \`node(s) didn't match Pod's node affinity/selector\` — không node nào đủ điều
  kiện ngay từ đầu.

Cơ chế này dùng được cả hai chiều: kéo workload về một nhóm node, và giữ nó ra
khỏi nhóm khác.`,
    cheatsheet: [
      { command: 'kubectl describe node', explain: 'Dòng Labels cho label thật của từng node; so từng ký tự với nodeSelector đang khai.' },
      { command: 'kubectl describe pod <pod> -n <ns>', explain: 'Events phân biệt "thiếu tài nguyên" với "không khớp selector" — hai câu khác nhau.' },
      { command: 'spec.nodeSelector', explain: 'Trường cần sửa trong template: khai đúng cặp label mà node thật sự mang.' },
      { command: 'kubectl get pods -n <ns>', explain: 'Cột NODE xác nhận pod đã chuyển đúng chỗ sau khi sửa.' },
    ],
    takeaways: [
      'nodeSelector khớp label chính xác; không node nào khớp thì pod Pending mãi mà không báo lỗi.',
      'Events của pod phân biệt "hết tài nguyên" với "không khớp selector" — hai nguyên nhân trông giống nhau.',
      'Cùng một cơ chế dùng được để kéo workload vào và để giữ nó tránh xa một nhóm node.',
      'nodeName bỏ qua scheduler và ghim pod vào một máy duy nhất; hầu như luôn nên tránh.',
    ],
    pitfalls: [
      'Thấy Pending là nghĩ ngay tới thiếu tài nguyên. Đó là nguyên nhân thường gặp nhất nên nó được đoán trước, và người ta đi nâng node trong khi lỗi chỉ là một tên khoá gõ sai.',
      'Sửa nodeSelector trên một pod đang chạy. Trường này bất biến — pod phải được xoá và tạo lại.',
    ],
    proTips: [
      'Đừng nhầm `nodeSelector` với `nodeName`. `nodeName` ghim cứng vào đúng một máy và bỏ qua scheduler hoàn toàn, nên máy đó chết thì pod không đi đâu được. Cần nhiều hơn khớp chính xác, chẳng hạn ưu tiên nhưng không bắt buộc, thì dùng node affinity.',
    ],
  },
};
