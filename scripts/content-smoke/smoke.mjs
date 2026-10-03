#!/usr/bin/env node
/**
 * Bộ kiểm thử nội dung trên cụm thật — plans/labs-rebuild/contracts.md §C3.
 *
 *   node scripts/content-smoke/smoke.mjs lesson <id>   [cờ]
 *   node scripts/content-smoke/smoke.mjs lab <id>      [cờ]
 *   node scripts/content-smoke/smoke.mjs all           [cờ]   (tuần tự, --concurrency N để song song)
 *   node scripts/content-smoke/smoke.mjs teardown              gỡ namespace, netpol, pod của harness
 *
 * Exit: 0 = mọi thứ đạt · 1 = nội dung lệch hợp đồng · 2 = hạ tầng/harness hỏng
 * (pod không lên, kubectl lỗi) — tách riêng để người soạn bài biết lỗi có phải
 * của mình không. Hướng dẫn: README.md cùng thư mục.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ensureInfra, readLiveConfig, teardown } from './lib/cluster.mjs';
import { REPO_ROOT } from './lib/product.mjs';
import { writeReport, writeSummary } from './lib/report.mjs';
import { smokeOne } from './lib/run.mjs';

const USAGE = `Dùng: node scripts/content-smoke/smoke.mjs <lesson <id> | lab <id> | all | teardown> [cờ]
  --image <ref>          image sandbox (mặc định: SANDBOX_IMAGE của orchestrator đang chạy)
  --keep                 giữ pod sau khi chạy để debug (in lệnh kubectl exec/attach)
  --content-root <dir>   gốc nội dung (mặc định: content/) — chứa scenarios/ và labs/
  --only-step <N>        bài học: chỉ kiểm bước N (các bước trước chỉ chạy lệnh để dựng trạng thái)
  --only-task <id>       lab: chỉ kiểm một task
  --timeout <giây>       trần mỗi khối exec / solution.sh (mặc định 300)
  --setup-timeout <giây> trần chờ setup/background.sh của lab (mặc định 600)
  --max-pods <N>         trần pod smoke đồng thời trên máy này, mọi tiến trình (mặc định 2, env DLP_SMOKE_MAX_PODS)
  --concurrency <N>      'all': số nội dung chạy song song (mặc định 1)
  --report-dir <dir>     nơi ghi báo cáo (mặc định: plans/labs-rebuild/reports/smoke/)`;

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      image: { type: 'string' },
      keep: { type: 'boolean', default: false },
      'content-root': { type: 'string' },
      'only-step': { type: 'string' },
      'only-task': { type: 'string' },
      timeout: { type: 'string', default: '300' },
      'setup-timeout': { type: 'string', default: '600' },
      'max-pods': { type: 'string', default: process.env.DLP_SMOKE_MAX_PODS ?? '2' },
      concurrency: { type: 'string', default: '1' },
      'report-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const int = (name, v, min) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) throw new Error(`--${name} phải là số nguyên ≥ ${min} (nhận: ${v})`);
    return n;
  };
  return {
    help: values.help,
    command: positionals[0],
    id: positionals[1],
    opts: {
      image: values.image ?? null,
      keep: values.keep,
      contentRoot: path.resolve(values['content-root'] ?? path.join(REPO_ROOT, 'content')),
      onlyStep: values['only-step'] === undefined ? null : int('only-step', values['only-step'], 1),
      onlyTask: values['only-task'] ?? null,
      timeout: int('timeout', values.timeout, 1),
      setupTimeout: int('setup-timeout', values['setup-timeout'], 1),
      maxPods: int('max-pods', values['max-pods'], 1),
      concurrency: int('concurrency', values.concurrency, 1),
      reportDir: path.resolve(values['report-dir'] ?? path.join(REPO_ROOT, 'plans', 'labs-rebuild', 'reports', 'smoke')),
    },
  };
}

const listDirs = (root) =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];

function targetsFor(command, id, opts) {
  if (command === 'lesson' || command === 'lab') {
    if (!id) throw new Error(`thiếu <id> cho '${command}'`);
    return [{ kind: command, id }];
  }
  if (command === 'all') {
    return [
      ...listDirs(path.join(opts.contentRoot, 'scenarios')).map((d) => ({ kind: 'lesson', id: d })),
      ...listDirs(path.join(opts.contentRoot, 'labs')).map((d) => ({ kind: 'lab', id: d })),
    ];
  }
  throw new Error(`lệnh không nhận ra: '${command ?? ''}'`);
}

async function main() {
  let cli;
  try {
    cli = parseCli(process.argv.slice(2));
  } catch (e) {
    console.error(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  if (cli.help || !cli.command) {
    console.log(USAGE);
    return cli.help ? 0 : 2;
  }
  if (cli.command === 'teardown') {
    for (const line of await teardown()) console.log(line);
    return 0;
  }
  let targets;
  try {
    targets = targetsFor(cli.command, cli.id, cli.opts);
  } catch (e) {
    console.error(`${e.message}\n\n${USAGE}`);
    return 2;
  }

  const liveConfig = await readLiveConfig();
  await ensureInfra();
  const results = [];
  const queue = [...targets];
  const worker = async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      const tag = targets.length > 1 ? `[${t.id}] ` : '';
      const log = (msg) => console.log(`${tag}${msg}`);
      log(`== smoke ${t.kind} ${t.id}`);
      const r = await smokeOne({ ...t, opts: cli.opts, liveConfig, log });
      const file = writeReport(cli.opts.reportDir, r);
      for (const d of r.deviations) log(`  ✗ ${d.where} ${d.code}: ${d.message}`);
      log(`== ${r.verdict.toUpperCase()} ${t.kind} ${t.id} (${(r.durationMs / 1000).toFixed(0)}s, ${r.deviations.length} độ lệch, ${r.warnings.length} cảnh báo) → ${path.relative(process.cwd(), file)}`);
      results.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(cli.opts.concurrency, targets.length) }, worker));

  if (targets.length > 1) {
    console.log(`Tổng hợp → ${path.relative(process.cwd(), writeSummary(cli.opts.reportDir, results))}`);
  }
  if (results.some((r) => r.verdict === 'fail')) return 1;
  if (results.some((r) => r.verdict === 'error')) return 2;
  return 0;
}

process.exitCode = await main();
