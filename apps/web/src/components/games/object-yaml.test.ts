import { describe, expect, it } from 'vitest';
import { objectToYaml, shortLabel, yamlScalar } from './object-yaml';
import { podView, serviceView } from './test-fixtures';

describe('yamlScalar', () => {
  it('để trần tên tài nguyên bình thường', () => {
    expect(yamlScalar('web-1')).toBe('web-1');
    expect(yamlScalar('kube-system')).toBe('kube-system');
    expect(yamlScalar('app.kubernetes.io')).toBe('app.kubernetes.io');
  });

  /**
   * YAML 1.1 đọc `no` / `yes` / `on` / `off` thành boolean. Một namespace tên
   * `no` in ra không ngoặc là một dòng NÓI DỐI trong inspector — người học copy
   * nó sang `kubectl` thật sẽ gõ một giá trị khác với thứ họ vừa đọc.
   */
  it('đóng ngoặc chuỗi mà YAML sẽ đọc thành boolean', () => {
    for (const value of ['no', 'yes', 'on', 'off', 'true', 'false', 'null', 'NO', 'Yes', '~', 'y', 'n']) {
      expect(yamlScalar(value), value).toBe(`'${value}'`);
    }
  });

  it('đóng ngoặc chuỗi trông như số', () => {
    expect(yamlScalar('123')).toBe("'123'");
    expect(yamlScalar('-1')).toBe("'-1'");
    expect(yamlScalar('.5')).toBe("'.5'");
  });

  it('đóng ngoặc chuỗi rỗng và chuỗi có ký tự cấu trúc', () => {
    expect(yamlScalar('')).toBe("''");
    expect(yamlScalar('a: b')).toBe("'a: b'");
    expect(yamlScalar('# ghi chú')).toBe("'# ghi chú'");
    expect(yamlScalar('- mục')).toBe("'- mục'");
  });

  /**
   * Dấu nháy đơn chỉ đặc biệt khi nó MỞ ĐẦU một scalar. `d'artagnan` để trần là
   * YAML hợp lệ và phân tích lại ra đúng chuỗi cũ, nên không đóng ngoặc là đúng
   * — đóng thừa chỉ làm inspector khác với thứ `kubectl` in ra.
   *
   * Ô này ban đầu viết ngược (đòi đóng ngoặc mọi chuỗi có nháy) và ĐỎ. Giữ lại
   * cả hai chiều thay vì sửa cho xanh: chiều dưới mới là chiều phép nhân đôi
   * thật sự phải chạy — khi việc đóng ngoặc đã bị kích hoạt vì một lý do khác.
   */
  it('để trần nháy đơn ở giữa, nhưng nhân đôi khi đã phải đóng ngoặc', () => {
    expect(yamlScalar("d'artagnan")).toBe("d'artagnan");
    expect(yamlScalar("d'artagnan là ai")).toBe("'d''artagnan là ai'");
    expect(yamlScalar("'mo-dau-bang-nhay")).toBe("'''mo-dau-bang-nhay'");
  });
});

describe('objectToYaml', () => {
  it('in pod đang chạy theo thứ tự kubectl quen thuộc', () => {
    expect(objectToYaml(podView('u-1', 'web-1'))).toBe(
      ['kind: Pod', 'metadata:', '  name: web-1', '  namespace: default', 'status:', '  phase: Running', '  nodeName: node-a'].join(
        '\n',
      ),
    );
  });

  it('in reason khi có sự cố', () => {
    const yaml = objectToYaml(
      podView('u-1', 'web-1', { phase: 'Running', reason: 'CrashLoopBackOff', statusToken: 'destructive' }),
    );
    expect(yaml).toContain('  phase: Running');
    expect(yaml).toContain('  reason: CrashLoopBackOff');
  });

  /**
   * `phase` và `reason` là HAI TRỤC (hợp đồng `contract.ts`). Inspector phải in
   * cả hai chứ không gộp — nếu gộp, nó dạy người học rằng `CrashLoopBackOff` là
   * một phase, mà nó chưa bao giờ là.
   */
  it('giữ phase và reason tách nhau trên hai dòng', () => {
    const lines = objectToYaml(podView('u-1', 'x', { phase: 'Running', reason: 'OOMKilled' })).split('\n');
    expect(lines.filter((l) => l.trim().startsWith('phase:'))).toHaveLength(1);
    expect(lines.filter((l) => l.trim().startsWith('reason:'))).toHaveLength(1);
  });

  it('bỏ hẳn khối status khi object không có trạng thái nào', () => {
    expect(objectToYaml(serviceView('svc-1', 'web'))).toBe(
      ['kind: Service', 'metadata:', '  name: web', '  namespace: default'].join('\n'),
    );
  });

  it('in ownerReferences khi có chủ sở hữu', () => {
    const yaml = objectToYaml(podView('u-1', 'web-1', { ownerUid: 'rs-web' }));
    expect(yaml).toContain('  ownerReferences');
    expect(yaml).toContain('    - uid: rs-web');
  });

  /**
   * `uid` là khoá NỘI BỘ của renderer. Hợp đồng nói rõ khoá tự nhiên của K8s là
   * bộ ba (kind, namespace, name); in `uid` ra như một field metadata sẽ dạy một
   * khoá không tồn tại trong `kubectl` thật.
   */
  it('không in uid của chính object', () => {
    expect(objectToYaml(podView('uid-noi-bo', 'web-1'))).not.toContain('uid-noi-bo');
  });

  it('không có node thì không in nodeName', () => {
    expect(objectToYaml(podView('u-1', 'x', { nodeName: null, phase: 'Pending' }))).not.toContain('nodeName');
  });
});

describe('shortLabel', () => {
  it('viết như kubectl viết', () => {
    expect(shortLabel(podView('u-1', 'web-1'))).toBe('pod/web-1');
    expect(shortLabel(serviceView('s-1', 'web'))).toBe('service/web');
  });
});
