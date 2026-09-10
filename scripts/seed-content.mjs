#!/usr/bin/env node
/**
 * Nạp LỘ TRÌNH + QUIZ (từ `content/`) và BÀI TẬP OJ (từ `packages/games`) vào
 * Postgres. Chạy lại bao nhiêu lần cũng ra cùng một trạng thái.
 *
 * VÌ SAO CẦN NÓ
 * -------------
 * Lesson/lab/playground có nguồn ĐĨA (`filesystemScenarioSource`) nên chúng có
 * mặt ngay khi image được build. Lộ trình và quiz thì KHÔNG có nguồn đĩa —
 * `paths.*` và `quiz.*` đọc thẳng Postgres (xem `docs/content-sources.md`: bảng
 * hai nguồn ở đó chỉ liệt kê `content_items`). Hệ quả đo được ngày 2026-09-06
 * trên cụm thật: `learning_paths = 0`, `quizzes = 0`, và `/paths` + `/quiz` rỗng
 * trơn trong khi `/lessons` + `/labs` đầy đủ.
 *
 * `problems` (hệ OJ) là loại THỨ BA cùng cảnh ngộ, và cảnh ngộ của nó khó thấy
 * hơn một bậc: dữ liệu seed ĐÃ nằm sẵn trong repo — `PROBLEMS_SEED`, 10 bài ở
 * `packages/games/src/k8s/problems-seed/` — nhưng grep toàn repo ngày
 * 2026-09-11 cho thấy KHÔNG file nào import nó ngoài chính test của nó. Nên
 * bảng `problems` rỗng trên mọi cài đặt sạch, `/problems/:code` và
 * `/author/problems/:code` không có mã nào để mở, trong khi `next-code.ts` viết
 * như thể `K8S-0001`… đã có sẵn trong DB. Dữ liệu có mặt mà không ai nạp thì
 * đúng bằng không có dữ liệu, chỉ khó tìm hơn.
 *
 * Script này là đường nạp cho một cụm mới. Nó KHÔNG phải nguồn nội dung thứ ba:
 * sau khi chạy, SSOT lúc đọc vẫn là Postgres — đúng những bảng mà trang soạn
 * ghi vào. `content/{paths,quizzes}` là ĐẦU VÀO của lượt nạp, phiên bản hoá
 * trong git để một cụm dựng lại từ đầu có cùng thư viện.
 *
 * MỘT BỘ SINH SQL, HAI ĐẦU RA
 * ---------------------------
 * `--print` in giao dịch SQL ra stdout; mặc định thì thực thi chính chuỗi đó.
 * Cùng một hàm dựng, nên hai đường KHÔNG thể lệch nhau. Đó là lý do có `--print`
 * thay vì một nhánh "sinh file" riêng: cụm lab không lộ Postgres ra ngoài, nên
 * đường thật là in ra rồi `psql -f -` qua `kubectl exec`.
 *
 * IDEMPOTENT BẰNG CẤU TRÚC, KHÔNG BẰNG ĐIỀU KIỆN
 * ----------------------------------------------
 * Hàng cha (`quizzes`, `learning_paths`) dùng `ON CONFLICT (id) DO UPDATE`; hàng
 * con (`quiz_questions`, `quiz_choices`, `learning_path_items`) bị XOÁ SẠCH theo
 * cha rồi chèn lại, tất cả trong MỘT giao dịch. Không có nhánh "nếu đã có thì
 * bỏ qua" nào để hiểu sai, và không cột `hash` nào phải giữ đồng bộ.
 *
 * `problems` chỉ có vế cha (`ON CONFLICT (code) DO UPDATE`) và KHÔNG xoá gì cả:
 * một bài không có hàng con, còn thứ trỏ vào nó — `problem_submissions`,
 * `problem_hint_reveals` — là lịch sử người học, thứ tuyệt đối không được xoá
 * theo một lượt seed. `created_at` cố ý KHÔNG nằm trong mệnh đề `DO UPDATE`: nó
 * là một khoá sắp xếp của hợp đồng (`PROBLEM_ORDER_KEYS`) và đi vào con trỏ
 * keyset, nên đổi nó ở mỗi lần seed là xáo lại thứ tự danh mục dưới chân người
 * đang lật trang.
 *
 * An toàn với lịch sử người học: `quiz_answers.question_id` và các id trong
 * `selected_choice_ids` là TEXT bền do tác giả đặt, không phải uuid của hàng —
 * nên xoá/chèn lại hàng câu hỏi không làm lượt nộp cũ trỏ vào hư không. Đó
 * chính là lý do `quizQuestionIdSchema` tồn tại (xem `shared-types/quiz.ts`).
 *
 * KHÔNG GIÀNH BÀI CỦA NGƯỜI KHÁC
 * ------------------------------
 * Nếu một id đã tồn tại nhưng thuộc `author_id` khác, giao dịch `RAISE EXCEPTION`
 * và KHÔNG ghi gì cả. Một script seed âm thầm đè lên bài người thật vừa soạn là
 * cách mất nội dung mà không ai biết là đã mất.
 *
 * AI PHẢI GỌI NÓ, VÀ KHI NÀO
 * ---------------------------
 * Mọi nơi dựng một Postgres mới: cụm mới, VÀ mọi job CI chạy E2E. `db:migrate`
 * tạo bảng — nó không nạp gì cả. Bỏ bước này thì `/paths` + `/quiz` rỗng trong
 * khi `/lessons` + `/labs` đầy đủ, và triệu chứng KHÔNG nêu tên nguyên nhân:
 * `paths.list` trả `items: []` hoàn toàn hợp lệ, không log lỗi nào, và thứ đỏ
 * lên là một test cách đó vài tầng với câu "paths.list trả 0 mục". Đã xảy ra
 * thật ở CI run 34130030953 — lượt chạy đầu tiên của job `web-a11y`, bốn ô đỏ.
 * Ghi lại ở `docs/content-sources.md` § "Ngoài bảng trên".
 *
 * DÙNG
 * ----
 *   node scripts/seed-content.mjs --check           # chỉ kiểm nội dung, không cần DB
 *   node scripts/seed-content.mjs --print           # in SQL ra stdout
 *   DATABASE_URL=... node scripts/seed-content.mjs  # thực thi
 *
 *   # Cụm lab (Postgres không lộ ra ngoài):
 *   node scripts/seed-content.mjs --print > /tmp/seed.sql
 *   scp /tmp/seed.sql <user>@<vm>:/tmp/
 *   ssh <user>@<vm> 'kubectl exec -i -n default <pod-postgres> -- \
 *       psql -U dlp -d dlp -v ON_ERROR_STOP=1 -f -' < /tmp/seed.sql
 *
 * Tác giả sở hữu: `SEED_AUTHOR_ID` (mặc định `dlp-catalog-author`, tự tạo nếu
 * chưa có, vai trò `author`, KHÔNG có hàng `accounts` nên không đăng nhập được).
 *
 * Mã thoát: 0 xong · 1 nội dung sai / xung đột chủ sở hữu · 2 sai cấu hình.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const REPO = resolve(SELF, '..', '..');
const PATHS_DIR = join(REPO, 'content', 'paths');
const QUIZZES_DIR = join(REPO, 'content', 'quizzes');
const SCENARIOS_DIR = join(REPO, 'content', 'scenarios');
const LABS_DIR = join(REPO, 'content', 'labs');

/**
 * Bài tập OJ: nguồn là TypeScript trong `packages/games`, KHÔNG phải JSON trong
 * `content/`.
 *
 * Không chép mười bài ra JSON. Một bản chép là nguồn thứ hai của cùng một sự
 * thật, và `problems-seed.test.ts` — thứ đang gác trần 150 từ, giá gợi ý tăng
 * dần, và "mọi `check` phải nằm trong `PREDICATE_NAMES`" — chỉ gác bản gốc. Bản
 * chép sẽ lệch, và lệch trong im lặng.
 *
 * ĐỌC THẲNG FILE, không qua tên package `@devops-platform/games`. Đo ngày
 * 2026-09-11: subpath DUY NHẤT mà package khai (`.` → `src/index.ts`) KHÔNG nạp
 * được bằng `node` trần — `src/k8s/yaml.ts` nằm dưới barrel đó và dùng
 * *parameter property*, thứ mà chế độ strip-only của Node 24 từ chối thẳng:
 * `SyntaxError: TypeScript parameter property is not supported in strip-only
 * mode`. Nhánh `problems-seed/` thì chỉ có dữ liệu và `import type` — toàn cú
 * pháp xoá-được — nên nó nạp thẳng được, không cần tsx, không cần bundler,
 * không cần thêm một bước build vào mọi nơi chạy seed.
 *
 * Đánh đổi ghi thẳng ra: script với tay vào bố cục bên trong của package thay vì
 * đi qua `exports`, nên đổi tên thư mục `problems-seed/` sẽ làm nó đổ. Đổi lại
 * là một lượt import đổ NGAY, có tên file trong thông báo — chứ không phải một
 * bảng `problems` rỗng mà triệu chứng là "e2e báo danh mục rỗng" ở cách đó ba
 * tầng. Bỏ hẳn `--experimental-transform-types` vì CI gọi `node
 * scripts/seed-content.mjs` trần, và một script tự sinh lại chính mình kèm cờ
 * là chi phí lớn hơn hẳn cái nó mua.
 */
const PROBLEMS_MODULE = join(REPO, 'packages', 'games', 'src', 'k8s', 'problems-seed', 'index.ts');
const PROBLEM_CONTRACT_MODULE = join(REPO, 'packages', 'games', 'src', 'k8s', 'problem.ts');

const AUTHOR_ID = process.env.SEED_AUTHOR_ID?.trim() || 'dlp-catalog-author';
const AUTHOR_EMAIL = process.env.SEED_AUTHOR_EMAIL?.trim() || 'catalog@dlp.local';
const AUTHOR_NAME = process.env.SEED_AUTHOR_NAME?.trim() || 'Thu vien noi dung DLP';

// Đồng bộ với `packages/shared-types/src/scenario.ts` + `quiz.ts`. Chép lại ở
// đây là CÓ Ý: script chạy bằng `node` trần (không tsx, không bundler) để một
// cụm mới nạp được nội dung mà không cần cây build của apps/web. Cái giá là hai
// bản regex; cổng `--check` bên dưới là thứ giữ chúng không lệch — nó áp đúng
// luật `validateQuizForPublish`, nên nội dung lọt qua đây cũng lọt qua
// `quiz.publish`.
const SCENARIO_ID = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const CHOICE_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PATH_ITEM_KINDS = new Set(['lesson', 'lab', 'quiz']);
const QUESTION_KINDS = new Set(['single', 'multiple']);

// ──────────────────────────────────────────────────────────── đọc + kiểm

function readJsonDir(dir) {
  let names;
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names.map((name) => {
    const file = join(dir, name);
    try {
      return { file, name, data: JSON.parse(readFileSync(file, 'utf8')) };
    } catch (error) {
      throw new Error(`${file}: JSON không đọc được — ${error.message}`);
    }
  });
}

function subdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Luật của `apps/web/src/server/quiz/validate.ts`, áp TRƯỚC khi chạm DB. */
function checkQuiz({ file, name, data: quiz }, issues) {
  const at = (s) => `${name} → ${s}`;
  void file;
  if (!SCENARIO_ID.test(quiz.id ?? '')) issues.push(at(`id "${quiz.id}" sai khuôn scenarioIdSchema`));
  if (`${quiz.id}.json` !== name) issues.push(at(`id "${quiz.id}" không khớp tên file`));
  if (typeof quiz.title !== 'string' || quiz.title.trim() === '') issues.push(at('thiếu title'));
  if (
    !Number.isInteger(quiz.passThresholdPercent) ||
    quiz.passThresholdPercent < 0 ||
    quiz.passThresholdPercent > 100
  ) {
    issues.push(at('passThresholdPercent phải là số nguyên 0–100'));
  }
  if (!Array.isArray(quiz.questions) || quiz.questions.length < 1) {
    issues.push(at('cần ít nhất 1 câu hỏi'));
    return;
  }

  const seenQuestions = new Set();
  for (const [index, question] of quiz.questions.entries()) {
    const where = at(`questions[${index}]`);
    if (!CHOICE_ID.test(question.id ?? '')) issues.push(`${where}: id "${question.id}" sai khuôn`);
    if (seenQuestions.has(question.id)) issues.push(`${where}: id "${question.id}" trùng`);
    seenQuestions.add(question.id);
    if (!QUESTION_KINDS.has(question.kind)) issues.push(`${where}: kind phải là single|multiple`);
    if (typeof question.markdown !== 'string' || question.markdown.trim() === '') {
      issues.push(`${where}: markdown rỗng`);
    }
    if (question.explanation !== null && typeof question.explanation !== 'string') {
      issues.push(`${where}: explanation phải là chuỗi hoặc null`);
    }

    const choices = Array.isArray(question.choices) ? question.choices : [];
    const seenChoices = new Set();
    for (const choice of choices) {
      if (!CHOICE_ID.test(choice.id ?? '')) issues.push(`${where}: choice id "${choice.id}" sai khuôn`);
      if (seenChoices.has(choice.id)) issues.push(`${where}: choice id "${choice.id}" trùng`);
      seenChoices.add(choice.id);
      if (typeof choice.correct !== 'boolean') {
        issues.push(`${where}: choice "${choice.id}" thiếu cờ correct`);
      }
      if (typeof choice.markdown !== 'string' || choice.markdown.trim() === '') {
        issues.push(`${where}: choice "${choice.id}" markdown rỗng`);
      }
    }

    const correct = choices.filter((choice) => choice.correct === true).length;
    if (choices.length < 2) issues.push(`${where}: cần ít nhất 2 lựa chọn`);
    if (correct === 0) issues.push(`${where}: cần ít nhất 1 đáp án đúng`);
    if (choices.length > 0 && correct === choices.length) {
      issues.push(`${where}: mọi lựa chọn đều đúng — câu hỏi này không đo được gì`);
    }
    if (question.kind === 'single' && correct > 1) {
      issues.push(
        `${where}: câu một-đáp-án có ${correct} đáp án đúng — không lượt trả lời nào đạt được`,
      );
    }
  }
}

/**
 * Kiểm lộ trình. Phần đắt nhất là đối chiếu `itemId` với nội dung THẬT trên đĩa:
 * `learning_path_items.item_id` không có FK (cố ý — nó trỏ vào ba không-gian
 * định danh khác nhau), nên một id gõ sai chỉ hiện ra trên giao diện dưới dạng
 * `title: null`. Bắt ở đây, lúc còn sửa được.
 */
function checkPath({ name, data: path }, quizIds, lessonIds, labIds, issues) {
  const at = (s) => `${name} → ${s}`;
  if (!SCENARIO_ID.test(path.id ?? '')) issues.push(at(`id "${path.id}" sai khuôn scenarioIdSchema`));
  if (`${path.id}.json` !== name) issues.push(at(`id "${path.id}" không khớp tên file`));
  if (typeof path.title !== 'string' || path.title.trim() === '') issues.push(at('thiếu title'));
  if (typeof path.sequential !== 'boolean') issues.push(at('sequential phải là boolean'));
  if (!Array.isArray(path.items) || path.items.length === 0) {
    issues.push(at('cần ít nhất 1 item'));
    return;
  }

  const seen = new Set();
  for (const [index, item] of path.items.entries()) {
    const where = at(`items[${index}]`);
    if (!PATH_ITEM_KINDS.has(item.kind)) {
      issues.push(`${where}: kind phải là lesson|lab|quiz`);
      continue;
    }
    if (!SCENARIO_ID.test(item.itemId ?? '')) issues.push(`${where}: itemId "${item.itemId}" sai khuôn`);
    const key = `${item.kind}:${item.itemId}`;
    if (seen.has(key)) issues.push(`${where}: ${key} lặp lại trong cùng lộ trình`);
    seen.add(key);
    const pool = item.kind === 'lesson' ? lessonIds : item.kind === 'lab' ? labIds : quizIds;
    if (!pool.has(item.itemId)) {
      issues.push(`${where}: ${key} KHÔNG tồn tại — không id nào trong content/ khớp`);
    }
  }
}

/**
 * Nạp `PROBLEMS_SEED` + hằng của hợp đồng, bằng chính Node đang chạy script.
 *
 * ⚠ Ngược hẳn cách quiz/lộ trình được kiểm ở trên: ở đó luật được CHÉP thành
 * regex vì nguồn luật (`packages/shared-types`) không nạp được bằng node trần.
 * `problem.ts` thì nạp được (chỉ có `import type`), nên ở đây ta dùng THẲNG
 * `PROBLEM_STATES` của hợp đồng — không có bản sao thứ hai nào để lệch.
 */
async function readProblems() {
  const seed = await import(pathToFileURL(PROBLEMS_MODULE).href);
  const contract = await import(pathToFileURL(PROBLEM_CONTRACT_MODULE).href);
  const problems = seed.PROBLEMS_SEED;
  if (!Array.isArray(problems)) {
    throw new Error(`${PROBLEMS_MODULE}: không export mảng PROBLEMS_SEED`);
  }
  return { problems, states: new Set(contract.PROBLEM_STATES) };
}

/**
 * Kiểm bài tập — CỐ Ý HẸP, và cái hẹp đó là một quyết định chứ không phải bỏ sót.
 *
 * `publishIssues` (`apps/web/src/server/problems/publish-gate.ts`) gác bốn điều
 * kiện xuất bản: đề ≤150 từ, có ít nhất một mục tiêu bắt buộc, id mục tiêu duy
 * nhất, id gợi ý duy nhất. CẢ BỐN đã được `problems-seed.test.ts` khẳng định
 * trên chính mười bài này, và suite đó chạy trong CI. Chép lại chúng ở đây là
 * duplicate logic không mua thêm một phép kiểm nào — chỉ thêm một chỗ để lệch.
 *
 * Ba điều dưới đây thì KHÔNG chỗ nào khác gác, vì chúng là điều kiện của lượt
 * GHI này chứ không phải của dữ liệu:
 *   1. mảng rỗng — một lượt seed "thành công" mà chèn 0 dòng là đúng chế độ hỏng
 *      mà cả script này tồn tại để chặn;
 *   2. `state` ngoài tập enum — Postgres sẽ ném `invalid input value for enum`
 *      giữa giao dịch, một câu không nêu tên bài nào sai;
 *   3. không bài nào `published` — `problems.list` của người học lọc cứng
 *      `state = 'published'` (`problems/visibility.ts`), nên mười bài `draft`
 *      nạp thành công vẫn để `/problems` rỗng trơn. Đó là một lượt seed XANH
 *      chẳng chứng minh gì.
 */
function checkProblems(problems, states, issues) {
  if (problems.length === 0) {
    issues.push('PROBLEMS_SEED rỗng — không có bài nào để nạp');
    return;
  }
  for (const problem of problems) {
    if (!states.has(problem.state)) {
      issues.push(`bài ${problem.code} → state "${problem.state}" không nằm trong problem_state`);
    }
  }
  if (!problems.some((problem) => problem.state === 'published')) {
    issues.push(
      'không bài nào ở state "published" — nạp xong /problems vẫn rỗng với người học',
    );
  }
}

// ────────────────────────────────────────────────────────────── sinh SQL

/**
 * Dollar-quoting thay vì nhân đôi dấu nháy: nội dung bài học đầy dấu nháy đơn
 * (ví dụ `jsonpath='{.spec.selector}'`) và có cả dấu chéo ngược trong YAML/shell.
 * Với thẻ dollar-quote thì KHÔNG ký tự nào cần thoát — miễn là thẻ không xuất
 * hiện trong chính giá trị, và đó là thứ hàm này KHẲNG ĐỊNH thay vì giả định.
 */
const TAG = 'dlpseed';

function lit(value) {
  if (value === null || value === undefined) return 'NULL';
  const text = String(value);
  if (text.includes(`$${TAG}$`)) {
    throw new Error(`giá trị chứa thẻ "$${TAG}$" — đổi TAG trong scripts/seed-content.mjs`);
  }
  return `$${TAG}$${text}$${TAG}$`;
}

/**
 * `text[]` cho `problems.topics` / `problems.tags` — KHÔNG phải jsonb.
 *
 * Bảng dùng `text[]` + GIN để phục vụ `&&` (chủ đề: HOẶC) và `@>` (tag: VÀ);
 * xem khối chú thích cột `topics` trong `schema.ts`. Ép `::text[]` tường minh vì
 * `ARRAY[]` rỗng không có kiểu suy ra được, và Postgres từ chối nó.
 */
function textArray(values) {
  const items = [...(values ?? [])];
  return items.length === 0 ? 'ARRAY[]::text[]' : `ARRAY[${items.map(lit).join(', ')}]::text[]`;
}

/** jsonb, hoặc `NULL` thật khi giá trị là `null` — `'null'::jsonb` là thứ KHÁC. */
function jsonbLit(value) {
  return value === null || value === undefined ? 'NULL' : `${lit(JSON.stringify(value))}::jsonb`;
}

/** Số nguyên hoặc `NULL`. `lit()` sẽ bọc số thành chuỗi nên không dùng được ở đây. */
function intLit(value) {
  if (value === null || value === undefined) return 'NULL';
  if (!Number.isInteger(value)) {
    throw new Error(`giá trị "${String(value)}" phải là số nguyên`);
  }
  return String(value);
}

function buildSql(quizzes, paths, problems) {
  const out = [];
  const w = (line) => out.push(line);

  w('-- SINH TỰ ĐỘNG bởi scripts/seed-content.mjs — ĐỪNG sửa tay.');
  w('-- Nguồn: content/quizzes/*.json + content/paths/*.json');
  w('BEGIN;');
  w('');
  w('-- Tác giả sở hữu thư viện. Không có hàng `accounts` nên không đăng nhập được.');
  w('INSERT INTO users (id, name, email, email_verified, role)');
  w(`VALUES (${lit(AUTHOR_ID)}, ${lit(AUTHOR_NAME)}, ${lit(AUTHOR_EMAIL)}, true, 'author')`);
  w("ON CONFLICT (id) DO UPDATE SET role = 'author', updated_at = now();");
  w('');
  w('DO $guard$ BEGIN');
  w(`  IF NOT EXISTS (SELECT 1 FROM users WHERE id = ${lit(AUTHOR_ID)}) THEN`);
  w(
    `    RAISE EXCEPTION 'khong tao duoc tac gia % — email % nhieu kha nang da thuoc user khac; dat SEED_AUTHOR_ID/SEED_AUTHOR_EMAIL roi chay lai', ${lit(AUTHOR_ID)}, ${lit(AUTHOR_EMAIL)};`,
  );
  w('  END IF;');
  w('END $guard$;');
  w('');

  for (const { data: quiz } of quizzes) {
    w(`-- quiz: ${quiz.id}`);
    w('DO $own$ BEGIN');
    w(
      `  IF EXISTS (SELECT 1 FROM quizzes WHERE id = ${lit(quiz.id)} AND author_id <> ${lit(AUTHOR_ID)}) THEN`,
    );
    w(
      `    RAISE EXCEPTION 'quiz % da ton tai va thuoc tac gia khac — seed KHONG de len noi dung nguoi khac soan', ${lit(quiz.id)};`,
    );
    w('  END IF;');
    w('END $own$;');
    w('INSERT INTO quizzes (id, author_id, state, title, description, pass_threshold_percent)');
    w(
      `VALUES (${lit(quiz.id)}, ${lit(AUTHOR_ID)}, 'published', ${lit(quiz.title)}, ${lit(quiz.description ?? null)}, ${quiz.passThresholdPercent})`,
    );
    w('ON CONFLICT (id) DO UPDATE SET');
    w("  state = 'published', title = EXCLUDED.title, description = EXCLUDED.description,");
    w('  pass_threshold_percent = EXCLUDED.pass_threshold_percent, updated_at = now();');
    w('-- Xoá sạch rồi chèn lại; quiz_choices cascade theo quiz_questions.');
    w('-- Lượt nộp cũ KHÔNG hỏng: quiz_answers khoá theo question_id/choice_id dạng TEXT.');
    w(`DELETE FROM quiz_questions WHERE quiz_id = ${lit(quiz.id)};`);
    for (const [ordinal, question] of quiz.questions.entries()) {
      w('WITH q AS (');
      w('  INSERT INTO quiz_questions (quiz_id, question_id, ordinal, kind, markdown, explanation)');
      w(
        `  VALUES (${lit(quiz.id)}, ${lit(question.id)}, ${ordinal}, ${lit(question.kind)}, ${lit(question.markdown)}, ${lit(question.explanation ?? null)})`,
      );
      w('  RETURNING id');
      w(')');
      w('INSERT INTO quiz_choices (question_row_id, choice_id, ordinal, markdown, is_correct)');
      w('SELECT q.id, v.choice_id, v.ordinal, v.markdown, v.is_correct FROM q, (VALUES');
      w(
        question.choices
          .map(
            (choice, index) =>
              `  (${lit(choice.id)}, ${index}, ${lit(choice.markdown)}, ${choice.correct === true})`,
          )
          .join(',\n'),
      );
      w(') AS v(choice_id, ordinal, markdown, is_correct);');
    }
    w('');
  }

  for (const { data: path } of paths) {
    w(`-- lo trinh: ${path.id}`);
    w('DO $own$ BEGIN');
    w(
      `  IF EXISTS (SELECT 1 FROM learning_paths WHERE id = ${lit(path.id)} AND author_id <> ${lit(AUTHOR_ID)}) THEN`,
    );
    w(
      `    RAISE EXCEPTION 'lo trinh % da ton tai va thuoc tac gia khac — seed KHONG de len noi dung nguoi khac soan', ${lit(path.id)};`,
    );
    w('  END IF;');
    w('END $own$;');
    w('INSERT INTO learning_paths (id, author_id, state, title, description, sequential)');
    w(
      `VALUES (${lit(path.id)}, ${lit(AUTHOR_ID)}, 'published', ${lit(path.title)}, ${lit(path.description ?? null)}, ${path.sequential === true})`,
    );
    w('ON CONFLICT (id) DO UPDATE SET');
    w("  state = 'published', title = EXCLUDED.title, description = EXCLUDED.description,");
    w('  sequential = EXCLUDED.sequential, updated_at = now();');
    w(`DELETE FROM learning_path_items WHERE path_id = ${lit(path.id)};`);
    w('INSERT INTO learning_path_items (path_id, ordinal, item_kind, item_id) VALUES');
    w(
      path.items
        .map((item, index) => `  (${lit(path.id)}, ${index}, ${lit(item.kind)}, ${lit(item.itemId)})`)
        .join(',\n') + ';',
    );
    w('');
  }

  // ── `author_id` = tác giả thư viện, KHÔNG phải `null` như trong file seed ──
  //
  // `Problem.authorId` của cả mười file là `null`, và ba khối chú thích
  // (`problem.ts`, `schema.ts`, `problems/authz.ts`) đều mô tả bài seed là "bài
  // không có tác giả là một tài khoản". Lượt ghi này CỐ Ý đi khác, và cái giá —
  // ba chú thích kia thành lỗi thời — được ghi ra ở đây thay vì giấu đi.
  //
  // Vì sao đi khác: cùng lý do `quizzes`/`learning_paths` có chủ. Cổng "KHÔNG
  // GIÀNH BÀI CỦA NGƯỜI KHÁC" ở ngay trên so `author_id <> AUTHOR_ID`; với
  // `NULL` thì phép so cho `NULL`, cổng không bao giờ nổ, và một lượt seed sẽ
  // âm thầm `DO UPDATE` đè lên bài mà một người thật vừa soạn nếu mã trùng.
  // Chủ sở hữu là thứ làm cổng đó có nghĩa.
  //
  // ⚠ ĐÍNH CHÍNH một lý do NGHE HỢP LÝ NHƯNG SAI, để lần sau không ai lặp lại:
  // *không* phải "để `/author/problems/:code` chạm tới được bằng tài khoản
  // author thường". Đã đọc mã: `problems.mine` lọc `eq(problems.authorId,
  // authorScope)` với `authorScope = ctx.user.id` cho mọi vai không phải admin
  // (`routers/problems.ts` § mine). Một author KHÁC vẫn nhận 0 dòng — dù
  // `author_id` là `NULL` hay là `dlp-catalog-author`, vì cả hai đều khác id của
  // họ. Thứ thực sự mở được màn đó là vai **admin**: `authorScope = null` nên bộ
  // lọc chủ sở hữu biến mất, và `visibleProblemWhere` cho admin nhận mọi state.
  // Harness e2e đi đúng cửa đó (`roleSatisfies`: admin thoả 'author').
  //
  // Bảo mật KHÔNG lỏng đi: `assertProblemOwner` vẫn trả `NOT_FOUND` cho mọi
  // author khác, và tác giả thư viện KHÔNG có hàng `accounts` nên không ai đăng
  // nhập được thành nó. "Chỉ admin sửa được bài seed" vẫn đúng nguyên văn.
  for (const problem of problems) {
    w(`-- bai tap: ${problem.code}`);
    w('DO $own$ BEGIN');
    w(
      `  IF EXISTS (SELECT 1 FROM problems WHERE code = ${lit(problem.code)} AND author_id <> ${lit(AUTHOR_ID)}) THEN`,
    );
    w(
      `    RAISE EXCEPTION 'bai % da ton tai va thuoc tac gia khac — seed KHONG de len noi dung nguoi khac soan', ${lit(problem.code)};`,
    );
    w('  END IF;');
    w('END $own$;');
    w('INSERT INTO problems (');
    w('  code, slug, title, statement, difficulty, topics, tags, time_limit_sec,');
    w('  initial_state, objectives, allowed_resources, hints, par_moves, state, author_id,');
    w('  created_at, updated_at');
    w(') VALUES (');
    w(
      `  ${lit(problem.code)}, ${lit(problem.slug)}, ${lit(problem.title)}, ${lit(problem.statement)},`,
    );
    w(
      `  ${lit(problem.difficulty)}, ${textArray(problem.topics)}, ${textArray(problem.tags)}, ${intLit(problem.timeLimitSec)},`,
    );
    w(
      `  ${jsonbLit(problem.initialState)}, ${jsonbLit(problem.objectives)}, ${jsonbLit(problem.allowedResources)}, ${jsonbLit(problem.hints)},`,
    );
    w(`  ${intLit(problem.parMoves)}, ${lit(problem.state)}, ${lit(AUTHOR_ID)},`);
    w(`  ${lit(problem.createdAt)}, ${lit(problem.updatedAt)}`);
    w(')');
    // `created_at` vắng mặt ở đây là CÓ Ý — xem khối "IDEMPOTENT" ở đầu file.
    w('ON CONFLICT (code) DO UPDATE SET');
    w('  slug = EXCLUDED.slug, title = EXCLUDED.title, statement = EXCLUDED.statement,');
    w('  difficulty = EXCLUDED.difficulty, topics = EXCLUDED.topics, tags = EXCLUDED.tags,');
    w('  time_limit_sec = EXCLUDED.time_limit_sec, initial_state = EXCLUDED.initial_state,');
    w('  objectives = EXCLUDED.objectives, allowed_resources = EXCLUDED.allowed_resources,');
    w('  hints = EXCLUDED.hints, par_moves = EXCLUDED.par_moves, state = EXCLUDED.state,');
    w('  author_id = EXCLUDED.author_id, updated_at = now();');
    w('');
  }

  w('COMMIT;');
  w('');
  return out.join('\n');
}

// ───────────────────────────────────────────────────────────────── chạy

/**
 * ĐỌC LẠI từ DB sau khi COMMIT, và so với thứ vừa gửi đi.
 *
 * Không phải nghi lễ. Dòng tổng kết mà script in ra trước đây đếm ĐẦU VÀO —
 * số file JSON đọc được — chứ không đếm dòng trong bảng, nên nó in ra
 * "đã nạp: 3 lộ trình / 4 quiz" y hệt nhau dù giao dịch có ghi được gì hay
 * không. Đó đúng lớp "một cái xanh chẳng chứng minh gì" ở
 * `rules/green-that-proves-nothing.md`: phép đo lấy từ nguồn không thể chứa
 * bằng chứng cần chứng minh.
 *
 * Phép đọc lại này chỉ tồn tại trên đường THỰC THI. Đường `--print` in SQL cho
 * người khác chạy bằng `psql`, nên nó không có kết nối nào để đọc lại — ai chạy
 * đường đó phải tự đếm, và `docs/content-sources.md` nói ra điều đó.
 */
async function verifySeeded(sql, expectations) {
  const lech = [];
  for (const { table, column, values, label } of expectations) {
    if (values.length === 0) continue;
    const rows = await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${column} IN (${values.map(lit).join(', ')})`,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n !== values.length) {
      lech.push(`${label}: gửi ${values.length} dòng vào ${table}, đọc lại được ${n}`);
    }
  }
  if (lech.length > 0) {
    throw new Error(`giao dịch báo xong nhưng đọc lại KHÔNG khớp:\n  · ${lech.join('\n  · ')}`);
  }
}

async function execute(sqlText, expectations) {
  // Driver `postgres` được phân giải từ cây phụ thuộc của apps/web: script này
  // sống ở gốc repo, nơi package.json chỉ có eslint/prettier/turbo/tsc. Trỏ
  // createRequire vào apps/web/package.json là dùng ĐÚNG driver mà app dùng,
  // không thêm một phụ thuộc thứ hai vào gốc.
  const { createRequire } = await import('node:module');
  const requireFromWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
  let postgres;
  try {
    postgres = requireFromWeb('postgres');
  } catch (error) {
    console.error(
      `[seed] không nạp được driver "postgres" từ apps/web — chạy \`pnpm install\` trước, hoặc dùng --print rồi psql -f. (${error.message})`,
    );
    process.exit(2);
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe(sqlText);
    await verifySeeded(sql, expectations);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const printOnly = args.has('--print');
  const checkOnly = args.has('--check');

  const quizzes = readJsonDir(QUIZZES_DIR);
  const paths = readJsonDir(PATHS_DIR);
  const { problems, states } = await readProblems();

  const issues = [];
  const quizIds = new Set(quizzes.map((entry) => entry.data.id));
  const lessonIds = new Set(subdirs(SCENARIOS_DIR));
  const labIds = new Set(subdirs(LABS_DIR));
  for (const entry of quizzes) checkQuiz(entry, issues);
  for (const entry of paths) checkPath(entry, quizIds, lessonIds, labIds, issues);
  checkProblems(problems, states, issues);

  if (issues.length > 0) {
    console.error(`[seed] nội dung KHÔNG hợp lệ — ${issues.length} vấn đề, không ghi gì cả:`);
    for (const issue of issues) console.error(`  · ${issue}`);
    process.exit(1);
  }

  const questionCount = quizzes.reduce((n, entry) => n + entry.data.questions.length, 0);
  const choiceCount = quizzes.reduce(
    (n, entry) => n + entry.data.questions.reduce((m, q) => m + q.choices.length, 0),
    0,
  );
  const itemCount = paths.reduce((n, entry) => n + entry.data.items.length, 0);
  const publishedProblems = problems.filter((problem) => problem.state === 'published').length;
  const summary =
    `${paths.length} lộ trình / ${itemCount} item · ` +
    `${quizzes.length} quiz / ${questionCount} câu / ${choiceCount} lựa chọn · ` +
    `${problems.length} bài tập (${publishedProblems} published)`;

  if (checkOnly) {
    console.error(`[seed] nội dung hợp lệ: ${summary}`);
    return;
  }

  const sqlText = buildSql(quizzes, paths, problems);

  if (printOnly) {
    process.stdout.write(sqlText);
    console.error(`[seed] đã in SQL: ${summary}`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      '[seed] thiếu DATABASE_URL. Đặt biến đó, hoặc dùng --print để lấy SQL rồi nạp bằng psql.',
    );
    process.exit(2);
  }

  await execute(sqlText, [
    { table: 'learning_paths', column: 'id', label: 'lộ trình', values: paths.map((e) => e.data.id) },
    { table: 'quizzes', column: 'id', label: 'quiz', values: quizzes.map((e) => e.data.id) },
    { table: 'problems', column: 'code', label: 'bài tập', values: problems.map((p) => p.code) },
  ]);
  console.error(`[seed] đã nạp và đọc lại khớp: ${summary} (tác giả ${AUTHOR_ID})`);
}

main().catch((error) => {
  console.error(`[seed] LỖI: ${error.message}`);
  process.exit(1);
});
