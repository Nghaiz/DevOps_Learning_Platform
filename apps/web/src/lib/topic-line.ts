import type { LineId } from '@devops-platform/ui';

/**
 * Nội dung → tuyến màu (design-brief §2.3). Đây là BẢNG TOKEN của hệ màu chủ đề,
 * nguồn duy nhất trả lời "bài này thuộc tuyến nào". Từ khoá so trên tag, id game
 * và tên chủ đề đã viết thường; khớp đầu tiên theo thứ tự `RULES` thắng.
 *
 * Không khớp gì ⇒ `'ink'` (tuyến trung tính), KHÔNG đoán một màu: tô sai màu
 * chủ đề là nói sai với người học bài này thuộc mảng nào.
 */
export type TopicLine = LineId | 'ink';

const RULES: ReadonlyArray<readonly [LineId, readonly string[]]> = [
  ['k8s', ['k8s', 'kubernetes', 'kubectl', 'helm', 'ckad', 'cka', 'pod', 'deployment', 'kustomize', 'scheduling']],
  ['docker', ['docker', 'container', 'dockerfile', 'compose', 'podman', 'image', 'oci']],
  ['git', ['git', 'github', 'gitlab', 'branch', 'merge', 'rebase']],
  ['cicd', ['cicd', 'ci-cd', 'ci/cd', 'pipeline', 'actions', 'jenkins', 'argo', 'gitops', 'deploy']],
  ['net', ['network', 'networking', 'netpol', 'dns', 'tcp', 'ingress', 'loadbalancer', 'load-balancing', 'loxilb', 'service-mesh']],
  ['obs', ['monitoring', 'observability', 'logging', 'loki', 'prometheus', 'grafana', 'tracing', 'metrics']],
  ['sec', ['security', 'rbac', 'tls', 'seccomp', 'apparmor', 'secret', 'policy']],
  ['iac', ['terraform', 'ansible', 'iac', 'cloud', 'aws', 'gcp', 'azure', 'pulumi']],
  ['linux', ['linux', 'bash', 'shell', 'systemd', 'ubuntu', 'debian', 'filesystem', 'process', 'sandbox', 'ide']],
];

const GAME_LINE: Readonly<Record<string, LineId>> = {
  k8s: 'k8s',
  git: 'git',
  cicd: 'cicd',
  pipeline: 'cicd',
  netpol: 'net',
  dockerfile: 'docker',
};

function tokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9/]+/)
    .filter((part) => part.length > 0);
}

export function lineForTopic(input: {
  readonly tags?: readonly string[];
  readonly gameId?: string | null;
  readonly topic?: string | null;
  readonly id?: string | null;
}): TopicLine {
  if (input.gameId) {
    const byGame = GAME_LINE[input.gameId.toLowerCase()];
    if (byGame) return byGame;
  }
  const words = new Set<string>();
  for (const source of [...(input.tags ?? []), input.topic ?? '', input.id ?? '']) {
    for (const word of tokens(source)) words.add(word);
    words.add(source.toLowerCase());
  }
  for (const [line, keywords] of RULES) {
    if (keywords.some((keyword) => words.has(keyword))) return line;
  }
  return 'ink';
}
