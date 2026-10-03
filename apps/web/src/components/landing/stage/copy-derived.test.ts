import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import { layerLabels, stageNames } from './copy-derived';

/**
 * Nhãn trong cảnh 3D suy ra từ chữ của `packages/copy`. Đọc bằng CHÍNH chữ đó để một lần sửa copy
 * làm hỏng cách suy (đổi tiền tố, đổi dấu ngoặc) thì ô này đỏ, thay vì cảnh 3D hiện nhãn rỗng.
 */

describe('copy-derived · layerLabels', () => {
  const labels = layerLabels(t('home.term.out.build'));

  it('cho đúng năm nhãn: bốn layer và một dòng TAG', () => {
    expect(labels).toHaveLength(5);
  });

  it('nhãn đầu bắt đầu bằng FROM, nhãn cuối là TAG web:1.0', () => {
    expect(labels[0]?.startsWith('FROM')).toBe(true);
    expect(labels[labels.length - 1]).toBe('TAG web:1.0');
  });

  it('đã bóc tiền tố "=> [n/4]" và đường dẫn registry', () => {
    for (const label of labels) {
      expect(label).not.toMatch(/=>|\[\d+\/\d+\]|docker\.io/);
      expect(label).toBe(label.trim());
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('bỏ dòng tiêu đề đầu tiên của output', () => {
    expect(layerLabels('[+] Building 1.0s\n => [1/1] FROM scratch')).toEqual(['FROM scratch']);
  });
});

describe('copy-derived · stageNames', () => {
  it('đọc bốn stage từ lệnh của ga CI/CD', () => {
    expect(stageNames(t('home.station.cicd.cmd'))).toEqual(['build', 'test', 'scan', 'deploy']);
  });

  it('không có ngoặc vuông thì trả mảng rỗng', () => {
    expect(stageNames('stages: build, test')).toEqual([]);
  });

  it('bỏ tên rỗng và khoảng trắng thừa', () => {
    expect(stageNames('[ a , , b ]')).toEqual(['a', 'b']);
  });
});
