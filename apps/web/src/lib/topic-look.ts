import type { IconName } from '@devops-platform/ds/icons';

/**
 * Nội dung thuộc mảng nào: quyết định màu (`data-topic`) và biểu tượng của nó ở mọi
 * danh sách. Đây là bảng DUY NHẤT trả lời câu đó.
 *
 * Thứ tự đọc: chủ đề khai trong nội dung thắng, rồi game, rồi từ khoá trong tag và id.
 * Không khớp gì thì ra `general` (xám), không đoán một màu: tô sai màu là nói sai với
 * người học bài này thuộc mảng nào.
 */
export type TopicName =
  | 'kubernetes'
  | 'docker'
  | 'git'
  | 'cicd'
  | 'networking'
  | 'observability'
  | 'security'
  | 'iac'
  | 'bash'
  | 'linux'
  | 'general';

const TOPIC_NAMES: ReadonlySet<string> = new Set<TopicName>([
  'kubernetes',
  'docker',
  'git',
  'cicd',
  'networking',
  'observability',
  'security',
  'iac',
  'bash',
  'linux',
  'general',
]);

const RULES: ReadonlyArray<readonly [TopicName, readonly string[]]> = [
  ['kubernetes', ['k8s', 'kubernetes', 'kubectl', 'helm', 'ckad', 'cka', 'pod', 'deployment', 'kustomize', 'scheduling']],
  ['docker', ['docker', 'container', 'dockerfile', 'compose', 'podman', 'image', 'oci']],
  ['git', ['git', 'github', 'gitlab', 'branch', 'merge', 'rebase']],
  ['cicd', ['cicd', 'ci-cd', 'ci/cd', 'pipeline', 'actions', 'jenkins', 'argo', 'gitops', 'deploy']],
  ['networking', ['network', 'networking', 'netpol', 'dns', 'tcp', 'ingress', 'loadbalancer', 'load-balancing', 'service-mesh']],
  ['observability', ['monitoring', 'observability', 'logging', 'loki', 'prometheus', 'grafana', 'tracing', 'metrics']],
  ['security', ['security', 'rbac', 'tls', 'seccomp', 'apparmor', 'secret', 'policy']],
  ['iac', ['terraform', 'ansible', 'iac', 'cloud', 'aws', 'gcp', 'azure', 'pulumi']],
  ['bash', ['bash', 'shell', 'script', 'scripting', 'zsh']],
  ['linux', ['linux', 'systemd', 'ubuntu', 'debian', 'filesystem', 'process', 'sandbox', 'ide']],
];

const GAME_TOPIC: Readonly<Record<string, TopicName>> = {
  k8s: 'kubernetes',
  git: 'git',
  cicd: 'cicd',
  pipeline: 'cicd',
  netpol: 'networking',
  dockerfile: 'docker',
};

export const TOPIC_ICON: Readonly<Record<TopicName, IconName>> = {
  kubernetes: 'kube',
  docker: 'container',
  git: 'branch',
  cicd: 'pipeline',
  networking: 'network',
  observability: 'activity',
  security: 'shield',
  iac: 'cloud',
  bash: 'prompt',
  linux: 'penguin',
  general: 'circle-dot',
};

function words(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9/]+/)
    .filter((part) => part.length > 0);
}

export interface TopicInput {
  readonly topic?: string | null | undefined;
  readonly gameId?: string | null | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly id?: string | null | undefined;
}

export function topicOf(input: TopicInput): TopicName {
  const declared = input.topic?.toLowerCase() ?? '';
  if (TOPIC_NAMES.has(declared)) return declared as TopicName;

  const byGame = input.gameId == null ? undefined : GAME_TOPIC[input.gameId.toLowerCase()];
  if (byGame !== undefined) return byGame;

  const seen = new Set<string>();
  for (const source of [...(input.tags ?? []), declared, input.id ?? '']) {
    for (const word of words(source)) seen.add(word);
    seen.add(source.toLowerCase());
  }
  for (const [topic, keywords] of RULES) {
    if (keywords.some((keyword) => seen.has(keyword))) return topic;
  }
  return 'general';
}

/** Màu và biểu tượng của một nội dung, đọc cùng một lượt. */
export function topicLook(input: TopicInput): { readonly topic: TopicName; readonly icon: IconName } {
  const topic = topicOf(input);
  return { topic, icon: TOPIC_ICON[topic] };
}
