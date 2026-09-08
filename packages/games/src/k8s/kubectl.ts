/**
 * Phân tích và thực thi lệnh `kubectl`.
 *
 * ## Khối `describe` KHÔNG nằm ở đây
 *
 * Phần dựng chuỗi của `describe` ở `describe.ts`, và file này chỉ gọi vào
 * `describeObject`. Lý do: tab Mô tả của bảng thông số cần đúng khối văn bản đó
 * nhưng đi qua `session.describe(uid)` chứ không qua thanh lệnh — hai đường vào,
 * một bộ định dạng. Viết bộ thứ hai cho giao diện sẽ cho ra hai nội dung khác
 * nhau cho cùng một pod, và không có gì đỏ ở đâu cả.
 *
 * `logs --previous` thì được hiện thực đúng nghĩa ngay tại đây: log của container
 * ĐANG chạy trong một pod CrashLoop gần như luôn rỗng, nên `--previous` là chỗ
 * duy nhất còn bằng chứng.
 */

import type { ResourceKind } from './contract.ts';
import type { CommandOutcome, RunCommand } from './engine-boundary.ts';
import type { ClusterState, K8sObject } from './model.ts';
import {
  emitEvent,
  findObject,
  isDoomed,
  podRuntime,
  removeObjectCascade,
  replaceObject,
} from './model.ts';
import { childrenOf, livePods, podsOwnedBy, readyPods, serviceEndpoints, workloadTemplate } from './query.ts';
import { describeObject, labelText, podStatusText } from './describe.ts';
import { DEFAULT_GRACE_TICKS, templateHash } from './controllers.ts';
import { TICK_MS, markDeleting } from './tick.ts';
import {
  KINDS,
  asNumber,
  asString,
  asStringMap,
  isNamespaced,
  readContainers,
  readSelector,
  resolveKind,
} from './resources.ts';

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

/**
 * Danh sách động từ ở dạng DỮ LIỆU, không phải kiểu.
 *
 * `KubectlCommand` ở trên là kiểu liên hợp, và kiểu thì biến mất lúc chạy — nên
 * tầng giao diện không có cách nào duyệt qua nó để dựng gợi ý lệnh. Trước khi
 * có hằng này, bộ gợi ý terminal giữ một bản CHÉP TAY chín động từ cộng bảng cờ,
 * và bản chép đó không có gì bắt được khi `kubectl.ts` thêm hay đổi động từ:
 * gợi ý cứ lặng lẽ sai đi, còn lệnh vẫn chạy đúng vì `parseKubectl` mới là bên
 * phân tích thật.
 *
 * Cặp kiểm tra ngay dưới là thứ làm hằng này khác một bản chép: nó bắt lệch theo
 * CẢ HAI chiều lúc biên dịch. Thêm động từ vào `KubectlCommand` mà quên thêm vào
 * đây thì đỏ; để lại ở đây một động từ đã gỡ khỏi union thì cũng đỏ.
 */
export const KUBECTL_VERBS = [
  'get',
  'describe',
  'delete',
  'scale',
  'apply',
  'edit',
  'logs',
  'exec',
  'rollout',
] as const;

export type KubectlVerb = KubectlCommand['verb'];

/* Chiều 1 — mọi phần tử của mảng phải là một động từ có thật trong union. */
const _verbsAreReal: readonly KubectlVerb[] = KUBECTL_VERBS;
/* Chiều 2 — mọi động từ trong union phải có mặt trong mảng. */
const _verbsAreComplete: Exclude<KubectlVerb, (typeof KUBECTL_VERBS)[number]> extends never
  ? true
  : false = true;
void _verbsAreReal;
void _verbsAreComplete;

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

/**
 * ⚠ Trả `ResourceKind | null`, KHÔNG phải `ResourceKind | string`.
 *
 * Bản đầu trả một union kiểu-với-thông-báo rồi phân biệt hai nhánh bằng
 * `typeof kind === 'string'` — mà `ResourceKind` CHÍNH LÀ string, nên nhánh lỗi
 * nuốt luôn mọi kết quả hợp lệ: `kubectl get pods` trả về `{ok:false,
 * error:'Pod'}`. Cả file biên dịch xanh và mọi lệnh có tên loại đều hỏng. Đây là
 * lý do union phân biệt phải có thẻ (`ok`), không được dựa vào `typeof` giữa hai
 * nhánh cùng kiểu nền.
 */
function resolveKindArg(token: string): ResourceKind | null {
  return token === '' ? null : resolveKind(token);
}

function kindError(token: string, verb: string): string {
  return token === ''
    ? `Lệnh \`kubectl ${verb}\` cần một loại tài nguyên, ví dụ \`pods\`.`
    : `Không biết loại tài nguyên "${token}". Gõ \`kubectl get\` kèm một trong: pods, deployments, services, configmaps…`;
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
      const kind = resolveKindArg(first.kindToken);
      if (kind === null) {
        return { ok: false, error: kindError(first.kindToken, verb) };
      }
      return { ok: true, command: { verb, kind, name, options } };
    }
    case 'delete':
    case 'edit': {
      const kind = resolveKindArg(first.kindToken);
      if (kind === null) {
        return { ok: false, error: kindError(first.kindToken, verb) };
      }
      if (name === null) {
        return { ok: false, error: `Lệnh \`kubectl ${verb}\` cần tên tài nguyên.` };
      }
      return { ok: true, command: { verb, kind, name, options } };
    }
    case 'scale': {
      const kind = resolveKindArg(first.kindToken);
      if (kind === null) {
        return { ok: false, error: kindError(first.kindToken, verb) };
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
      const kind = resolveKindArg(target.kindToken);
      if (kind === null) {
        return { ok: false, error: kindError(target.kindToken, 'rollout') };
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

/*
 * `podStatusText` và `labelText` sống ở `describe.ts` cùng với phần dựng chuỗi
 * `describe`, và được tái xuất ở đây vì bảng `get` cũng cần đúng hai mẩu đó.
 * Một cột STATUS và một khối Status nói khác nhau về cùng một pod là chuyện chỉ
 * người đọc mã mới phát hiện ra.
 */
export { podStatusText };

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
 * Chạy các lệnh CHỈ ĐỌC — `get`, `describe`, `logs`, `exec`.
 *
 * Tách khỏi `runCommand` để test được phần kết xuất mà không phải nghĩ về trạng
 * thái mới: hàm này nhận `state` và trả về một chuỗi, hết. Lệnh làm thay đổi
 * trạng thái nằm ở `runCommand` bên dưới, và nó gọi lại đúng hàm này cho nhánh
 * chỉ đọc — một chỗ kết xuất duy nhất, không hai bản.
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
      // Phân nhánh theo `kind` nằm trong `describeObject`, không ở đây: hai chỗ
      // gọi (thanh lệnh và `session.describe`) thì hai chỗ phải nhớ thêm nhánh
      // mới, và chỗ quên sẽ rơi về khối generic mà không có gì báo.
      return matches.map((object) => describeObject(state, object)).join('\n\n');
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
        // `readSelector` của `resources.ts` chứ không một bản đọc selector thứ
        // hai tại chỗ: `view.ts` đã dùng đúng hàm đó cho cùng câu hỏi, và hai
        // bản sẽ lệch nhau ở đúng chỗ khó thấy nhất — `selector` phẳng của
        // Service so với `selector.matchLabels` của workload.
        Object.entries(readSelector(object.spec))
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

// ── Lệnh làm thay đổi trạng thái ────────────────────────────────────────────

/**
 * `kubectl delete`, `scale`, `rollout` — và hai lệnh mà một trò chơi trong trình
 * duyệt KHÔNG chạy được (`apply -f`, `edit`), vốn phải trả lời cho tử tế thay vì
 * im lặng.
 *
 * ## Vì sao lỗi ở đây dài hơn lỗi của kubectl thật
 *
 * `kubectl` thật in `error: cannot scale resource "pods"` rồi thôi — đúng cho một
 * người vận hành đã biết vì sao, vô dụng cho một người đang học. Quy ước của file
 * này: giữ NGUYÊN dòng kubectl thật (người học sẽ gặp lại nó ngoài đời), rồi thêm
 * một dòng tiếng Việt nói LÀM GÌ TIẾP. Không bao giờ chỉ có dòng thứ hai, và
 * không bao giờ chỉ có dòng thứ nhất.
 *
 * ⛔ Không ném. Một lệnh gõ sai là chuyện thường của người học, không phải sự cố
 * của phiên chơi.
 */
export const runCommand: RunCommand = (state, input, currentNamespace) => {
  const parsed = parseKubectl(input);
  if (!parsed.ok) {
    return { state, output: parsed.error, accepted: false };
  }
  const command = parsed.command;
  const namespace = command.options.namespace ?? currentNamespace;
  switch (command.verb) {
    case 'get':
    case 'describe':
    case 'logs':
    case 'exec':
      return { state, output: renderQuery(state, command, currentNamespace), accepted: true };
    case 'delete':
      return runDelete(state, command.kind, command.name, namespace, command.options.force);
    case 'scale':
      return runScale(state, command.kind, command.name, namespace, command.replicas);
    case 'rollout':
      return runRollout(state, command.sub, command.kind, command.name, namespace);
    case 'apply':
      return { state, output: applyNotSupported(command.options.filename), accepted: false };
    case 'edit':
      return runEdit(state, command.kind, command.name, namespace);
  }
};

/** Tra tài nguyên theo khoá tự nhiên. Loại phạm vi cluster luôn có namespace rỗng. */
function lookup(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
): K8sObject | null {
  return findObject(state, { kind, namespace: isNamespaced(kind) ? namespace : '', name });
}

/** Dòng NotFound đúng chữ của API server, kèm chỉ dẫn tìm ở đâu. */
function notFoundOutcome(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
): CommandOutcome {
  const scope = isNamespaced(kind) ? ` trong namespace ${namespace}` : ' (tài nguyên phạm vi cluster)';
  return {
    state,
    output: [
      `Error from server (NotFound): ${KINDS[kind].plural} "${name}" not found`,
      `Không có ${kind} nào tên "${name}"${scope}. Liệt kê lại bằng \`kubectl get ${KINDS[kind].plural}${isNamespaced(kind) ? ` -n ${namespace}` : ''}\` để đối chiếu tên.`,
    ].join('\n'),
    accepted: false,
  };
}

/**
 * `kubectl delete`.
 *
 * Hai chi tiết ĐÚNG với cụm thật và cùng là hai bài học:
 *
 * 1. **Xoá pod do controller quản lý không sửa được gì.** ReplicaSet đẻ lại pod
 *    ngay ở tick sau, với cùng cấu hình hỏng. Người chơi thấy restart count về 0
 *    và tưởng đã sửa xong — nên lệnh này nói thẳng ra điều đó.
 * 2. **`--force` xoá BẢN GHI ở API server, không giết tiến trình.** Đây là hiểu
 *    lầm phổ biến nhất về force delete, và repo đã trả giá cho đúng nó một lần ở
 *    hạ tầng thật (pod "đã xoá" mà tiến trình còn sống thêm 30 giây).
 */
function runDelete(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
  force: boolean,
): CommandOutcome {
  const target = lookup(state, kind, name, namespace);
  if (target === null) {
    return notFoundOutcome(state, kind, name, namespace);
  }
  const line = `${KINDS[kind].plural.replace(/s$/, '')} "${name}" deleted`;
  const pod = podRuntime(target);
  if (pod !== null) {
    if (isDoomed(pod) && !force) {
      return {
        state,
        output: [
          `pod "${name}" đang ở Terminating rồi.`,
          'Pod chờ hết grace period mới biến mất. Muốn bỏ qua khoảng chờ đó thì thêm `--force`, nhưng đọc kỹ: force chỉ xoá BẢN GHI ở API server chứ không giết tiến trình bên trong.',
        ].join('\n'),
        accepted: false,
      };
    }
    const owner = target.ownerUid === null ? null : state.objects.find((item) => item.uid === target.ownerUid) ?? null;
    const notes: string[] = [];
    if (force) {
      notes.push(
        'Đã xoá bản ghi pod ngay, không chờ grace period. Lưu ý: ở cụm thật, tiến trình trong container có thể còn sống thêm một lúc — force delete tác động lên API server, không phải lên process.',
      );
    }
    if (owner !== null) {
      notes.push(
        `Pod này thuộc ${owner.kind} "${owner.name}", nên controller sẽ tạo lại một pod mới trong vài tick — với ĐÚNG cấu hình cũ. Xoá pod chỉ đặt lại đồng hồ, không sửa nguyên nhân.`,
      );
    }
    return {
      state: markDeleting(state, target, force ? 0 : DEFAULT_GRACE_TICKS),
      output: [line, ...notes].join('\n'),
      accepted: true,
    };
  }
  const children = childrenOf(state, target.uid);
  const cascade =
    children.length === 0
      ? []
      : [`Xoá theo tầng: ${children.length} tài nguyên con của ${kind} "${name}" cũng biến mất (ownerReference).`];
  const next = emitEvent(removeObjectCascade(state, target.uid), {
    level: 'info',
    reason: 'SuccessfulDelete',
    message: `Đã xoá ${kind} ${name}.`,
    involvedUid: null,
  });
  return { state: next, output: [line, ...cascade].join('\n'), accepted: true };
}

/** Loại có `spec.replicas`. Pod KHÔNG nằm trong đây, và đó là nội dung của lỗi. */
const SCALABLE: ReadonlySet<ResourceKind> = new Set<ResourceKind>([
  'Deployment',
  'ReplicaSet',
  'StatefulSet',
]);

function runScale(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
  replicas: number,
): CommandOutcome {
  if (!SCALABLE.has(kind)) {
    return {
      state,
      output: [
        `error: cannot scale resource "${KINDS[kind].plural}"`,
        kind === 'Pod'
          ? 'Một Pod là MỘT bản chạy, không có `replicas` để tăng giảm. Muốn nhiều bản thì phải có một controller phía trên: tạo Deployment rồi `kubectl scale deployment/<tên> --replicas=N`.'
          : `Chỉ Deployment, ReplicaSet và StatefulSet có \`spec.replicas\`. ${kind} thì không.`,
      ].join('\n'),
      accepted: false,
    };
  }
  if (!Number.isFinite(replicas) || replicas < 0 || !Number.isInteger(replicas)) {
    return {
      state,
      output: [
        `error: invalid replicas value "${replicas}"`,
        '`--replicas` phải là một số nguyên không âm. `--replicas=0` là hợp lệ và có nghĩa: giữ lại cấu hình, tắt hết pod.',
      ].join('\n'),
      accepted: false,
    };
  }
  const target = lookup(state, kind, name, namespace);
  if (target === null) {
    return notFoundOutcome(state, kind, name, namespace);
  }
  const before = asNumber(target.spec['replicas']) ?? 1;
  const next = emitEvent(
    replaceObject(state, { ...target, spec: { ...target.spec, replicas } }),
    {
      level: 'info',
      reason: 'ScalingReplicaSet',
      message: `Đổi số replica của ${kind} ${name} từ ${before} sang ${replicas}.`,
      involvedUid: target.uid,
    },
  );
  const note =
    replicas > before
      ? 'Pod mới cần vài tick để được xếp lịch rồi Ready. `kubectl get pods -w` (ở đây: gõ lại `get pods`) để nhìn nó đi qua từng pha.'
      : replicas === before
        ? 'Số replica không đổi — lệnh này không làm gì cả.'
        : 'Pod thừa vào Terminating và biến mất sau grace period, không mất ngay lập tức.';
  return {
    state: next,
    output: [`${kind.toLowerCase()}.apps/${name} scaled`, note].join('\n'),
    accepted: true,
  };
}

// ── rollout ─────────────────────────────────────────────────────────────────

/** ReplicaSet ĐANG được Deployment nhắm tới — tra bằng hash của template hiện tại. */
function currentReplicaSet(state: ClusterState, deployment: K8sObject): K8sObject | null {
  const template = workloadTemplate(deployment);
  if (template === null) {
    return null;
  }
  const name = `${deployment.name}-${templateHash(template)}`;
  return (
    childrenOf(state, deployment.uid).find(
      (item) => item.kind === 'ReplicaSet' && item.name === name,
    ) ?? null
  );
}

function replicaSetsOf(state: ClusterState, deployment: K8sObject): readonly K8sObject[] {
  return [...childrenOf(state, deployment.uid)]
    .filter((item) => item.kind === 'ReplicaSet')
    .sort((a, b) => (asNumber(a.spec['revision']) ?? 0) - (asNumber(b.spec['revision']) ?? 0));
}

function imagesOf(object: K8sObject): string {
  const template = workloadTemplate(object);
  const containers = template === null ? [] : readContainers(template, TICK_MS);
  return containers.map((container) => container.image).join(', ') || '<none>';
}

/**
 * `kubectl rollout`.
 *
 * ⚠ Chỉ Deployment có lịch sử revision trong mô phỏng này, vì lịch sử đó CHÍNH LÀ
 * các ReplicaSet con — không có tầng RS thì không có gì để `undo` về. StatefulSet
 * và DaemonSet cũng nhận `rollout` ở kubectl thật, nhưng cơ chế lưu revision của
 * chúng khác hẳn (ControllerRevision), và giả vờ có nó ở đây sẽ dạy một mô hình
 * sai. Nói thẳng là chưa mô phỏng thì đúng hơn là mô phỏng nửa vời.
 */
function runRollout(
  state: ClusterState,
  sub: RolloutSub,
  kind: ResourceKind,
  name: string,
  namespace: string,
): CommandOutcome {
  if (kind !== 'Deployment') {
    return {
      state,
      output: [
        `error: no rollout history for ${KINDS[kind].plural}/${name}`,
        'Trong game này `kubectl rollout` chỉ chạy cho Deployment — lịch sử revision của Deployment chính là các ReplicaSet con, xem bằng `kubectl get rs`.',
      ].join('\n'),
      accepted: false,
    };
  }
  const deployment = lookup(state, kind, name, namespace);
  if (deployment === null) {
    return notFoundOutcome(state, kind, name, namespace);
  }
  switch (sub) {
    case 'status':
      return rolloutStatus(state, deployment);
    case 'history':
      return rolloutHistory(state, deployment);
    case 'restart':
      return rolloutRestart(state, deployment);
    case 'undo':
      return rolloutUndo(state, deployment);
  }
}

/**
 * `kubectl rollout status` — dòng thật của kubectl, cộng một chỉ dẫn khi treo.
 *
 * Rollout treo là TRIỆU CHỨNG, không phải nguyên nhân: ReplicaSet mới không lên
 * nổi vì pod của nó không bao giờ Ready. Câu trả lời nằm ở `describe` pod của RS
 * MỚI, nên khi treo thì lệnh này chỉ đích danh pod đó — biết phải nhìn RS nào đã
 * là một bước, và đó là bước hay bị lạc nhất.
 */
function rolloutStatus(state: ClusterState, deployment: K8sObject): CommandOutcome {
  const desired = asNumber(deployment.spec['replicas']) ?? 1;
  const rs = currentReplicaSet(state, deployment);
  const pods = rs === null ? [] : podsOwnedBy(state, rs.uid);
  const ready = readyPods(pods).length;
  if (rs !== null && ready >= desired) {
    return {
      state,
      output: `deployment "${deployment.name}" successfully rolled out`,
      accepted: true,
    };
  }
  const stuck = pods.find((pod) => {
    const runtime = podRuntime(pod);
    return runtime !== null && runtime.reason !== null;
  });
  const lines = [
    `Waiting for deployment "${deployment.name}" rollout to finish: ${ready} of ${desired} updated replicas are available...`,
  ];
  if (stuck !== undefined) {
    lines.push(
      `Pod ${stuck.name} của ReplicaSet mới đang ở ${podStatusText(stuck)}. Rollout dừng ở đây theo thiết kế: Kubernetes GIỮ phiên bản cũ đang phục vụ thay vì thay bằng một phiên bản không lên nổi. Đọc \`kubectl describe pod ${stuck.name}\` để biết vì sao.`,
    );
  }
  return { state, output: lines.join('\n'), accepted: true };
}

/**
 * `kubectl rollout history`.
 *
 * ⚠ Cột thứ hai là IMAGE(S) chứ không phải CHANGE-CAUSE như kubectl thật.
 * `CHANGE-CAUSE` đọc từ annotation `kubernetes.io/change-cause`, mà thứ đó chỉ có
 * khi người ta chủ động ghi vào — ở cụm thật nó rỗng gần như mọi lúc. In image ra
 * trả lời đúng câu người chơi đang hỏi ("revision nào chạy image nào") thay vì in
 * một cột `<none>` cho mọi dòng.
 */
function rolloutHistory(state: ClusterState, deployment: K8sObject): CommandOutcome {
  const sets = replicaSetsOf(state, deployment);
  if (sets.length === 0) {
    return {
      state,
      output: `Chưa có revision nào cho deployment "${deployment.name}" — ReplicaSet đầu tiên chỉ ra đời ở tick sau khi Deployment được tạo.`,
      accepted: true,
    };
  }
  const current = currentReplicaSet(state, deployment);
  return {
    state,
    output: [
      `deployment.apps/${deployment.name}`,
      table(
        ['REVISION', 'IMAGE(S)', 'REPLICAS', ''],
        sets.map((rs) => [
          String(asNumber(rs.spec['revision']) ?? 0),
          imagesOf(rs),
          String(asNumber(rs.spec['replicas']) ?? 0),
          current !== null && rs.uid === current.uid ? '(hiện hành)' : '',
        ]),
      ),
    ].join('\n'),
    accepted: true,
  };
}

/**
 * Khoá đánh dấu một lần restart. Đúng tên annotation mà `kubectl rollout restart`
 * thật ghi vào pod template — và cơ chế cũng y hệt: template đổi ⇒ hash đổi ⇒
 * Deployment tạo một ReplicaSet MỚI ⇒ pod được thay dần. Restart KHÔNG phải là
 * "giết pod"; nó là một rollout đầy đủ, và giữ đúng cơ chế này là cách người chơi
 * nhìn thấy điều đó ở `kubectl get rs`.
 *
 * Giá trị là số TICK chứ không phải mốc thời gian thật: `Date.now()` sẽ làm hai
 * lần phát lại cùng một `RunLog` sinh ra hai hash khác nhau, và mọi lượt chơi
 * trung thực đều bị báo gian lận.
 */
const RESTART_MARKER = 'kubectl.kubernetes.io/restartedAt';

function rolloutRestart(state: ClusterState, deployment: K8sObject): CommandOutcome {
  const template = workloadTemplate(deployment);
  if (template === null) {
    return {
      state,
      output: [
        `error: deployment "${deployment.name}" has no pod template`,
        'Deployment thiếu `spec.template` thì không có gì để restart. Kiểm lại manifest.',
      ].join('\n'),
      accepted: false,
    };
  }
  const next = replaceObject(state, {
    ...deployment,
    spec: {
      ...deployment.spec,
      template: { ...template, [RESTART_MARKER]: state.tick },
      revision: (asNumber(deployment.spec['revision']) ?? 0) + 1,
    },
  });
  return {
    state: emitEvent(next, {
      level: 'info',
      reason: 'ScalingReplicaSet',
      message: `Restart Deployment ${deployment.name}: pod template đổi, một ReplicaSet mới sẽ lên thay dần.`,
      involvedUid: deployment.uid,
    }),
    output: [
      `deployment.apps/${deployment.name} restarted`,
      'Restart không phải là giết pod: template vừa đổi nên Deployment tạo một ReplicaSet mới và thay pod dần dần. `kubectl get rs` sẽ thấy cả hai cùng tồn tại một lúc.',
    ].join('\n'),
    accepted: true,
  };
}

/**
 * `kubectl rollout undo` — quay về ReplicaSet có revision liền trước.
 *
 * ⚠ Phải GỠ nhãn `pod-template-hash` khỏi template trước khi ghi ngược vào
 * Deployment. Nhãn đó do controller thêm vào template CỦA ReplicaSet; chép cả nó
 * về Deployment sẽ làm hash của template khác hash cũ, và Deployment tạo ra một
 * ReplicaSet THỨ BA thay vì quay lại cái đã có. Triệu chứng sẽ là "undo xong vẫn
 * hỏng, mà lại thừa một RS" — rất khó truy nếu không biết chỗ này.
 */
function rolloutUndo(state: ClusterState, deployment: K8sObject): CommandOutcome {
  const sets = replicaSetsOf(state, deployment);
  const current = currentReplicaSet(state, deployment);
  const previous =
    [...sets].reverse().find((rs) => current === null || rs.uid !== current.uid) ?? null;
  if (previous === null) {
    return {
      state,
      output: [
        `error: no rollout history found for deployment "${deployment.name}"`,
        'Chỉ có đúng một revision nên không có chỗ nào để quay về. `rollout undo` cần ít nhất hai ReplicaSet — xem `kubectl get rs`.',
      ].join('\n'),
      accepted: false,
    };
  }
  const restored = stripHashLabel(workloadTemplate(previous));
  if (restored === null) {
    return {
      state,
      output: `error: ReplicaSet "${previous.name}" không còn pod template để khôi phục.`,
      accepted: false,
    };
  }
  const next = replaceObject(state, {
    ...deployment,
    spec: { ...deployment.spec, template: restored },
  });
  const revision = asNumber(previous.spec['revision']) ?? 0;
  return {
    state: emitEvent(next, {
      level: 'info',
      reason: 'DeploymentRollback',
      message: `Deployment ${deployment.name} quay về revision ${revision}.`,
      involvedUid: deployment.uid,
    }),
    output: [
      `deployment.apps/${deployment.name} rolled back`,
      `Quay về revision ${revision} (image: ${imagesOf(previous)}). ReplicaSet cũ được scale lên lại — nó chưa từng bị xoá, và đó chính là thứ làm undo chạy xong trong vài giây.`,
    ].join('\n'),
    accepted: true,
  };
}

function stripHashLabel(
  template: Readonly<Record<string, unknown>> | null,
): Readonly<Record<string, unknown>> | null {
  if (template === null) {
    return null;
  }
  const labels = asStringMap(template['labels']);
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(labels)) {
    if (key !== 'pod-template-hash') {
      rest[key] = value;
    }
  }
  const out: Record<string, unknown> = { ...template };
  // Không còn nhãn nào thì XOÁ hẳn khoá `labels` chứ không để lại `{}`: template
  // gốc của người chơi có thể vốn không có khoá đó, và `{}` cho ra một hash khác.
  if (Object.keys(rest).length === 0) {
    delete out['labels'];
  } else {
    out['labels'] = rest;
  }
  return out;
}

// ── Hai lệnh cần một thứ mà trình duyệt không có ────────────────────────────

/**
 * `kubectl apply -f <tệp>` cần một hệ tệp; `kubectl edit` cần `$EDITOR`. Trò chơi
 * chạy trong trình duyệt và không có cả hai.
 *
 * Câu trả lời KHÔNG được là "lệnh không hỗ trợ": người chơi vừa gõ đúng cú pháp
 * thật và xứng đáng biết đường đi tương đương trong game. Cả hai hành động đều
 * tồn tại ở đây, chỉ là đi qua bảng YAML chứ không qua thanh lệnh.
 */
function applyNotSupported(filename: string | null): string {
  return [
    `error: the path ${filename === null ? '<không nêu>' : `"${filename}"`} does not exist`,
    'Game chạy trong trình duyệt nên không có hệ tệp để `-f` trỏ tới. Dán manifest vào bảng YAML rồi bấm áp dụng — kết quả giống hệt `kubectl apply -f`, kể cả phần tạo-hoặc-cập-nhật.',
  ].join('\n');
}

function runEdit(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
): CommandOutcome {
  const target = lookup(state, kind, name, namespace);
  if (target === null) {
    return notFoundOutcome(state, kind, name, namespace);
  }
  return {
    state,
    output: [
      'error: unable to launch the editor "vi"',
      `\`kubectl edit\` mở trình soạn thảo trong terminal, thứ không tồn tại ở đây. Mở ${kind} "${name}" trong bảng YAML rồi sửa và áp dụng lại — đó đúng là việc mà \`edit\` làm: đọc object hiện tại, sửa, gửi lại.`,
    ].join('\n'),
    accepted: false,
  };
}
