import type { Level } from '../contract.ts';

/**
 * Mảnh thứ ba của bộ ba "container cứ restart mãi" (l03 entrypoint sai, l24
 * OOMKilled, đây liveness probe). Cả ba giống hệt nhau ở `kubectl get pods`, và
 * đây là mảnh khó chịu nhất vì ứng dụng hoàn toàn đúng — chính cấu hình giám
 * sát sức khoẻ đang giết nó.
 *
 * Vòng lặp tự duy trì là điểm dạy: probe giết app trước khi app kịp khởi động
 * xong, nên nó không bao giờ khởi động xong, nên probe lại giết. Không có gì
 * trong log nói ra điều đó — chỉ Events mới nói.
 */
export const l29: Level = {
  id: 'k8s-29-probe-giet-app-khoi-dong-cham',
  chapter: 6,
  title: 'Cái đồng hồ báo tử tự mình bấm',
  brief: `Deployment \`kho-du-lieu\` trong namespace \`phan-tich\` restart liên tục. Bạn đã
có hai công cụ cho tình huống này từ chương trước, và cả hai đều không cho câu
trả lời:

- \`kubectl logs --previous\` — log sạch, không exception, đứt ngang giữa chừng.
- \`describe\` phần Last State — exit code **137**, giống hệt OOMKilled.

Nhưng \`kubectl top pods\` cho thấy bộ nhớ dùng chưa tới một phần tư limit. Không
phải OOM.

137 chỉ nói tiến trình nhận SIGKILL. Nó **không** nói ai gửi. Với container trong
Kubernetes có hai kẻ gửi được: OOM killer của kernel, và **kubelet** khi liveness
probe thất bại đủ số lần.

Ứng dụng này nạp một chỉ mục lớn lúc khởi động và cần khoảng 40 giây mới trả lời
được request đầu tiên. Đọc cấu hình probe của nó và tự hỏi: sau bao lâu thì
kubelet kết luận nó đã treo?

Nếu kubelet kết luận sớm hơn thời gian app cần, vòng lặp tự khép: probe giết app
trước khi app kịp sống, nên app không bao giờ kịp sống, nên probe lại giết. Nó sẽ
chạy như thế mãi mãi mà không có gì trong log nói ra.

**Việc cần làm:** đưa \`kho-du-lieu\` về 3 replica chạy ổn định, không pod nào
còn mang lý do lỗi, và **vẫn giữ liveness probe**.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['phan-tich'],
    resources: [
      {
        kind: 'Deployment',
        name: 'kho-du-lieu',
        namespace: 'phan-tich',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'kho-du-lieu' } },
          template: {
            labels: { app: 'kho-du-lieu' },
            containers: [
              {
                name: 'kho-du-lieu',
                image: 'ghcr.io/dlp/kho-du-lieu:6.0.0',
                ports: [{ containerPort: 8080 }],
                thoiGianKhoiDongGiay: 40,
                livenessProbe: {
                  httpGet: { path: '/healthz', port: 8080 },
                  initialDelaySeconds: 0,
                  periodSeconds: 5,
                  timeoutSeconds: 1,
                  failureThreshold: 1,
                },
                resources: {
                  requests: { cpu: '500m', memory: '1Gi' },
                  limits: { cpu: '1000m', memory: '2Gi' },
                },
              },
            ],
          },
        },
        seededIncident: 'probe-khong-co-initialdelay',
      },
    ],
  },
  allowedResources: ['Deployment'],
  objectives: [
    {
      id: 'ba-replica-on-dinh',
      label: 'Deployment `kho-du-lieu` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'kho-du-lieu', namespace: 'phan-tich', replicas: 3 },
      required: true,
    },
    {
      id: 'khong-con-bi-giet',
      label: 'Không pod `app=kho-du-lieu` nào còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'phan-tich', labelSelector: 'app=kho-du-lieu' },
      required: true,
    },
    {
      id: 'van-con-liveness',
      label: 'Deployment vẫn khai liveness probe',
      check: 'probe-configured',
      args: { kind: 'Deployment', name: 'kho-du-lieu', namespace: 'phan-tich', probe: 'liveness' },
      required: true,
    },
  ],
  hints: [
    'Exit code 137 nói tiến trình bị SIGKILL, không nói ai gửi. Loại trừ OOM trước: so `kubectl top pods -n phan-tich` với `limits.memory`. Nếu bộ nhớ thoải mái thì kẻ giết là kubelet, không phải kernel.',
    '`kubectl describe pod -n phan-tich -l app=kho-du-lieu` ghi rõ `Liveness probe failed` trong Events, kèm số lần. Đọc bốn con số của probe: `initialDelaySeconds`, `periodSeconds`, `timeoutSeconds`, `failureThreshold` — chúng cộng lại thành hạn chót mà app phải kịp.',
    'App cần 40 giây để nạp chỉ mục, nhưng probe bắt đầu ngay từ giây 0 và chỉ cần một lần fail là giết. Có hai cách sửa đúng: đặt `initialDelaySeconds` lớn hơn 40 (và nới `failureThreshold`), hoặc thêm một `startupProbe` — cách thứ hai tốt hơn vì nó cho phép chờ lâu lúc khởi động mà vẫn phát hiện treo nhanh khi đã chạy.',
  ],
  parMoves: 1,
  teaches: [
    'liveness probe',
    'startupProbe',
    'initialDelaySeconds',
    'failureThreshold',
    'exit 137 có hai thủ phạm',
    'vòng lặp probe tự duy trì',
    'LivenessProbeFailure',
  ],
  teaching: {
    primer: `Liveness probe trả lời câu hỏi "container này còn làm việc được không?".
Fail đủ số lần thì kubelet **giết và dựng lại** — đó là cách Kubernetes tự phục
hồi khỏi tiến trình treo, deadlock, hay rò rỉ tài nguyên.

Bốn con số quyết định hạn chót:

- \`initialDelaySeconds\` — chờ bao lâu sau khi container khởi động rồi mới bắt
  đầu hỏi. Mặc định **0**.
- \`periodSeconds\` — hỏi lại mỗi bao nhiêu giây. Mặc định 10.
- \`timeoutSeconds\` — chờ trả lời bao lâu thì tính là fail. Mặc định 1.
- \`failureThreshold\` — fail liên tiếp mấy lần thì giết. Mặc định 3.

Hạn chót thực tế xấp xỉ \`initialDelay + period × (failureThreshold − 1)\`. Ứng
dụng khởi động chậm hơn con số đó sẽ bị giết trước khi kịp sống, và vì lần nào
cũng vậy nên nó **không bao giờ** khởi động xong. Vòng lặp tự duy trì.

Cách xử lý đúng cho ứng dụng khởi động chậm là **startupProbe**. Trong lúc nó
chưa báo xong, liveness và readiness bị tạm hoãn hoàn toàn. Nhờ vậy bạn được cả
hai thứ vốn mâu thuẫn: kiên nhẫn rất lâu lúc khởi động, và phát hiện treo rất
nhanh sau đó. Nới \`initialDelaySeconds\` cũng chạy, nhưng nó làm mọi lần treo
sau này đều bị phát hiện chậm đúng bằng chừng ấy.`,
    cheatsheet: [
      { command: 'kubectl describe pod <pod> -n <ns>', explain: 'Events ghi "Liveness probe failed" kèm số lần — bằng chứng tách nó khỏi OOM.' },
      { command: 'kubectl top pods -n <ns>', explain: 'Loại trừ OOM: bộ nhớ còn xa limit thì thủ phạm không phải kernel.' },
      { command: 'kubectl logs <pod> -n <ns> --previous', explain: 'Log sạch, đứt ngang — giống OOM, nên một mình nó không kết luận được gì.' },
      { command: 'kubectl get deploy <tên> -n <ns> -o yaml', explain: 'Đọc bốn con số của probe và cộng ra hạn chót thật.' },
    ],
    takeaways: [
      'Exit 137 chỉ nói SIGKILL; kernel (OOM) và kubelet (liveness) đều gửi được tín hiệu đó.',
      'Hạn chót của liveness xấp xỉ initialDelay cộng period nhân số lần cho phép fail.',
      'App khởi động chậm hơn hạn chót sẽ kẹt trong vòng lặp giết-dựng lại vĩnh viễn.',
      'startupProbe là câu trả lời đúng: kiên nhẫn lúc khởi động, vẫn nhạy khi đã chạy.',
    ],
    pitfalls: [
      'Xoá liveness probe. Pod ổn định ngay lập tức nên nó trông như đúng cách sửa, nhưng bạn vừa bỏ cơ chế duy nhất phát hiện tiến trình treo — lần sau app deadlock, nó sẽ đứng đó mãi ở trạng thái Running và không ai biết.',
      'Nâng `initialDelaySeconds` lên rất cao cho chắc. Nó chạy được, nhưng mọi lần treo về sau đều bị phát hiện muộn đúng bằng con số đó.',
      'Kết luận OOM vì thấy 137. Con số này xuất hiện ở cả hai nguyên nhân, và mức dùng bộ nhớ mới là thứ tách chúng.',
    ],
  },
};
