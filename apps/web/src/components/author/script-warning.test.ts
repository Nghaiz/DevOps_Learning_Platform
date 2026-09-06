import { describe, expect, it } from 'vitest';
import {
  describeScriptReport,
  summarizeScriptChecks,
  type ScriptWarningView,
  type ShellcheckReportView,
} from './script-warning';

function report(over: Partial<ShellcheckReportView> = {}): ShellcheckReportView {
  return { available: true, findings: [], unavailableReason: null, ...over };
}

const finding = { line: 3, level: 'warning', code: 'SC2086', message: 'Double quote to prevent globbing' };

describe('describeScriptReport — "chưa kiểm được" KHÁC "sạch"', () => {
  it('không chạy được cho tone unknown, không phải clean', () => {
    const view = describeScriptReport(report({ available: false, unavailableReason: 'không có shellcheck' }));
    expect(view.tone).toBe('unknown');
    expect(view.tone).not.toBe('clean');
  });

  it('nhãn KHÔNG được chứa chữ nào nói rằng script đã qua', () => {
    const view = describeScriptReport(report({ available: false, unavailableReason: 'timeout' }));
    expect(view.label).toBe('Chưa kiểm được');
    expect(view.label).not.toContain('Không có cảnh báo');
    expect(view.detail).toContain('KHÔNG phải "script sạch"');
  });

  it('lý do không chạy được đi kèm để người soạn biết phải làm gì', () => {
    expect(describeScriptReport(report({ available: false, unavailableReason: 'timeout' })).detail).toContain(
      'timeout',
    );
  });

  it('thiếu lý do vẫn KHÔNG được rơi về clean', () => {
    const view = describeScriptReport(report({ available: false }));
    expect(view.tone).toBe('unknown');
    expect(view.detail).toContain('Không rõ lý do');
  });

  it('chạy được và sạch mới là clean', () => {
    expect(describeScriptReport(report()).tone).toBe('clean');
  });

  it('chạy được và có phát hiện là warn, kèm câu nói rõ nó không chặn', () => {
    const view = describeScriptReport(report({ findings: [finding, { ...finding, line: 9 }] }));
    expect(view.tone).toBe('warn');
    expect(view.label).toBe('2 cảnh báo');
    expect(view.detail).toContain('KHÔNG chặn');
  });
});

describe('summarizeScriptChecks — một script chưa kiểm được kéo cả tóm tắt xuống', () => {
  const unavailable: ScriptWarningView = {
    path: 'steps[0].verifyScript',
    report: report({ available: false, unavailableReason: 'không có shellcheck' }),
  };
  const withFindings: ScriptWarningView = {
    path: 'steps[1].verifyScript',
    report: report({ findings: [finding] }),
  };

  it('trộn "có cảnh báo" với "chưa kiểm được" thì tóm tắt phải là unknown', () => {
    const summary = summarizeScriptChecks([unavailable, withFindings], 5);
    expect(summary.tone).toBe('unknown');
    expect(summary.label).toContain('CHƯA kiểm được');
    expect(summary.label).toContain('không kết luận là sạch');
  });

  it('mọi script chạy được, có cảnh báo, thì là warn', () => {
    expect(summarizeScriptChecks([withFindings], 3).tone).toBe('warn');
  });

  it('có script và không có cảnh báo nào mới được nói là sạch', () => {
    const summary = summarizeScriptChecks([], 4);
    expect(summary.tone).toBe('clean');
    expect(summary.label).toBe('4 script, không có cảnh báo nào');
  });

  it('KHÔNG có script nào là một trạng thái RIÊNG, không phải "sạch"', () => {
    const summary = summarizeScriptChecks([], 0);
    expect(summary.tone).toBe('none');
    expect(summary.tone).not.toBe('clean');
    expect(summary.label).toContain('không có script nào');
  });
});
