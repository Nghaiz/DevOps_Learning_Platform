#!/usr/bin/env node
/**
 * Đối chiếu cấu hình THẬT của repo GitHub với thứ docs/env/04 khẳng định.
 *
 * VÌ SAO TỒN TẠI: cấu hình repo sống trong giao diện GitHub, không nằm trong git.
 * Không có gì ngăn nó trôi khỏi tài liệu — và bản trước của docs/env/04 đã trôi
 * thật: nó mô tả ruleset trong khi repo dùng classic branch protection, và bảo
 * người đọc đi bật hai thứ vốn đã bật sẵn.
 *
 * KHÔNG PHẢI CỔNG CI. Nó cần `gh` đã đăng nhập với quyền admin repo — runner
 * không có. Chạy tay khi nghi ngờ, hoặc sau khi ai đó bấm gì trong Settings.
 *
 *   node scripts/check-repo-settings.mjs
 */

import { execFileSync } from 'node:child_process';

const REPO = 'Nghaiz/DevOps_Learning_Platform';

function gh(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  } catch {
    return null; // 404 là một câu trả lời hợp lệ (vd: alerts đang tắt)
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const problems = [];
const ok = [];

/** @param {string} label @param {boolean} pass @param {string} actual @param {string} fix */
function check(label, pass, actual, fix) {
  if (pass) ok.push(label);
  else problems.push({ label, actual, fix });
}

// ───────────────────────────────────────────────── branch protection
const prot = gh(`repos/${REPO}/branches/main/protection`);
const FIX_PROT = 'xem docs/env/04-github-repo-settings.md §1 (khối "Đặt lại từ đầu")';

if (prot === null) {
  problems.push({
    label: 'branch protection cho main',
    actual: 'KHÔNG CÓ — push thẳng lên main đang được phép',
    fix: FIX_PROT,
  });
} else {
  const ctx = prot.required_status_checks?.contexts ?? [];
  check(
    'required check chỉ là ci-ok',
    ctx.length === 1 && ctx[0] === 'ci-ok',
    `[${ctx.join(', ')}]`,
    // Đây là lỗi đã cắn thật: check mang tên một job không còn tồn tại thì không
    // bao giờ báo cáo, và PR bị chặn vĩnh viễn dù mọi job đều xanh.
    `${FIX_PROT} — tên job KHÁC ci-ok trong danh sách này sẽ chặn PR vĩnh viễn nếu job đó bị đổi tên`,
  );
  check('require branches up to date', prot.required_status_checks?.strict === true, String(prot.required_status_checks?.strict), FIX_PROT);
  check('bắt buộc có PR', !!prot.required_pull_request_reviews, 'không bắt buộc', FIX_PROT);
  check(
    'số approval = 0 (dự án 1 người)',
    prot.required_pull_request_reviews?.required_approving_review_count === 0,
    String(prot.required_pull_request_reviews?.required_approving_review_count),
    `${FIX_PROT} — khác 0 là tự khoá mình: không ai tự duyệt PR của mình được`,
  );
  check('require conversation resolution', prot.required_conversation_resolution?.enabled === true, String(prot.required_conversation_resolution?.enabled), FIX_PROT);
  check('require linear history', prot.required_linear_history?.enabled === true, String(prot.required_linear_history?.enabled), FIX_PROT);
  check('cấm force push', prot.allow_force_pushes?.enabled === false, String(prot.allow_force_pushes?.enabled), FIX_PROT);
  check('cấm xoá nhánh main', prot.allow_deletions?.enabled === false, String(prot.allow_deletions?.enabled), FIX_PROT);
}

// ───────────────────────────────────────────────── cách merge
const repo = gh(`repos/${REPO}`);
const FIX_MERGE = 'gh api -X PATCH repos/' + REPO + ' -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true -F allow_auto_merge=true';
if (repo) {
  check('chỉ cho squash merge', repo.allow_squash_merge === true && repo.allow_merge_commit === false && repo.allow_rebase_merge === false,
    `squash=${repo.allow_squash_merge} merge=${repo.allow_merge_commit} rebase=${repo.allow_rebase_merge}`, FIX_MERGE);
  check('tự xoá nhánh sau merge', repo.delete_branch_on_merge === true, String(repo.delete_branch_on_merge), FIX_MERGE);
  check('bật auto-merge', repo.allow_auto_merge === true, String(repo.allow_auto_merge), FIX_MERGE);
}

// ───────────────────────────────────────────────── Copilot code review
const rulesets = gh(`repos/${REPO}/rulesets`) ?? [];
const copilotRs = rulesets
  .map((r) => gh(`repos/${REPO}/rulesets/${r.id}`))
  .filter(Boolean)
  .find((r) => (r.rules ?? []).some((x) => x.type === 'copilot_code_review'));
check(
  'Copilot code review tự động',
  !!copilotRs && copilotRs.enforcement === 'active',
  copilotRs ? `có nhưng enforcement=${copilotRs.enforcement}` : 'không có ruleset nào bật nó',
  'xem docs/env/04 §3 — đây là thứ DUY NHẤT dùng ruleset, vì GitHub không cho bật nó ở classic protection',
);

// ───────────────────────────────────────────────── quyền Actions
const wf = gh(`repos/${REPO}/actions/permissions/workflow`);
if (wf) {
  check('workflow permissions = read', wf.default_workflow_permissions === 'read', wf.default_workflow_permissions,
    `gh api -X PUT repos/${REPO}/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false`);
  check('Actions không tự duyệt PR', wf.can_approve_pull_request_reviews === false, String(wf.can_approve_pull_request_reviews),
    `gh api -X PUT repos/${REPO}/actions/permissions/workflow -F can_approve_pull_request_reviews=false`);
}

// ───────────────────────────────────────────────── Dependabot
check('Dependabot alerts', gh(`repos/${REPO}/vulnerability-alerts`) !== null || alertsEnabled(), 'đang tắt',
  `gh api -X PUT repos/${REPO}/vulnerability-alerts`);
const fixes = gh(`repos/${REPO}/automated-security-fixes`);
check('Dependabot security updates', fixes?.enabled === true, fixes ? String(fixes.enabled) : 'không đọc được',
  `gh api -X PUT repos/${REPO}/automated-security-fixes`);

/** Endpoint trả 204 KHÔNG có body khi bật — JSON.parse('') ném, nên gh() trả null. */
function alertsEnabled() {
  try {
    execFileSync('gh', ['api', `repos/${REPO}/vulnerability-alerts`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────── hàng rào local
check(
  'git hook chặn push lên main',
  git(['config', 'core.hooksPath']) === 'scripts/git-hooks',
  git(['config', 'core.hooksPath']) || '(chưa đặt)',
  'make install-hooks',
);

// ───────────────────────────────────────────────────────────── báo cáo
for (const label of ok) console.log(`  ✓ ${label}`);
if (problems.length === 0) {
  console.log(`\n${ok.length}/${ok.length} khớp — cấu hình repo đúng như docs/env/04 mô tả.`);
  process.exit(0);
}
console.log('');
for (const p of problems) {
  console.log(`  ✗ ${p.label}`);
  console.log(`      thực tế: ${p.actual}`);
  console.log(`      sửa    : ${p.fix}`);
}
console.log(`\n${problems.length} mục lệch khỏi docs/env/04-github-repo-settings.md\n`);
process.exit(1);
