/**
 * Báo cáo: `<report-dir>/<id>.json` (máy đọc) + `<id>.md` (người đọc).
 *
 * MD đặt ĐỘ LỆCH lên đầu — người soạn bài mở file để biết phải sửa gì, không
 * phải để đọc lại những gì đã xanh. Bảng tổng ở giữa, chi tiết output chỉ cho
 * những đơn vị có vấn đề.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const VERDICT = { pass: 'ĐẠT', fail: 'TRƯỢT', error: 'LỖI HẠ TẦNG' };
const sec = (ms) => (ms === undefined || ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function checkCell(c) {
  if (c === null) return '—';
  if (c.infraError !== null) return `lỗi: ${cell(c.infraError).slice(0, 40)}`;
  const mark = c.ok ? '' : ' ⚠';
  const slow = c.slow ? ' (chậm)' : '';
  const crit = c.criteria.length > 0 ? ` ${c.criteria.filter((x) => x.ok).length}/${c.criteria.length}✓` : '';
  return `exit ${c.exitCode} · ${sec(c.durationMs)}${crit}${slow}${mark}`;
}

function actionsCell(actions) {
  if (actions.length === 0) return '—';
  const total = actions.reduce((n, a) => n + a.durationMs, 0);
  const bad = actions.filter((a) => a.timedOut || a.rc !== 0).length;
  return `${actions.length} lệnh · ${sec(total)}${bad > 0 ? ` · ${bad} thoát≠0/treo` : ''}`;
}

const fence = (text) => `\`\`\`text\n${text.replace(/```/g, "'''")}\n\`\`\``;

function unitDetails(unit, flagged) {
  if (!flagged.has(unit.key)) return '';
  const parts = [`### ${unit.key} — ${unit.title}`];
  for (const s of unit.setup.filter((x) => x.exitCode !== 0)) {
    parts.push(`setup \`${s.kind}\` exit ${s.exitCode}:`, fence(s.output || '(không có output)'));
  }
  for (const [label, c] of [['verify trước', unit.pre], ['verify sau', unit.post]]) {
    if (c === null) continue;
    const crit = c.criteria.map((x) => `${x.ok ? '✓' : '✗'} ${x.label}`).join('\n');
    parts.push(`${label} — exit ${c.exitCode ?? c.infraError}, ${sec(c.durationMs)}:`, fence([crit, c.notes].filter(Boolean).join('\n') || '(không có output)'));
  }
  for (const a of unit.actions.filter((x) => x.timedOut || x.rc !== 0 || x.shellErrors.length > 0)) {
    parts.push(`${a.kind} (rc ${a.timedOut ? 'TREO' : a.rc}, ${sec(a.durationMs)}):`, fence(a.output.split('\n').slice(-25).join('\n')));
  }
  return parts.join('\n\n');
}

export function renderMarkdown(r) {
  const lines = [
    `# Smoke ${r.kind === 'lesson' ? 'bài học' : 'lab'} \`${r.id}\` — ${VERDICT[r.verdict]}`,
    '',
    `- Tiêu đề: ${r.title ?? '—'}`,
    `- Lúc chạy: ${r.startedAt} · tổng ${sec(r.durationMs)}`,
    `- Image: \`${r.image}\` · profile: \`${r.profile === '' ? '(mặc định)' : r.profile}\` · pod: \`${r.pod ?? '—'}\``,
    `- Hạ tầng: pod Ready ${sec(r.infra.podReadyMs)} · dockerd ${sec(r.infra.dockerReadyMs)}` +
      `${r.infra.k8sReadyMs !== undefined ? ` · cụm k8s ${sec(r.infra.k8sReadyMs)}` : ''}` +
      ` · terminal ${sec(r.infra.terminalMs)} · loadavg node: ${r.infra.loadavg ?? '—'}`,
    '',
    `## Độ lệch (${r.deviations.length})`,
    '',
  ];
  if (r.deviations.length === 0) lines.push('Không có.');
  for (const d of r.deviations) lines.push(`- **${d.where}** \`${d.code}\` — ${d.message}`);
  if (r.warnings.length > 0) {
    lines.push('', `## Cảnh báo (${r.warnings.length})`, '');
    for (const w of r.warnings) lines.push(`- ${w.where} \`${w.code}\` — ${w.message}`);
  }
  lines.push('', '## Từng bước', '', '| Đơn vị | Verify trước (phải trượt) | Thao tác | Verify sau (phải đạt) |', '|---|---|---|---|');
  for (const u of r.units) {
    const name = `${u.key}${u.detailed ? '' : ' (dựng trạng thái)'}`;
    lines.push(`| ${cell(name)} — ${cell(u.title)} | ${checkCell(u.pre)} | ${actionsCell(u.actions)} | ${checkCell(u.post)} |`);
  }
  if (r.final.length > 0) {
    lines.push('', '## Chấm lại mọi task sau khi giải xong', '', '| Task | Kết quả |', '|---|---|');
    for (const f of r.final) lines.push(`| ${f.taskId} | ${checkCell(f)} |`);
  }
  const flagged = new Set(
    [...r.deviations, ...r.warnings].map((d) => d.where.replace(/^final:/, 'task:')),
  );
  const details = r.units.map((u) => unitDetails(u, flagged)).filter(Boolean);
  if (details.length > 0) lines.push('', '## Chi tiết các đơn vị có vấn đề', '', details.join('\n\n'));
  if (r.infra.exec) lines.push('', '## Pod giữ lại (--keep)', '', `- ${r.infra.attach ?? ''}`, `- ${r.infra.exec}`);
  lines.push('', '---', '"chậm" = verify quá 20s (§C1). Bản máy đọc: cùng tên, đuôi `.json`.', '');
  return lines.join('\n');
}

export function writeReport(dir, result) {
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, result.id);
  writeFileSync(`${base}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`${base}.md`, renderMarkdown(result));
  return `${base}.md`;
}

export function writeSummary(dir, results) {
  mkdirSync(dir, { recursive: true });
  const lines = ['# Smoke — tổng hợp', '', `Lúc: ${new Date().toISOString()}`, '', '| Nội dung | Loại | Kết quả | Độ lệch | Thời gian |', '|---|---|---|---|---|'];
  for (const r of results) {
    lines.push(`| [${r.id}](${r.id}.md) | ${r.kind} | ${VERDICT[r.verdict]} | ${r.deviations.map((d) => d.code).join(', ') || '—'} | ${sec(r.durationMs)} |`);
  }
  const file = path.join(dir, '_summary.md');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}
