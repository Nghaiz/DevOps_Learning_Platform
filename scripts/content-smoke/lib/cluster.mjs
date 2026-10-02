/**
 * Hạ tầng của harness trên cụm thật: namespace riêng, netpol nhân bản, pod.
 *
 * ⛔ KHÔNG BAO GIỜ tạo pod trong `dlp-sandbox`: reaper xoá pod không có phiên sau
 * 5 phút, và mọi thứ ở đó là của người học thật. Namespace riêng thì KHÔNG
 * tương đương về mạng nếu thiếu netpol — một bài "pull qua mirror" sẽ xanh ở đây
 * nhờ mạng mở và đỏ trước mặt người học. Nên netpol được ĐỌC SỐNG từ
 * `dlp-sandbox` và áp lại, chỉ đổi namespace.
 *
 * Mọi thông số pod (image, runtimeClass, mirror, profile) cũng đọc sống từ
 * Deployment orchestrator + LimitRange của `dlp-sandbox`, không gõ tay: harness
 * chạy đúng thứ cụm đang chạy, hôm nay và sau lần `helm upgrade` kế tiếp.
 */
import { randomBytes } from 'node:crypto';
import { MANAGED_BY, NS, kubectl, kubectlJson, kubectlOk, kubectlSync } from './kube.mjs';

const SANDBOX_NS = 'dlp-sandbox';
const REGISTRY_NS = 'dlp-registry';
const MIRROR_INGRESS_NETPOL = 'platform-registry-mirror-allow-ingress-sandbox';
const OUR_LABELS = { 'app.kubernetes.io/managed-by': MANAGED_BY };
const SELECTOR = `app.kubernetes.io/managed-by=${MANAGED_BY}`;
/** Lưới an toàn khi harness bị giết cứng (kill -9): pod tự hết hạn, khỏi giữ RAM node. */
const POD_ACTIVE_DEADLINE_S = 3600;

/** Đọc cấu hình sandbox SỐNG: env của Deployment orchestrator + LimitRange của dlp-sandbox. */
export async function readLiveConfig() {
  const deploys = await kubectlJson(['get', 'deploy', '-n', 'default']);
  let env = null;
  for (const d of deploys.items) {
    for (const c of d.spec.template.spec.containers) {
      const map = Object.fromEntries((c.env ?? []).map((e) => [e.name, e.value]));
      if (map.SANDBOX_IMAGE !== undefined) env = map;
    }
  }
  if (env === null) throw new Error('không thấy Deployment nào trong ns default mang env SANDBOX_IMAGE');
  const ranges = await kubectlJson(['get', 'limitrange', '-n', SANDBOX_NS]);
  const container = ranges.items.flatMap((r) => r.spec.limits).find((l) => l.type === 'Container');
  return {
    image: env.SANDBOX_IMAGE,
    runtimeClass: env.SANDBOX_RUNTIME_CLASS,
    registryMirror: env.SANDBOX_REGISTRY_MIRROR ?? '',
    profiles: env.SANDBOX_PROFILES ? JSON.parse(env.SANDBOX_PROFILES) : {},
    defaultResources: container
      ? { requests: container.defaultRequest ?? {}, limits: container.default ?? {} }
      : {},
  };
}

/** Profile → { env, resources }. Tên lạ ⇒ NÉM, cùng kỷ luật fail-closed của orchestrator. */
export function resolveProfile(live, name) {
  if (name === '') return { env: {}, resources: live.defaultResources };
  const p = live.profiles[name];
  if (p === undefined) {
    throw new Error(`profile "${name}" không có trong SANDBOX_PROFILES (có: ${Object.keys(live.profiles).join(', ')})`);
  }
  return {
    env: p.env ?? {},
    resources: {
      requests: { cpu: p.requestsCpu, memory: p.requestsMemory },
      limits: { cpu: p.limitsCpu, memory: p.limitsMemory },
    },
  };
}

const stripMeta = (obj, namespace) => ({
  apiVersion: obj.apiVersion,
  kind: obj.kind,
  metadata: { name: obj.metadata.name, namespace, labels: OUR_LABELS },
  spec: obj.spec,
});

/** Namespace + 4 netpol nhân bản + 1 netpol mở mirror cho ns này. `apply` nên chạy lại vô hại. */
export async function ensureInfra() {
  const sandboxNs = await kubectlJson(['get', 'ns', SANDBOX_NS]);
  const psa = Object.fromEntries(
    Object.entries(sandboxNs.metadata.labels ?? {}).filter(([k]) => k.startsWith('pod-security.kubernetes.io/')),
  );
  const netpols = await kubectlJson(['get', 'netpol', '-n', SANDBOX_NS]);
  const mirrorIngress = await kubectlJson(['get', 'netpol', MIRROR_INGRESS_NETPOL, '-n', REGISTRY_NS]);
  const ingressRules = mirrorIngress.spec.ingress.map((rule) => ({
    ...rule,
    from: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': NS } } }],
  }));
  const items = [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: NS, labels: { ...OUR_LABELS, ...psa } } },
    ...netpols.items.map((np) => stripMeta(np, NS)),
    {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: { name: `${MANAGED_BY}-allow-ingress-mirror`, namespace: REGISTRY_NS, labels: OUR_LABELS },
      spec: { ...mirrorIngress.spec, ingress: ingressRules },
    },
  ];
  await kubectlOk(['apply', '-f', '-'], { input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items }) });
  return { netpols: netpols.items.map((n) => n.metadata.name) };
}

/** Gỡ mọi thứ harness dựng. Trả danh sách đã gỡ để in ra. */
export async function teardown() {
  const lines = [];
  for (const args of [
    ['delete', 'pod', '-n', NS, '-l', SELECTOR, '--wait=false', '--ignore-not-found'],
    ['delete', 'netpol', '-n', REGISTRY_NS, '-l', SELECTOR, '--ignore-not-found'],
    ['delete', 'ns', NS, '--ignore-not-found', '--wait=false'],
  ]) {
    const r = await kubectl(args);
    lines.push(`kubectl ${args.slice(0, 4).join(' ')}: ${(r.stdout + r.stderr).trim() || '(không có gì)'}`);
  }
  return lines;
}

export function newPodName(kind, id) {
  const slug = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30).replace(/-+$/, '');
  return `smoke-${kind}-${slug}-${randomBytes(3).toString('hex')}`;
}

/** Podspec nhân bản `BuildSandboxPod` (services/orchestrator/internal/k8s/podspec.go). */
export function buildPod(name, { live, image, profile, contentId }) {
  const { env, resources } = resolveProfile(live, profile);
  const podEnv = [];
  if (live.registryMirror) podEnv.push({ name: 'DLP_REGISTRY_MIRROR', value: live.registryMirror });
  for (const k of Object.keys(env).sort()) podEnv.push({ name: k, value: env[k] });
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: NS,
      labels: { ...OUR_LABELS, 'dlp-content-smoke/content': contentId.slice(0, 63) },
    },
    spec: {
      runtimeClassName: live.runtimeClass,
      hostUsers: false,
      hostNetwork: false,
      hostPID: false,
      hostIPC: false,
      automountServiceAccountToken: false,
      enableServiceLinks: false,
      restartPolicy: 'Never',
      activeDeadlineSeconds: POD_ACTIVE_DEADLINE_S,
      securityContext: { seccompProfile: { type: 'RuntimeDefault' } },
      containers: [
        {
          name: 'sandbox',
          image,
          imagePullPolicy: 'IfNotPresent',
          env: podEnv,
          resources,
          securityContext: {
            privileged: false,
            allowPrivilegeEscalation: false,
            capabilities: { drop: ['ALL'] },
          },
        },
      ],
      hostAliases: live.registryMirror
        ? [
            {
              ip: '127.0.0.1',
              hostnames: ['registry-1.docker.io', 'index.docker.io', 'auth.docker.io', 'production.cloudflare.docker.com'],
            },
          ]
        : undefined,
    },
  };
}

export async function createPod(pod) {
  await kubectlOk(['create', '-f', '-'], { input: JSON.stringify(pod) });
}

const FATAL_WAITING = new Set(['ErrImagePull', 'ImagePullBackOff', 'InvalidImageName', 'CreateContainerError', 'CreateContainerConfigError']);

/** Chờ pod Running + Ready. Hỏng nhanh khi kéo image hỏng / không xếp lịch được, kèm lý do. */
export async function waitPodReady(name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const r = await kubectl(['get', 'pod', name, '-n', NS, '-o', 'json']);
    if (r.code === 0) {
      const pod = JSON.parse(r.stdout);
      const cs = pod.status.containerStatuses?.[0];
      const waiting = cs?.state?.waiting;
      if (waiting && FATAL_WAITING.has(waiting.reason)) {
        throw new Error(`pod ${name}: ${waiting.reason} — ${waiting.message ?? ''}`);
      }
      if (pod.status.phase === 'Failed' || pod.status.phase === 'Succeeded') {
        throw new Error(`pod ${name} đã kết thúc (phase=${pod.status.phase})`);
      }
      const ready = pod.status.conditions?.find((c) => c.type === 'Ready')?.status === 'True';
      if (ready) return;
      const sched = pod.status.conditions?.find((c) => c.type === 'PodScheduled' && c.status === 'False');
      last = sched ? `${sched.reason}: ${sched.message}` : waiting ? waiting.reason : pod.status.phase;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`pod ${name} chưa Ready sau ${timeoutMs / 1000}s (lần cuối: ${last})`);
}

/** Đồng bộ — gọi được từ handler thoát/Ctrl-C. */
export function deletePodSync(name) {
  kubectlSync(['delete', 'pod', name, '-n', NS, '--wait=false', '--ignore-not-found']);
}
