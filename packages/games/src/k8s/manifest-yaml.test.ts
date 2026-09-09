import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels/index.ts';
import { toManifestYaml } from './manifest-yaml.ts';
import type { K8sObject } from './model.ts';
import { initialState } from './reducer.ts';
import { parseManifests } from './yaml.ts';

const SEED = 7;

/** Mọi object có thật trong cả 36 level — tập hình dạng rộng nhất repo này có. */
function everyObject(): readonly { readonly level: string; readonly object: K8sObject }[] {
  const all: { level: string; object: K8sObject }[] = [];
  for (const level of LEVELS) {
    for (const object of initialState(level, SEED).objects) {
      all.push({ level: level.id, object });
    }
  }
  return all;
}

describe('toManifestYaml', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG cho cả file. Không có ô này, mọi ô dưới sẽ xanh một cách
   * rỗng nghĩa nếu `everyObject()` trả về mảng rỗng — và một vòng `for` trên
   * mảng rỗng không bao giờ đỏ.
   */
  it('có đủ object để đo, và có cả loại mang spec lồng nhau', () => {
    const all = everyObject();
    expect(all.length).toBeGreaterThan(50);
    expect(all.some(({ object }) => Array.isArray(object.spec['containers']))).toBe(true);
    expect(all.some(({ object }) => object.spec['template'] !== undefined)).toBe(true);
  });

  /**
   * BẤT BIẾN TRUNG TÂM: `parse(serialize(x))` trả lại đúng `x`.
   *
   * Đây là điều kiện để "bấm Lưu mà không sửa gì" là một phép KHÔNG LÀM GÌ. Khi
   * nó vỡ, hậu quả không phải một lỗi — mà là `editResource` ghi đè `spec` bằng
   * một bản thiếu field, im lặng. Đã xảy ra thật một lần: ô soạn thảo hiện
   * manifest KHÔNG có `spec`, và một cú Lưu xoá sạch container của pod.
   */
  it('phát ra manifest mà `parseManifests` đọc lại RA ĐÚNG object ban đầu', () => {
    for (const { level, object } of everyObject()) {
      const yaml = toManifestYaml(object);
      const parsed = parseManifests(yaml, object.namespace === '' ? 'default' : object.namespace);

      expect(parsed.ok, `${level} · ${object.kind}/${object.name}\n${yaml}\n${parsed.ok ? '' : parsed.error}`).toBe(true);
      if (!parsed.ok) {
        continue;
      }
      const back = parsed.manifests[0];
      expect(back, `${level} · ${object.kind}/${object.name}`).toBeDefined();
      if (back === undefined) {
        continue;
      }
      const where = `${level} · ${object.kind}/${object.name}\n${yaml}`;
      expect(back.kind, where).toBe(object.kind);
      expect(back.name, where).toBe(object.name);
      expect(back.namespace, where).toBe(object.namespace);
      expect(back.spec, where).toEqual(object.spec);
    }
  });

  it('không in `uid`, `status` hay `ownerReferences`', () => {
    for (const { object } of everyObject()) {
      const yaml = toManifestYaml(object);
      expect(yaml).not.toMatch(/^\s*uid:/m);
      expect(yaml).not.toMatch(/^status:/m);
      expect(yaml).not.toMatch(/ownerReferences/);
    }
  });

  it('bọc nháy những chuỗi mà YAML sẽ đọc nhầm thành số hay boolean', () => {
    const object: K8sObject = {
      uid: 'o1',
      kind: 'ConfigMap',
      name: 'cau-hinh',
      namespace: 'mac-dinh',
      labels: {},
      spec: { data: { version: '1.27', bat: 'yes', rong: '' } },
      ownerUid: null,
      createdTick: 0,
      runtime: { kind: 'none' },
    };
    const parsed = parseManifests(toManifestYaml(object), 'mac-dinh');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Không có nháy thì `1.27` quay lại thành SỐ và `yes` thành `true`.
      expect(parsed.manifests[0]?.spec).toEqual(object.spec);
    }
  });
});
