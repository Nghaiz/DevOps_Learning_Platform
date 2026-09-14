import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import { PREDICATE_NAMES } from '@devops-platform/games';
import { PREDICATE_SPECS } from './predicate-spec';
import { INCIDENT_KINDS, RESOURCE_KINDS } from './vocabulary';
import { countWords, normalizeTag, parseTags, toSlug } from './text-tools';

describe('bảng vị từ bám sát hợp đồng', () => {
  it('phủ ĐÚNG 32 tên trong PREDICATE_NAMES, không thiếu không thừa', () => {
    const table = Object.keys(PREDICATE_SPECS).sort();
    expect(table).toEqual([...PREDICATE_NAMES].sort());
    expect(PREDICATE_NAMES.length).toBe(32);
  });

  it('mọi vị từ có nhãn tiếng Việt và mọi tham số có nhãn', () => {
    for (const name of PREDICATE_NAMES) {
      const spec = PREDICATE_SPECS[name];
      expect(t(spec.label).trim(), name).not.toBe('');
      for (const arg of spec.args) {
        expect(arg.key.trim(), `${name}.${arg.key}`).not.toBe('');
        expect(t(arg.label).trim(), `${name}.${arg.key}`).not.toBe('');
      }
    }
  });

  it('mọi khoá trong requireOneOf đều có mặt trong danh sách tham số', () => {
    for (const name of PREDICATE_NAMES) {
      const spec = PREDICATE_SPECS[name];
      for (const key of spec.requireOneOf ?? []) {
        expect(
          spec.args.some((arg) => arg.key === key),
          `${name} › requireOneOf "${key}" không có ô tương ứng`,
        ).toBe(true);
      }
    }
  });
});

describe('bản sao tập đóng', () => {
  it('26 loại tài nguyên và 32 loại sự cố', () => {
    expect(RESOURCE_KINDS.length).toBe(26);
    expect(INCIDENT_KINDS.length).toBe(32);
    expect(new Set(RESOURCE_KINDS).size).toBe(RESOURCE_KINDS.length);
    expect(new Set(INCIDENT_KINDS).size).toBe(INCIDENT_KINDS.length);
  });
});

describe('phép biến đổi chuỗi', () => {
  it('đ và Đ ra "d", không bị nuốt mất', () => {
    expect(toSlug('Đội ngũ vận hành')).toBe('doi-ngu-van-hanh');
    expect(toSlug('đổi image')).toBe('doi-image');
  });

  it('tag chuẩn hoá về thường + gạch nối, bỏ trùng, giữ thứ tự', () => {
    expect(normalizeTag('Chẩn Đoán')).toBe('chan-doan');
    expect(parseTags('CrashLoop, chan-doan, crashloop')).toEqual(['crashloop', 'chan-doan']);
  });

  it('đếm từ theo cùng công thức với cổng gác', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
    expect(countWords('một hai   ba\nbốn')).toBe(4);
  });
});
