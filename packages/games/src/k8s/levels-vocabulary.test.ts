import { describe, expect, it } from 'vitest';
import type { ClusterSpec, ResourceSpec } from './contract.ts';
import { CHALLENGES } from './challenges.ts';
import { LEVELS } from './levels/index.ts';
import {
  CONTAINER_FIELDS,
  KINDS,
  POD_TEMPLATE_FIELDS,
  PROBE_FIELDS,
  VOLUME_FIELDS,
  isNamespaced,
} from './resources.ts';

/**
 * ⭐ Cổng DUY NHẤT bắt được lệch từ vựng giữa lane C (viết level) và lane B (đọc
 * level).
 *
 * `ResourceSpec.spec` là `Record<string, unknown>` — cố ý lỏng, vì 26 loại nhân
 * mọi field thật của Kubernetes là một cây kiểu khổng lồ mà 35 level chỉ chạm
 * một góc. Cái giá của sự lỏng đó là: một level viết `replicaCount` trong khi
 * engine đọc `replicas` sẽ **không sinh lỗi biên dịch, không làm đỏ test nào, và
 * không ném lúc chạy**. Nó chỉ dựng ra một cụm sai, và triệu chứng duy nhất là
 * một người chơi báo "level này không chạy được".
 *
 * Không có ô nào khác trong toàn bộ suite bắt được lớp lỗi đó. Đây là nó.
 *
 * ⚠ Cổng này chỉ có nghĩa khi bảng field ở `resources.ts` thật sự là bộ field
 * ĐƯỢC ĐỌC. Thêm một dòng vào bảng để làm cổng xanh, mà không viết mã đọc field
 * đó, là biến cổng thành đồ trang trí — xem chú thích tại `CONTAINER_FIELDS`.
 */

interface Offender {
  readonly where: string;
  readonly field: string;
}

function keysOf(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value as Record<string, unknown>);
}

function entriesOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[name];
}

function checkProbes(container: unknown, where: string, out: Offender[]): void {
  for (const probeName of ['readinessProbe', 'livenessProbe', 'startupProbe']) {
    const probe = field(container, probeName);
    if (probe === undefined) {
      continue;
    }
    for (const key of keysOf(probe)) {
      if (!PROBE_FIELDS.includes(key)) {
        out.push({ where: `${where}.${probeName}`, field: key });
      }
    }
    // `httpGet` / `tcpSocket` lồng thêm một tầng và dùng chung bộ field.
    for (const nested of ['httpGet', 'tcpSocket']) {
      const inner = field(probe, nested);
      for (const key of keysOf(inner)) {
        if (!PROBE_FIELDS.includes(key)) {
          out.push({ where: `${where}.${probeName}.${nested}`, field: key });
        }
      }
    }
  }
}

/** `podSpec` = spec của Pod, hoặc `template` phẳng của workload. Cùng bộ field. */
function checkPodSpec(spec: unknown, where: string, out: Offender[]): void {
  for (const key of keysOf(spec)) {
    if (!POD_TEMPLATE_FIELDS.includes(key)) {
      out.push({ where, field: key });
    }
  }
  const containers = [...entriesOf(field(spec, 'containers')), ...entriesOf(field(spec, 'initContainers'))];
  for (const container of containers) {
    const name = field(container, 'name');
    const at = `${where}.containers[${typeof name === 'string' ? name : '?'}]`;
    for (const key of keysOf(container)) {
      if (!CONTAINER_FIELDS.includes(key)) {
        out.push({ where: at, field: key });
      }
    }
    checkProbes(container, at, out);
  }
  for (const volume of entriesOf(field(spec, 'volumes'))) {
    for (const key of keysOf(volume)) {
      if (!VOLUME_FIELDS.includes(key)) {
        out.push({ where: `${where}.volumes`, field: key });
      }
    }
  }
}

function checkResource(resource: ResourceSpec, where: string, out: Offender[]): void {
  const known = KINDS[resource.kind].specFields;
  for (const key of keysOf(resource.spec)) {
    if (!known.includes(key)) {
      out.push({ where: `${where} ${resource.kind}/${resource.name}`, field: key });
    }
  }
  if (resource.kind === 'Pod') {
    checkPodSpec(resource.spec, `${where} ${resource.kind}/${resource.name}`, out);
    return;
  }
  const template = field(resource.spec, 'template');
  if (template !== undefined) {
    checkPodSpec(template, `${where} ${resource.kind}/${resource.name}.template`, out);
  }
  const jobTemplate = field(field(resource.spec, 'jobTemplate'), 'template');
  if (jobTemplate !== undefined) {
    checkPodSpec(jobTemplate, `${where} ${resource.kind}/${resource.name}.jobTemplate`, out);
  }
}

function auditSpec(spec: ClusterSpec, where: string): readonly Offender[] {
  const out: Offender[] = [];
  for (const resource of spec.resources) {
    checkResource(resource, where, out);
  }
  return out;
}

function describeOffenders(offenders: readonly Offender[]): readonly string[] {
  return offenders.map((offender) => `${offender.where}: field lạ "${offender.field}"`);
}

describe('từ vựng spec — level phải nói đúng thứ tiếng engine đọc', () => {
  it('35 level không đặt field nào engine không đọc', () => {
    const offenders = LEVELS.flatMap((level) => auditSpec(level.initialState, level.id));
    expect(describeOffenders(offenders)).toEqual([]);
  });

  it('challenge cũng vậy — cùng engine, cùng từ vựng', () => {
    const offenders = CHALLENGES.flatMap((challenge) =>
      auditSpec(challenge.initialState, challenge.id),
    );
    expect(describeOffenders(offenders)).toEqual([]);
  });

  /**
   * Đối chứng DƯƠNG. Không có ô này thì một `auditSpec` luôn trả mảng rỗng — vì
   * lỗi gõ, vì một `keysOf` trả sai, vì một điều kiện đảo ngược — vẫn làm hai ô
   * trên xanh vĩnh viễn. Một cổng chưa từng thấy đỏ là một cổng chưa được chứng
   * minh (`rules/green-that-proves-nothing.md`).
   */
  it('BẮT được một field lạ khi thật sự có một field lạ', () => {
    const offenders = auditSpec(
      {
        nodes: [],
        namespaces: ['ns'],
        resources: [
          {
            kind: 'Deployment',
            name: 'sai',
            namespace: 'ns',
            spec: {
              replicaCount: 3,
              template: {
                labels: { app: 'sai' },
                containers: [
                  {
                    name: 'c',
                    image: 'nginx:1.27-alpine',
                    imagen: 'go nham',
                    readinessProbe: { cong: 8080 },
                  },
                ],
                volumes: [{ name: 'v', pvc: {} }],
              },
            },
          },
        ],
      },
      'fixture',
    );
    const messages = describeOffenders(offenders);
    // Bắt được ở CẢ BỐN tầng lồng nhau, không chỉ tầng ngoài cùng.
    expect(messages).toContain('fixture Deployment/sai: field lạ "replicaCount"');
    expect(messages).toContain('fixture Deployment/sai.template.containers[c]: field lạ "imagen"');
    expect(messages).toContain(
      'fixture Deployment/sai.template.containers[c].readinessProbe: field lạ "cong"',
    );
    expect(messages).toContain('fixture Deployment/sai.template.volumes: field lạ "pvc"');
  });

  /**
   * Tài nguyên phạm vi cluster phải khai `namespace: ''`.
   *
   * `createCluster` ép về chuỗi rỗng dù level ghi gì, nên một level ghi
   * `namespace: 'default'` cho một PersistentVolume vẫn CHẠY — nhưng nó đọc sai,
   * và người viết level tiếp theo sẽ chép lại. Bắt ở đây chứ không im lặng sửa hộ.
   */
  it('tài nguyên phạm vi cluster khai namespace rỗng', () => {
    const wrong: string[] = [];
    for (const level of LEVELS) {
      for (const resource of level.initialState.resources) {
        if (!isNamespaced(resource.kind) && resource.namespace !== '') {
          wrong.push(`${level.id} ${resource.kind}/${resource.name} → "${resource.namespace}"`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  /**
   * `phase` trên pod spec KHÔNG phải Kubernetes thật (nó thuộc `status`). Lane C
   * dùng nó để gieo một pod đã kết thúc, và l04 cần đúng thứ đó để dạy rằng
   * `Succeeded` không phải lỗi.
   *
   * ⚠ Bản đầu của ô này khẳng định "không level nào đặt `Running`" — và nó ĐỎ
   * ngay lần chạy đầu: l04 đặt `phase: 'Running'` cho pod `web`. Đọc l04 thì
   * cách dùng đó vô hại: `web` là một nginx bình thường, không mang
   * `seededIncident`, và nó sẽ tự tới Running sau vài tick dù có gieo hay không;
   * gieo sẵn chỉ để bảng ba-pod-ba-trạng-thái hiện đủ ngay từ tick 0.
   *
   * Nên ràng buộc ĐÚNG không phải "cấm Running" mà là "Running không được dùng
   * để né một sự cố" — tức là không đi kèm `seededIncident`. Đó là điều lead
   * thật sự lo, và nó kiểm được bằng máy. Ghim lại phiên bản chặt hơn sẽ bắt lane
   * C sửa một level không sai.
   */
  it('phase gieo sẵn chỉ nhận trạng thái kết thúc, hoặc Running KHÔNG kèm sự cố', () => {
    const bad: string[] = [];
    for (const level of LEVELS) {
      for (const resource of level.initialState.resources) {
        const phase = field(resource.spec, 'phase');
        if (typeof phase !== 'string') {
          continue;
        }
        const at = `${level.id} ${resource.kind}/${resource.name}`;
        if (phase !== 'Succeeded' && phase !== 'Failed' && phase !== 'Running') {
          bad.push(`${at} → phase: "${phase}" (chỉ nhận Succeeded, Failed, Running)`);
          continue;
        }
        // ⛔ Đây là cái bẫy thật: tuyên bố pod đã Running rồi gieo một sự cố lên
        // chính nó nghĩa là mục tiêu có thể đạt ngay ở tick 0 mà người chơi
        // không làm gì — level trông như đã giải sẵn.
        if (phase === 'Running' && resource.seededIncident !== undefined) {
          bad.push(`${at} → phase Running kèm seededIncident "${resource.seededIncident}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('BẮT được một phase gieo sẵn dùng để né sự cố', () => {
    // Đối chứng dương cho ô ngay trên: viết tay đúng cái hình dạng bị cấm và
    // khẳng định phép kiểm nhận ra nó.
    const resource: ResourceSpec = {
      kind: 'Pod',
      name: 'ne-su-co',
      namespace: 'ns',
      spec: { labels: {}, phase: 'Running', containers: [{ name: 'c', image: 'nginx:1.27-alpine' }] },
      seededIncident: 'image-tag-sai',
    };
    const phase = field(resource.spec, 'phase');
    expect(phase === 'Running' && resource.seededIncident !== undefined).toBe(true);
  });
});
