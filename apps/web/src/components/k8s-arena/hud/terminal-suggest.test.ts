import { describe, expect, it } from 'vitest';
import type { ObjectView } from '@devops-platform/games';
import { podView, serviceView } from '../shared/test-fixtures';
import { applySuggestion, suggestTokens } from './terminal-suggest';

const OBJECTS: readonly ObjectView[] = [
  podView('u-1', 'web-1'),
  podView('u-2', 'web-2'),
  serviceView('s-1', 'api'),
];

function values(input: string): readonly string[] {
  return suggestTokens(input, OBJECTS).map((s) => s.value);
}

describe('suggestTokens', () => {
  it('gợi ý động từ sau `kubectl`', () => {
    expect(values('kubectl ')).toContain('get');
    expect(values('kubectl de')).toContain('describe');
  });

  /**
   * ĐÂY LÀ Ô CHÍNH của file.
   *
   * Gợi ý loại tài nguyên và tên object từng KHÔNG BAO GIỜ xuất hiện: hai hàm
   * đếm vị trí đối số theo hai quy ước khác nhau (`positionalIndex` đếm cả
   * `kubectl` và động từ, `lastPositional` thì không), nên `kubectl get ` rơi
   * vào nhánh "tên object" và nhánh đó tra loại bằng một chuỗi rỗng. Kết quả là
   * danh sách RỖNG — hỏng hoàn toàn im lặng, vì rỗng trông y hệt "không có gì
   * để gợi ý".
   */
  it('gợi ý LOẠI tài nguyên ở đối số đầu của động từ', () => {
    expect(values('kubectl get ')).toContain('pods');
    expect(values('kubectl get po')).toContain('pods');
    expect(values('kubectl describe ')).toContain('services');
    expect(values('kubectl delete ')).toContain('pods');
  });

  it('gợi ý TÊN object ở đối số thứ hai', () => {
    expect(values('kubectl get pods ')).toEqual(expect.arrayContaining(['web-1', 'web-2']));
    expect(values('kubectl get pods web-')).toEqual(expect.arrayContaining(['web-1', 'web-2']));
    // Loại khác thì không được lẫn vào.
    expect(values('kubectl get pods ')).not.toContain('api');
  });

  it('tên rút gọn của loại vẫn tra ra đúng object', () => {
    expect(values('kubectl get po ')).toEqual(expect.arrayContaining(['web-1', 'web-2']));
    expect(values('kubectl get svc ')).toContain('api');
  });

  it('logs và exec chỉ gợi ý pod, ngay ở đối số đầu', () => {
    expect(values('kubectl logs ')).toEqual(expect.arrayContaining(['web-1', 'web-2']));
    expect(values('kubectl logs ')).not.toContain('api');
    expect(values('kubectl exec ')).toEqual(expect.arrayContaining(['web-1', 'web-2']));
  });

  it('rollout: lệnh con, rồi loại, rồi tên', () => {
    expect(values('kubectl rollout ')).toContain('restart');
    expect(values('kubectl rollout restart ')).toContain('pods');
  });

  /**
   * Cờ đứng TRƯỚC động từ là cú pháp hợp lệ, và nó không được làm lệch cách đếm
   * vị trí — đây chính là lý do `positionalIndex` tồn tại thay vì đọc chỉ số mảng.
   */
  it('cờ mang giá trị không làm lệch vị trí đối số', () => {
    expect(values('kubectl -n hoc-tap get ')).toContain('pods');
    expect(values('kubectl get -n hoc-tap ')).toContain('pods');
  });

  it('gợi ý cờ khi đang gõ dấu gạch', () => {
    expect(values('kubectl get pods -').some((v) => v.startsWith('-'))).toBe(true);
  });

  it('lệnh không bắt đầu bằng kubectl thì không gợi ý gì', () => {
    expect(values('ls -la')).toEqual([]);
  });

  it('ô trống gợi ý chính `kubectl`', () => {
    expect(values('')).toEqual(['kubectl']);
  });
});

describe('applySuggestion', () => {
  it('thay token đang gõ dở và chừa một dấu cách', () => {
    expect(applySuggestion('kubectl get po', 'pods')).toBe('kubectl get pods ');
  });

  it('nối thêm khi đang ở đầu một token mới', () => {
    expect(applySuggestion('kubectl get ', 'pods')).toBe('kubectl get pods ');
  });

  /** Token cuối trùng chữ với một token trước đó — `lastIndexOf` sẽ cắt nhầm. */
  it('cắt đúng khi token cuối trùng với token trước', () => {
    expect(applySuggestion('kubectl get pod pod', 'pods')).toBe('kubectl get pod pods ');
  });
});
