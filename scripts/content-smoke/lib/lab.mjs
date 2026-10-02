/**
 * Lab (KodeKloud) — contracts.md §C3, theo đúng luồng `labs.startAttempt`:
 *
 *   công cụ đồng bộ → `setup/background.sh` PHÓNG RỜI + sentinel
 *   (`launchedBackgroundStep`), rồi thăm `SETUP_PROBE_SCRIPT` tới khi xong
 *   → mỗi task: verify PHẢI trượt → `task-<id>/solution.sh` (đọc từ đĩa, gõ
 *   `bash` trong terminal người học) → verify PHẢI đạt
 *   → chấm lại MỌI task, PHẢI đạt cả — bắt lời giải task này phá task kia.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Recorder, clip, recordTyped, runVerify } from './checks.mjs';
import { execScript } from './kube.mjs';
import {
  SETUP_PROBE_SCRIPT,
  buildToolsEnableScript,
  launchedBackgroundStep,
  parseSetupProbe,
  setupScriptPlan,
} from './product.mjs';
import { SMOKE_DIR } from './terminal.mjs';

const SETUP_EXEC_TIMEOUT_MS = 120_000;
const PROBE_INTERVAL_MS = 2000;

async function runLabSetup(ctx, lab, unit) {
  const { pod, rec, log, opts } = ctx;
  if (lab.setup.foreground !== null) {
    rec.warn('setup', 'lab-foreground-ignored', 'lab khai setup.foreground — labs không gõ nó (lab-client.tsx), và §C2 đã bỏ field này');
  }
  const plan = setupScriptPlan({
    tools: buildToolsEnableScript(lab.toolset),
    assets: null,
    background: lab.setup.background,
  }).map(launchedBackgroundStep);
  for (const step of plan) {
    const r = await execScript(pod, step.script, { timeoutMs: SETUP_EXEC_TIMEOUT_MS });
    unit.setup.push({ kind: step.kind, exitCode: r.exitCode, durationMs: r.durationMs, output: clip(r.output) });
    if (r.exitCode !== 0) {
      if (r.infraError !== null) rec.deviate('setup', 'exec-infra', `setup ${step.kind}: ${r.infraError}`);
      else rec.deviate('setup', 'setup-failed', step.failureMessage({ exitCode: r.exitCode, output: r.output }));
      return false;
    }
  }
  if (lab.setup.background === null) return true;

  const started = Date.now();
  const deadline = started + opts.setupTimeout * 1000;
  for (;;) {
    const r = await execScript(pod, SETUP_PROBE_SCRIPT, { timeoutMs: 30_000 });
    const probe = r.infraError === null ? parseSetupProbe(r.output) : null;
    if (probe !== null && probe.state === 'ready') {
      unit.setup.push({ kind: 'background-wait', exitCode: 0, durationMs: Date.now() - started, output: '' });
      log(`  setup background: xong sau ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return true;
    }
    if (probe !== null && (probe.state === 'failed' || probe.state === 'absent')) {
      unit.setup.push({ kind: 'background-wait', exitCode: probe.exitCode, durationMs: Date.now() - started, output: clip(probe.log ?? '') });
      rec.deviate('setup', 'setup-failed', `setup/background.sh ${probe.state === 'absent' ? 'không được phóng' : `thoát ${probe.exitCode ?? '?'}`}: ${(probe.log ?? '').trim().split('\n').slice(-3).join(' · ')}`);
      return false;
    }
    if (Date.now() > deadline) {
      rec.deviate('setup', 'setup-failed', `setup/background.sh chưa xong sau ${opts.setupTimeout}s`);
      return false;
    }
    await new Promise((res) => setTimeout(res, PROBE_INTERVAL_MS));
  }
}

export async function runLab(ctx, lab) {
  const { pod, dir, rec, term, log, opts } = ctx;
  const setupUnit = { key: 'setup', title: 'Dựng cảnh', setup: [], pre: null, actions: [], post: null, detailed: true };
  const units = [setupUnit];
  log('[setup] tools + background');
  if (!(await runLabSetup(ctx, lab, setupUnit))) return { units, final: [] };

  const tasks = opts.onlyTask === null ? lab.tasks : lab.tasks.filter((t) => t.id === opts.onlyTask);
  if (tasks.length === 0) throw new Error(`lab ${lab.id} không có task "${opts.onlyTask}" (có: ${lab.tasks.map((t) => t.id).join(', ')})`);

  for (const task of tasks) {
    const where = `task:${task.id}`;
    const unit = { key: where, title: task.title, setup: [], pre: null, actions: [], post: null, detailed: true };
    units.push(unit);
    log(`[${where}] ${task.title}`);
    unit.pre = await runVerify(pod, task.verifyScript, { expect: 'fail', where, rec, requireCriteria: true });
    log(`  verify trước: exit ${unit.pre.exitCode ?? unit.pre.infraError} (${unit.pre.durationMs}ms)${unit.pre.ok ? '' : '  ⚠'}`);

    const solutionPath = path.join(dir, `task-${task.id}`, 'solution.sh');
    if (!existsSync(solutionPath)) {
      rec.deviate(where, 'missing-solution', `thiếu task-${task.id}/solution.sh (§C2: BẮT BUỘC)`);
      continue;
    }
    const target = `${SMOKE_DIR}/solutions/task-${task.id}.sh`;
    await term.writeFile(target, readFileSync(solutionPath, 'utf8'));
    const res = await term.type(`bash ${target}`, { timeoutS: opts.timeout });
    unit.actions.push(recordTyped(rec, where, 'solution', readFileSync(solutionPath, 'utf8'), res, { solution: true }));
    log(`  solution.sh rc=${res.timedOut ? 'TREO' : res.rc} (${(res.durationMs / 1000).toFixed(1)}s)`);

    unit.post = await runVerify(pod, task.verifyScript, { expect: 'pass', where, rec, requireCriteria: true });
    log(`  verify sau:   exit ${unit.post.exitCode ?? unit.post.infraError} (${unit.post.durationMs}ms)${unit.post.ok ? '' : '  ⚠'}`);
  }

  const final = [];
  if (opts.onlyTask === null) {
    log('[chấm lại] mọi task');
    // `regress` CHỈ cho task đã đạt ở lượt của nó rồi trượt lúc chấm lại — tức
    // lời giải của một task SAU đã phá nó. Task chưa từng đạt đã có độ lệch
    // riêng (post-fail / missing-solution); ghi thêm ở đây là đếm một lỗi hai lần.
    const passedEarlier = new Set(
      units.filter((u) => u.post !== null && u.post.passed).map((u) => u.key.slice('task:'.length)),
    );
    for (const task of lab.tasks) {
      const where = `final:${task.id}`;
      const scratch = new Recorder();
      const check = await runVerify(pod, task.verifyScript, { expect: 'pass', where, rec: scratch, requireCriteria: false });
      for (const d of scratch.deviations) {
        if (d.code === 'post-fail') {
          if (passedEarlier.has(task.id)) {
            rec.deviate(where, 'regress', `task đã đạt ở lượt của nó, nay TRƯỢT sau khi giải các task khác${d.message.slice(d.message.indexOf(')') + 1)}`);
          }
        } else {
          rec.deviations.push(d);
        }
      }
      final.push({ taskId: task.id, ...check });
      log(`  ${task.id}: ${check.passed ? 'đạt' : 'TRƯỢT'}`);
    }
  }
  return { units, final };
}
