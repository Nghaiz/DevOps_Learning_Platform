/**
 * Phân tích và thực thi lệnh `kubectl`.
 *
 * ## Vì sao `describe` được đầu tư nhiều hơn `get`
 *
 * `kubectl get` là bảng tóm tắt; `kubectl describe` là chỗ NGUYÊN NHÂN nằm. Ba
 * sự cố dễ nhầm nhất của bộ (CrashLoopBackOff · OOMKilled · LivenessProbeFailed)
 * cho ra cùng một dòng ở `get` và chỉ tách nhau ở hai chỗ mà `describe` in ra:
 * khối **Last State** và danh sách **Events**. Bỏ hai khối đó đi là biến trò chơi
 * thành đoán mò.
 *
 * Cùng lý do, `logs --previous` được hiện thực đúng nghĩa: log của container
 * ĐANG chạy trong một pod CrashLoop gần như luôn rỗng, nên `--previous` là chỗ
 * duy nhất còn bằng chứng.
 */

import type { ResourceKind } from './contract.ts';
import type { ClusterState, K8sObject } from './model.ts';
import { podRuntime } from './model.ts';
import { livePods, podsOwnedBy, readyPods, serviceEndpoints } from './query.ts';
import { KINDS, asNumber, asString, readContainers, resolveKind } from './resources.ts';

export interface KubectlOptions {
  /** `null` = chưa nêu; bên gọi thay bằng namespace hiện hành. */
  readonly namespace: string | null;
  readonly allNamespaces: boolean;
  readonly selector: Readonly<Record<string, string>>;
  readonly output: string | null;
  readonly container: string | null;
  readonly previous: boolean;
  readonly filename: string | null;
  readonly replicas: number | null;
  readonly force: boolean;
  readonly showLabels: boolean;
}

export type RolloutSub = 'status' | 'restart' | 'undo' | 'history';

export type KubectlCommand =
  | { readonly verb: 'get'; readonly kind: ResourceKind; readonly name: string | null; readonly options: KubectlOptions }
  | { readonly verb: 'describe'; readonly kind: ResourceKind; readonly name: string | null; readonly options: KubectlOptions }
  | { readonly verb: 'delete'; readonly kind: ResourceKind; readonly name: string; readonly options: KubectlOptions }
  | { readonly verb: 'scale'; readonly kind: ResourceKind; readonly name: string; readonly replicas: number; readonly options: KubectlOptions }
  | { readonly verb: 'apply'; readonly options: KubectlOptions }
  | { readonly verb: 'edit'; readonly kind: ResourceKind; readonly name: string; readonly options: KubectlOptions }
  | { readonly verb: 'logs'; readonly name: string; readonly options: KubectlOptions }
  | { readonly verb: 'exec'; readonly name: string; readonly command: readonly string[]; readonly options: KubectlOptions }
  | { readonly verb: 'rollout'; readonly sub: RolloutSub; readonly kind: ResourceKind; readonly name: string; readonly options: KubectlOptions };

export type ParseResult =
  | { readonly ok: true; readonly command: KubectlCommand }
  /** Tiếng Việt — hiện thẳng cho người chơi. */
  | { readonly ok: false; readonly error: string };

const EMPTY_OPTIONS: KubectlOptions = {
  namespace: null,
  allNamespaces: false,
  selector: {},
  output: null,
  container: null,
  previous: false,
  filename: null,
  replicas: null,
  force: false,
  showLabels: false,
};

/** Tách token, tôn trọng nháy đơn và nháy kép. */
export function tokenize(input: string): readonly string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  let hasContent = false;
  for (const char of input.trim()) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }
    if (char === ' ' || char === '\t') {
      if (current !== '' || hasContent) {
        out.push(current);
      }
      current = '';
      hasContent = false;
      continue;
    }
    current += char;
  }
  if (current !== '' || hasContent) {
    out.push(current);
  }
  return out;
}

interface Flags {
  readonly options: KubectlOptions;
  readonly positional: readonly string[];
  readonly error: string | null;
}

/** `-l app=web,tier=api` → `{app:'web', tier:'api'}`. Chỉ nhận phép bằng. */
function parseSelector(raw: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const part of raw.split(',')) {
    const index = part.indexOf('=');
    if (index > 0) {
      out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
    }
  }
  return out;
}

function readFlags(tokens: readonly string[]): Flags {
  let options = EMPTY_OPTIONS;
  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    // `--` kết thúc phần cờ; mọi thứ sau nó là lệnh cho container (`exec`).
    if (token === '--') {
      positional.push(...tokens.slice(i + 1));
      break;
    }
    const eq = token.indexOf('=');
    const isLong = token.startsWith('--');
    const flag = isLong && eq > 0 ? token.slice(0, eq) : token;
    const inline = isLong && eq > 0 ? token.slice(eq + 1) : null;
    const take = (): string => inline ?? tokens[(i += 1)] ?? '';
    switch (flag) {
      case '-n':
      case '--namespace':
        options = { ...options, namespace: take() };
        break;
      case '-A':
      case '--all-namespaces':
        options = { ...options, allNamespaces: true };
        break;
      case '-l':
      case '--selector':
        options = { ...options, selector: parseSelector(take()) };
        break;
      case '-o':
      case '--output':
        options = { ...options, output: take() };
        break;
      case '-c':
      case '--container':
        options = { ...options, container: take() };
        break;
      case '-f':
      case '--filename':
        options = { ...options, filename: take() };
        break;
      case '--replicas':
        options = { ...options, replicas: Number.parseInt(take(), 10) };
        break;
      case '--previous':
      case '-p':
        options = { ...options, previous: true };
        break;
      case '--force':
        options = { ...options, force: true };
        break;
      case '--show-labels':
        options = { ...options, showLabels: true };
        break;
      case '-it':
      case '-i':
      case '-t':
      case '--stdin':
      case '--tty':
        // Cờ tương tác: nhận nhưng không mô phỏng. Nhận chứ không báo lỗi, vì
        // người học gõ đúng cú pháp thật không nên bị chặn.
        break;
      case '--grace-period':
      case '--wait':
        take();
        break;
      default:
        if (token.startsWith('-')) {
          return { options, positional, error: `Không nhận ra tuỳ chọn "${token}".` };
        }
        positional.push(token);
    }
  }
  return { options, positional, error: null };
}

function needKind(token: string, verb: string): ResourceKind | string {
  if (token === '') {
    return `Lệnh \`kubectl ${verb}\` cần một loại tài nguyên, ví dụ \`pods\`.`;
  }
  const kind = resolveKind(token);
  return kind ?? `Không biết loại tài nguyên "${token}".`;
}

/** `pod/web` là dạng viết tắt hợp lệ của `pod web`. */
function splitSlash(token: string | undefined): { kindToken: string; name: string | null } {
  if (token === undefined) {
    return { kindToken: '', name: null };
  }
  const slash = token.indexOf('/');
  return slash === -1
    ? { kindToken: token, name: null }
    : { kindToken: token.slice(0, slash), name: token.slice(slash + 1) };
}

export function parseKubectl(input: string): ParseResult {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return { ok: false, error: 'Chưa có lệnh nào.' };
  }
  const head = tokens[0];
  if (head !== 'kubectl' && head !== 'k') {
    return {
      ok: false,
      error: `Chỉ chạy được lệnh \`kubectl\` trong game (đã nhận "${head ?? ''}").`,
    };
  }
  const verb = tokens[1] ?? '';
  const flags = readFlags(tokens.slice(2));
  if (flags.error !== null) {
    return { ok: false, error: flags.error };
  }
  const { options, positional } = flags;
  const first = splitSlash(positional[0]);
  const name = first.name ?? positional[1] ?? null;

  switch (verb) {
    case 'get':
    case 'describe': {
      const kind = needKind(first.kindToken, verb);
      if (typeof kind === 'string') {
        return { ok: false, error: kind };
      }
      return { ok: true, command: { verb, kind, name, options } };
    }
    case 'delete':
    case 'edit': {
      const kind = needKind(first.kindToken, verb);
      if (typeof kind === 'string') {
        return { ok: false, error: kind };
      }
      if (name === null) {
        return { ok: false, error: `Lệnh \`kubectl ${verb}\` cần tên tài nguyên.` };
      }
      return { ok: true, command: { verb, kind, name, options } };
    }
    case 'scale': {
      const kind = needKind(first.kindToken, verb);
      if (typeof kind === 'string') {
        return { ok: false, error: kind };
      }
      if (name === null) {
        return { ok: false, error: 'Lệnh `kubectl scale` cần tên tài nguyên.' };
      }
      if (options.replicas === null || !Number.isFinite(options.replicas)) {
        return { ok: false, error: 'Lệnh `kubectl scale` cần `--replicas=<số>`.' };
      }
      return { ok: true, command: { verb, kind, name, replicas: options.replicas, options } };
    }
    case 'apply':
      return { ok: true, command: { verb, options } };
    case 'logs': {
      const target = first.name ?? positional[0] ?? null;
      if (target === null || target === '') {
        return { ok: false, error: 'Lệnh `kubectl logs` cần tên pod.' };
      }
      return { ok: true, command: { verb, name: target, options } };
    }
    case 'exec': {
      const target = positional[0] ?? null;
      if (target === null || target === '') {
        return { ok: false, error: 'Lệnh `kubectl exec` cần tên pod.' };
      }
      return { ok: true, command: { verb, name: target, command: positional.slice(1), options } };
    }
    case 'rollout': {
      const sub = positional[0] ?? '';
      if (sub !== 'status' && sub !== 'restart' && sub !== 'undo' && sub !== 'history') {
        return { ok: false, error: '`kubectl rollout` nhận: status, restart, undo, history.' };
      }
      const target = splitSlash(positional[1]);
      const kind = needKind(target.kindToken, 'rollout');
      if (typeof kind === 'string') {
        return { ok: false, error: kind };
      }
      const rolloutName = target.name ?? positional[2] ?? null;
      if (rolloutName === null) {
        return { ok: false, error: 'Lệnh `kubectl rollout` cần tên tài nguyên.' };
      }
      return { ok: true, command: { verb, sub, kind, name: rolloutName, options } };
    }
    default:
      return {
        ok: false,
        error: `Game chưa hỗ trợ \`kubectl ${verb}\`. Có: get, describe, apply, delete, scale, edit, logs, exec, rollout.`,
      };
  }
}

// ── Kết xuất chỉ-đọc ────────────────────────────────────────────────────────

function pad(text: string, width: number): string {
  return text.length >= width ? `${text} ` : text.padEnd(width + 1, ' ');
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    cells.map((cell, index) => pad(cell, widths[index] ?? cell.length)).join('').trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

function age(state: ClusterState, createdTick: number): string {
  const seconds = Math.max(0, Math.round(((state.tick - createdTick) * 500) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

/** Cột STATUS của `kubectl get pods`: `reason` thắng `phase` khi có mặt — đúng như kubectl. */
export function podStatusText(object: K8sObject): string {
  const pod = podRuntime(object);
  if (pod === null) {
    return '';
  }
  if (pod.phase === 'Terminating') {
    return 'Terminating';
  }
  return pod.reason ?? pod.phase;
}

function podRow(state: ClusterState, object: K8sObject, showLabels: boolean): readonly string[] {
  const pod = podRuntime(object);
  const containers = readContainers(object.spec, 500).length || 1;
  const readyCount = pod !== null && pod.ready ? containers : 0;
  const row = [
    object.name,
    `${readyCount}/${containers}`,
    podStatusText(object),
    String(pod?.restarts ?? 0),
    age(state, object.createdTick),
    pod?.nodeName ?? '<none>',
  ];
  return showLabels ? [...row, labelText(object)] : row;
}

function labelText(object: K8sObject): string {
  const entries = Object.entries(object.labels);
  return entries.length === 0 ? '<none>' : entries.map(([key, value]) => `${key}=${value}`).join(',');
}

function workloadRow(state: ClusterState, object: K8sObject): readonly string[] {
  const desired = asNumber(object.spec['replicas']) ?? 1;
  const pods = podsOwnedBy(state, object.uid);
  return [
    object.name,
    `${readyPods(pods).length}/${desired}`,
    String(pods.length),
    String(readyPods(pods).length),
    age(state, object.createdTick),
  ];
}

function genericRow(state: ClusterState, object: K8sObject): readonly string[] {
  return [object.name, age(state, object.createdTick)];
}

function selectObjects(state: ClusterState, command: KubectlCommand, namespace: string): readonly K8sObject[] {
  if (command.verb !== 'get' && command.verb !== 'describe') {
    return [];
  }
  const scoped = state.objects.filter((object) => {
    if (object.kind !== command.kind) {
      return false;
    }
    if (!KINDS[object.kind].namespaced || command.options.allNamespaces) {
      return true;
    }
    return object.namespace === namespace;
  });
  const named = command.name === null ? scoped : scoped.filter((object) => object.name === command.name);
  const selector = Object.entries(command.options.selector);
  return selector.length === 0
    ? named
    : named.filter((object) => selector.every(([key, value]) => object.labels[key] === value));
}

/**
 * `kubectl describe pod` — khối mang toàn bộ giá trị chẩn đoán.
 *
 * Thứ tự các khối theo đúng bản thật, và hai khối dưới đây là lý do hàm này tồn
 * tại:
 *
 * - **Last State** — `OOMKilled` + `Exit Code: 137` nằm ở ĐÂY, không ở State.
 *   Đây là bằng chứng duy nhất phân biệt một pod thiếu RAM với một pod sai
 *   entrypoint, vì cột STATUS của `get` nói `CrashLoopBackOff` cho cả hai.
 * - **Events** — scheduler ghi lý do TỪ CHỐI CỦA TỪNG NODE ở đây. Nhiều người
 *   dùng Kubernetes lâu năm không biết là có, và nó trả lời thẳng câu "vì sao
 *   pod của tôi mãi Pending".
 */
function describePod(state: ClusterState, object: K8sObject): string {
  const pod = podRuntime(object);
  if (pod === null) {
    return '';
  }
  const containers = readContainers(object.spec, 500);
  const lines = [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace}`,
    `Node:         ${pod.nodeName ?? '<none>'}`,
    `Labels:       ${labelText(object)}`,
    `Status:       ${podStatusText(object)}`,
    `Ready:        ${pod.ready ? 'True' : 'False'}`,
    `Restart Count: ${pod.restarts}`,
    'Containers:',
  ];
  for (const container of containers) {
    lines.push(`  ${container.name}:`);
    lines.push(`    Image:        ${container.image}`);
    lines.push(`    Ports:        ${container.ports.join(', ') || '<none>'}`);
    lines.push(`    State:        ${pod.phase === 'Running' ? 'Running' : 'Waiting'}`);
    if (pod.reason !== null) {
      lines.push(`      Reason:     ${pod.reason}`);
    }
    if (pod.lastState !== null) {
      lines.push('    Last State:   Terminated');
      lines.push(`      Reason:     ${pod.lastState.reason}`);
      lines.push(`      Exit Code:  ${pod.lastState.exitCode}`);
    }
    const requests = [
      container.requestsCpu === null ? null : `cpu: ${container.requestsCpu}m`,
      container.requestsMemory === null ? null : `memory: ${container.requestsMemory}Mi`,
    ].filter((item): item is string => item !== null);
    const limits = [
      container.limitsCpu === null ? null : `cpu: ${container.limitsCpu}m`,
      container.limitsMemory === null ? null : `memory: ${container.limitsMemory}Mi`,
    ].filter((item): item is string => item !== null);
    lines.push(`    Requests:     ${requests.join(', ') || '<none>'}`);
    lines.push(`    Limits:       ${limits.join(', ') || '<none>'}`);
    if (container.readinessProbe !== null) {
      lines.push(`    Readiness:    cổng ${container.readinessProbe.port ?? '?'} ${container.readinessProbe.path}`);
    }
    if (container.livenessProbe !== null) {
      lines.push(`    Liveness:     cổng ${container.livenessProbe.port ?? '?'} ${container.livenessProbe.path}`);
    }
  }
  return [...lines, '', eventsBlock(state, object.uid)].join('\n');
}

function eventsBlock(state: ClusterState, uid: string): string {
  const events = state.events.filter((event) => event.involvedUid === uid).slice(-12);
  if (events.length === 0) {
    return 'Events:       <none>';
  }
  return [
    'Events:',
    ...events.map((event) => `  ${event.reason.padEnd(24)} ${event.message}`),
  ].join('\n');
}

function describeService(state: ClusterState, object: K8sObject): string {
  const endpoints = serviceEndpoints(state, object);
  const selector = Object.entries(readSelectorOf(object));
  return [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace}`,
    `Selector:     ${selector.length === 0 ? '<none>' : selector.map(([k, v]) => `${k}=${v}`).join(',')}`,
    `Endpoints:    ${endpoints.length === 0 ? '<none>' : endpoints.map((pod) => pod.name).join(', ')}`,
    '',
    eventsBlock(state, object.uid),
  ].join('\n');
}

function readSelectorOf(object: K8sObject): Readonly<Record<string, string>> {
  const raw = object.spec['selector'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const nested = record['matchLabels'];
  const source = typeof nested === 'object' && nested !== null ? (nested as Record<string, unknown>) : record;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

function describeGeneric(state: ClusterState, object: K8sObject): string {
  return [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace || '<cluster-scoped>'}`,
    `Kind:         ${object.kind}`,
    `Labels:       ${labelText(object)}`,
    `Spec:         ${JSON.stringify(object.spec, null, 2)}`,
    '',
    eventsBlock(state, object.uid),
  ].join('\n');
}

/**
 * Chạy các lệnh CHỈ ĐỌC. Lệnh làm thay đổi trạng thái (`delete`, `scale`,
 * `rollout restart/undo`) nằm ở `reducer.ts`, vì chỉ reducer mới được sinh trạng
 * thái mới — tách hai việc đó là thứ giữ cho hàm này thuần và test được mà không
 * cần dựng cả một cụm.
 */
export function renderQuery(
  state: ClusterState,
  command: KubectlCommand,
  currentNamespace: string,
): string {
  const namespace = command.options.namespace ?? currentNamespace;
  switch (command.verb) {
    case 'get':
      return renderGet(state, command, namespace);
    case 'describe': {
      const matches = selectObjects(state, command, namespace);
      if (matches.length === 0) {
        return notFound(command.kind, command.name, namespace);
      }
      return matches
        .map((object) =>
          object.kind === 'Pod'
            ? describePod(state, object)
            : object.kind === 'Service'
              ? describeService(state, object)
              : describeGeneric(state, object),
        )
        .join('\n\n');
    }
    case 'logs':
      return renderLogs(state, command.name, namespace, command.options.previous);
    case 'exec':
      return renderExec(state, command.name, namespace, command.command);
    default:
      return '';
  }
}

function notFound(kind: ResourceKind, name: string | null, namespace: string): string {
  return name === null
    ? `No resources found in ${namespace} namespace.`
    : `Error from server (NotFound): ${KINDS[kind].plural} "${name}" not found`;
}

function renderGet(state: ClusterState, command: KubectlCommand, namespace: string): string {
  if (command.verb !== 'get') {
    return '';
  }
  const matches = selectObjects(state, command, namespace);
  if (matches.length === 0) {
    return notFound(command.kind, command.name, namespace);
  }
  const showLabels = command.options.showLabels;
  const isWorkload =
    command.kind === 'Deployment' || command.kind === 'ReplicaSet' || command.kind === 'StatefulSet';
  if (command.kind === 'Pod') {
    const header = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', 'NODE'];
    return table(
      showLabels ? [...header, 'LABELS'] : header,
      matches.map((object) => podRow(state, object, showLabels)),
    );
  }
  if (isWorkload) {
    return table(
      ['NAME', 'READY', 'CURRENT', 'AVAILABLE', 'AGE'],
      matches.map((object) => workloadRow(state, object)),
    );
  }
  if (command.kind === 'Service') {
    return table(
      ['NAME', 'TYPE', 'SELECTOR', 'ENDPOINTS', 'AGE'],
      matches.map((object) => [
        object.name,
        asString(object.spec['type']) ?? 'ClusterIP',
        Object.entries(readSelectorOf(object))
          .map(([key, value]) => `${key}=${value}`)
          .join(',') || '<none>',
        String(serviceEndpoints(state, object).length),
        age(state, object.createdTick),
      ]),
    );
  }
  if (command.kind === 'PersistentVolumeClaim') {
    return table(
      ['NAME', 'STATUS', 'VOLUME', 'AGE'],
      matches.map((object) => [
        object.name,
        object.runtime.kind === 'pvc' && object.runtime.boundVolume !== null ? 'Bound' : 'Pending',
        (object.runtime.kind === 'pvc' ? object.runtime.boundVolume : null) ?? '<none>',
        age(state, object.createdTick),
      ]),
    );
  }
  return table(['NAME', 'AGE'], matches.map((object) => genericRow(state, object)));
}

/**
 * `kubectl logs` và `kubectl logs --previous`.
 *
 * ⚠ Log RỖNG của một pod đang CrashLoop là kết quả ĐÚNG, không phải thiếu sót —
 * container mới chưa kịp ghi gì. Thông báo dưới đây nói thẳng điều đó và chỉ
 * sang `--previous`, vì "không có gì" mà không giải thích sẽ đọc thành "công cụ
 * hỏng" và người chơi bỏ mất đúng cái lệnh cần dùng.
 */
function renderLogs(
  state: ClusterState,
  name: string,
  namespace: string,
  previous: boolean,
): string {
  const object = livePods(state, namespace).find((pod) => pod.name === name);
  if (object === undefined) {
    return `Error from server (NotFound): pods "${name}" not found`;
  }
  const pod = podRuntime(object);
  if (pod === null) {
    return '';
  }
  const lines = previous ? pod.previousLogs : pod.logs;
  if (lines.length > 0) {
    return lines.join('\n');
  }
  if (previous) {
    return `Error from server (BadRequest): previous terminated container "${name}" not found — pod chưa từng khởi động lại.`;
  }
  return pod.restarts > 0
    ? '(log rỗng — container hiện tại chưa kịp ghi gì. Thử `kubectl logs --previous` để đọc log của lần chạy trước.)'
    : '(chưa có log)';
}

/**
 * `kubectl exec` mô phỏng đúng MỘT thứ: `df -h`.
 *
 * Đó là lệnh dạy được nhất trong nhóm, vì nó là cách duy nhất phát hiện một
 * volume đầy — một sự cố mà pod vẫn `Running`, mọi probe vẫn xanh, và KHÔNG hiện
 * ra ở bất kỳ trạng thái nào của pod. Giả lập một shell đầy đủ thì tốn nhiều mà
 * không dạy thêm gì.
 */
function renderExec(
  state: ClusterState,
  name: string,
  namespace: string,
  command: readonly string[],
): string {
  const object = livePods(state, namespace).find((pod) => pod.name === name);
  if (object === undefined) {
    return `Error from server (NotFound): pods "${name}" not found`;
  }
  const pod = podRuntime(object);
  if (pod === null || pod.phase !== 'Running') {
    return `Error from server: cannot exec into a container in a ${podStatusText(object)} pod`;
  }
  const joined = command.join(' ');
  if (joined.startsWith('df')) {
    return ['Filesystem      Size  Used Avail Use% Mounted on', 'overlay          20G  2.1G   18G  11% /'].join('\n');
  }
  if (joined.startsWith('env')) {
    return Object.entries(object.labels)
      .map(([key, value]) => `LABEL_${key.toUpperCase()}=${value}`)
      .join('\n');
  }
  return `(game chỉ mô phỏng \`df\` và \`env\` trong container; đã nhận "${joined}")`;
}
