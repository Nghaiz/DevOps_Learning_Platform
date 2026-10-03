/**
 * Một lượt chấm + sổ ghi độ lệch, dùng chung cho bài học và lab.
 */
import { execScript } from './kube.mjs';
import { parseCheckCriteria, withVerifyPrelude } from './product.mjs';

/** Trần một lượt chấm của gateway (`gateway.execTimeout`). Vượt = lỗi hạ tầng, không phải "chưa đạt". */
export const VERIFY_HARD_TIMEOUT_MS = 120_000;
/** Ngân sách của contracts.md §C1: mỗi lượt chấm xong trong 20s trên node rảnh. */
export const VERIFY_BUDGET_MS = 20_000;
const MAX_TEXT = 4000;

export const clip = (text, max = MAX_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max)}\n… (cắt, tổng ${text.length} ký tự)`;

/** Mã độ lệch do HẠ TẦNG (pod, kubectl, terminal) — tách khỏi lỗi nội dung để exit code nói đúng ai phải sửa. */
export const INFRA_CODES = new Set(['pod-error', 'verify-infra', 'terminal-error', 'exec-infra']);

export class Recorder {
  constructor() {
    this.deviations = [];
    this.warnings = [];
  }

  deviate(where, code, message) {
    this.deviations.push({ where, code, message });
  }

  warn(where, code, message) {
    this.warnings.push({ where, code, message });
  }

  verdict() {
    if (this.deviations.some((d) => !INFRA_CODES.has(d.code))) return 'fail';
    if (this.deviations.length > 0) return 'error';
    return 'pass';
  }
}

/**
 * Chạy verify ĐÚNG như server: `withVerifyPrelude(script)` qua STDIN của bash.
 * `expect` = 'fail' | 'pass'. Ghi độ lệch vào `rec` dưới nhãn `where`.
 */
export async function runVerify(pod, script, { expect, where, rec, requireCriteria, baselineMs = 0 }) {
  const r = await execScript(pod, withVerifyPrelude(script), { timeoutMs: VERIFY_HARD_TIMEOUT_MS });
  const { criteria, notes } = parseCheckCriteria(r.output);
  const check = {
    expect,
    exitCode: r.exitCode,
    passed: r.exitCode === 0,
    durationMs: r.durationMs,
    // Thời gian TRONG pod ≈ thời gian đo được trừ chi phí một lượt exec rỗng
    // (kubectl + stream, ~1s trên máy Windows này). Ngân sách §C1 là của script.
    podMs: Math.max(0, r.durationMs - baselineMs),
    slow: r.durationMs - baselineMs > VERIFY_BUDGET_MS,
    criteria,
    notes: clip(notes),
    infraError: r.infraError,
    ok: true,
  };
  if (r.infraError !== null) {
    check.ok = false;
    rec.deviate(where, 'verify-infra', `lượt chấm không chạy được: ${r.infraError}`);
    return check;
  }
  if (expect === 'fail' && check.passed) {
    check.ok = false;
    rec.deviate(where, 'pre-pass', 'verify ĐẠT trước khi người học làm gì — nó không phân biệt được trước/sau');
  }
  if (expect === 'pass' && !check.passed) {
    check.ok = false;
    rec.deviate(where, 'post-fail', `verify TRƯỢT sau khi đã làm (exit ${r.exitCode})${firstFail(criteria, notes)}`);
  }
  if (check.slow) {
    rec.deviate(where, 'slow', `verify mất ~${(check.podMs / 1000).toFixed(1)}s trong pod (> ${VERIFY_BUDGET_MS / 1000}s của §C1; đo ${(r.durationMs / 1000).toFixed(1)}s kể cả exec)`);
  }
  if (requireCriteria && criteria.length === 0) {
    rec.deviate(where, 'no-criteria', 'verify của lab không in dòng tiêu chí ✓/✗ nào (§C1)');
  }
  return check;
}

function firstFail(criteria, notes) {
  const failed = criteria.find((c) => !c.ok);
  if (failed) return `: ✗ ${failed.label}`;
  const line = notes.split('\n').find((l) => l.trim() !== '');
  return line ? `: ${line.trim()}` : '';
}

const SHELL_ERROR = /^(zsh|bash): .+$/gm;

/** Ghi một thao tác gõ trong terminal (khối exec / foreground / solution) + cảnh báo đi kèm. */
export function recordTyped(rec, where, kind, code, result, { solution = false } = {}) {
  const shellErrors = [...result.output.matchAll(SHELL_ERROR)].map((m) => m[0]).slice(0, 5);
  const action = {
    kind,
    code: clip(code, 1500),
    rc: result.rc,
    cwd: result.cwd,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    shellErrors,
    output: clip(result.output),
  };
  const label = `${kind} «${code.split('\n')[0].slice(0, 60)}»`;
  if (result.timedOut) {
    rec.deviate(where, 'exec-hang', `${label} không tự kết thúc (§C3: cấm lệnh chạy mãi trong {{exec}})`);
  } else if (result.rc !== 0) {
    if (solution) rec.deviate(where, 'solution-failed', `solution.sh thoát ${result.rc}`);
    else rec.warn(where, 'exec-rc', `${label} thoát ${result.rc}`);
  }
  if (shellErrors.length > 0) {
    rec.warn(where, 'shell-error', `${label}: ${shellErrors[0]}`);
  }
  return action;
}
