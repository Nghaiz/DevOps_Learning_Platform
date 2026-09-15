/**
 * **Đọc** một workflow YAML của nhà cung cấp CI thành `WorkflowSpec` (19.C.1),
 * kèm dòng + cột thật cho mọi lỗi (19.C.3).
 *
 * Đây là TẦNG NHÀ CUNG CẤP. File được đặt tên `yaml-*` nên
 * `scripts/check-cicd-vendor-neutral.mjs` phân nó vào tầng đó và cho phép nó
 * mang tên khoá, tên hành động dựng sẵn, tên nhãn máy chạy — những thứ mà lõi
 * (`contract.ts`, `engine.ts`, `graph.ts`, ...) tuyệt đối không được mang.
 * Thêm nhà cung cấp thứ hai là thêm một file như file này, không đụng lõi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỘ QUÉT DÙNG LẠI, KHÔNG VIẾT BỘ THỨ HAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phép quét cú pháp là `core/yaml.ts`. File này chỉ biết TẦNG NGỮ NGHĨA: khoá
 * nào có nghĩa gì, giá trị nào hợp lệ. Hai bộ quét YAML trong một kho mã sẽ
 * bất đồng ý về `#` trong nháy hay về `1.27-alpine` mà không ô nào đỏ.
 *
 * ⚠ **Cây trả về từ `parseYaml` được giữ NGUYÊN, không sao chép.** Bản đồ vị
 * trí tra theo THAM CHIẾU object; `{ ...node }` / `structuredClone` /
 * `JSON.parse(JSON.stringify(...))` đều sinh object mới và mọi lời tra sau đó
 * trả `null`, tức mọi lỗi mất dòng-cột — hỏng IM LẶNG, vì `{line: 0, column: 0}`
 * vẫn là một giá trị hợp lệ. Mọi hàm dưới đây nhận chính object của cây.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẢNG ÁNH XẠ — HỢP ĐỒNG, VÀ `yaml-write.ts` PHẢI KHỚP NGƯỢC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * | YAML                              | `WorkflowSpec`                       |
 * |-----------------------------------|--------------------------------------|
 * | `name`                            | `WorkflowSpec.name`                  |
 * | `jobs.<key>`                      | `StageSpec.id`                       |
 * | `jobs.<key>.name`                 | `StageSpec.name` (vắng ⇒ id)         |
 * | `jobs.<key>.needs` (chuỗi/dãy)    | `StageSpec.dependsOn`                |
 * | `jobs.<key>.runs-on`              | `StageSpec.runnerClass`              |
 * | `jobs.<key>.continue-on-error`    | `StageSpec.blocking` — **NGHĨA ĐẢO** |
 * | `jobs.<key>.strategy.matrix`      | `StageSpec.fanOut`                   |
 * | `jobs.<key>.environment`          | `StageSpec.environment`              |
 * | `jobs.<key>.steps[]`              | `StageSpec.steps[]`                  |
 * | `steps[].id`                      | `StepSpec.id` (vắng ⇒ sinh từ chỉ số)|
 * | `steps[].name`                    | `StepSpec.name` (vắng ⇒ id của bước) |
 * | `steps[].continue-on-error`       | `StepSpec.blocking` — **NGHĨA ĐẢO**  |
 *
 * `StageSpec.kind` không có khoá tương ứng — suy bằng `yaml-kind.ts`.
 *
 * ⚠ **NGHĨA ĐẢO** là chỗ dễ sai nhất và sai của nó im lặng: `continue-on-error:
 * true` nghĩa là "đỏ thì đi tiếp", tức `blocking: false`. Đọc ngược sẽ cho ra
 * một workflow vẫn chạy được, vẫn chấm được, chỉ là mọi stage cảnh báo bỗng
 * chặn cả lượt — không lỗi ở đâu cả.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THỨ YAML KHÔNG MANG, VÀ MẶC ĐỊNH ĐƯỢC ÁP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tài liệu của nhà cung cấp không có khoá nào cho `durationTicks`, `retries`,
 * `flake`, `cache`, `requires`/`produces`, `runnerSlots`, `approval`. Bộ đọc áp
 * mặc định trung tính (0 / rỗng / vắng) và **không đoán**. Dữ liệu thật của
 * những trường đó là dữ liệu LEVEL, không phải thứ người chơi gõ.
 *
 * Chiều ngược lại — một `WorkflowSpec` MANG những trường đó rồi bị ghi ra YAML
 * — là chỗ mất mát thật, và `yaml-write.ts` khai báo từng trường bị bỏ trong
 * `dropped` thay vì im lặng nuốt. Xem file đó.
 */

import { parseYaml } from '../core/yaml.ts';
import type { YamlPositionIndex, YamlValue } from '../core/yaml.ts';
import type {
  FanOutAxis,
  FanOutSpec,
  InstanceKey,
  StageId,
  StageSpec,
  StepSpec,
  WorkflowSpec,
} from './contract.ts';
import { suyRaKind } from './yaml-kind.ts';

// ── Hằng mặc định ───────────────────────────────────────────────────────────

/** Dùng khi tài liệu không khai `name`. Bộ ghi LUÔN phát khoá này nên vòng đọc-ghi không chạm tới đây. */
export const TEN_WORKFLOW_MAC_DINH = 'Đường ống chưa đặt tên';

/** Dùng khi job không khai `runs-on`. Phải khớp một `RunnerPool.id` của level. */
export const HANG_MAY_MAC_DINH = 'linux';

/**
 * `StepSpec.durationTicks` khi YAML không nói gì — và YAML không bao giờ nói gì.
 *
 * `0` là lựa chọn TRUNG TÍNH chứ không phải lựa chọn "an toàn": nó cộng thêm
 * đúng không tick nào, nên một workflow đọc từ file thật sẽ có đường găng dài 0
 * — hiển nhiên sai, và hiển nhiên là "thiếu dữ liệu thời lượng" chứ không phải
 * một con số bịa nhìn như thật. Một mặc định `1` sẽ cho ra những phép đo có vẻ
 * hợp lý mà không dựa trên gì.
 */
export const TICK_MAC_DINH = 0;

/** `[a-z0-9-]`, không rỗng — đúng ràng buộc ASCII của `StageId`/`StepId` (`contract.ts` §1). */
const ID_HOP_LE = /^[a-z0-9-]+$/;

/** Tên trục quạt đi vào `InstanceKey` nên cũng phải ASCII. */
const TEN_TRUC_HOP_LE = /^[A-Za-z0-9_-]+$/;

/** Khoá cấp job mà bộ đọc HIỂU. Khoá khác được ghi vào `ignored`, không im lặng. */
const KHOA_JOB_HIEU = new Set([
  'name',
  'needs',
  'runs-on',
  'continue-on-error',
  'strategy',
  'environment',
  'steps',
]);

/**
 * Khoá cấp bước mà bộ đọc HIỂU.
 *
 * `uses` và `run` nằm ở đây dù không ánh xạ sang trường nào: chúng là tín hiệu
 * của `yaml-kind.ts`. Xếp chúng vào `ignored` sẽ nói dối — chúng có được đọc.
 */
const KHOA_BUOC_HIEU = new Set(['id', 'name', 'continue-on-error', 'uses', 'run']);

const KHOA_GOC_HIEU = new Set(['name', 'jobs']);

// ── Kết quả ─────────────────────────────────────────────────────────────────

export interface YamlDiagnostic {
  /** Tiếng Việt, một câu, nói ra thứ phải sửa. */
  readonly message: string;
  /** 1-based. `0` = không xác định được (xem `YamlPosition` ở `core/yaml.ts`). */
  readonly line: number;
  /** 1-based, mã đơn vị UTF-16. `0` = không xác định được. */
  readonly column: number;
}

/**
 * Một khoá bộ đọc hiểu cú pháp nhưng game không mô phỏng.
 *
 * Tồn tại vì hai đường còn lại đều sai: **từ chối** làm mọi workflow thật không
 * đọc được (`permissions`, `timeout-minutes`, `if` là khoá bình thường), còn
 * **im lặng bỏ qua** làm người chơi thêm một khoá rồi chờ một hiệu ứng không
 * bao giờ tới.
 */
export interface KhoaBoQua {
  /** Đường dẫn đọc được, ví dụ `jobs.build.timeout-minutes`. */
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

export type WorkflowReadResult =
  | {
      readonly ok: true;
      readonly workflow: WorkflowSpec;
      readonly ignored: readonly KhoaBoQua[];
    }
  | {
      readonly ok: false;
      /** Ít nhất một phần tử, đã sắp theo (dòng, cột, thông điệp) cho tất định. */
      readonly errors: readonly YamlDiagnostic[];
    };

// ── Tiện ích trên cây đã quét ───────────────────────────────────────────────

type YamlMap = { [key: string]: YamlValue };

function laMap(value: YamlValue | undefined): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function laDay(value: YamlValue | undefined): value is YamlValue[] {
  return Array.isArray(value);
}

/**
 * Vô hướng → chuỗi.
 *
 * Ép kiểu chứ không từ chối, vì `name: 2026` và `- 20` trong một trục ma trận là
 * YAML hợp lệ mà người ta gõ thật; `parseScalar` đã biến chúng thành `number`
 * trước khi tầng này nhìn thấy. Phần hợp lệ hoá nằm ở chỗ khác (`ID_HOP_LE`),
 * nên phép ép này không nới lỏng ràng buộc nào.
 */
function chuoi(value: YamlValue | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/** Gom lỗi + khoá bỏ qua, và giữ `positions` để mọi lời tra đi qua đúng một chỗ. */
class BoDoc {
  readonly errors: YamlDiagnostic[] = [];
  readonly ignored: KhoaBoQua[] = [];

  constructor(private readonly positions: YamlPositionIndex) {}

  /** Lỗi trỏ vào KHOÁ — thứ người đọc đi tìm khi một khoá tham chiếu sai. */
  loi(container: unknown, key: string | number, message: string): void {
    const at = this.positions.key(container, key) ?? { line: 0, column: 0 };
    this.errors.push({ message, line: at.line, column: at.column });
  }

  /** Lỗi trỏ vào chính khối (map/dãy) — dùng khi lỗi là về hình dạng của khối. */
  loiTaiNut(container: unknown, message: string): void {
    const at = this.positions.node(container)?.self ?? { line: 0, column: 0 };
    this.errors.push({ message, line: at.line, column: at.column });
  }

  boQua(container: unknown, key: string, path: string): void {
    const at = this.positions.key(container, key) ?? { line: 0, column: 0 };
    this.ignored.push({ path, line: at.line, column: at.column });
  }
}

// ── Cửa vào ─────────────────────────────────────────────────────────────────

export function readWorkflowYaml(source: string): WorkflowReadResult {
  const quet = parseYaml(source);
  if (!quet.ok) {
    // Chuyển tiếp NGUYÊN VẸN dòng + cột của bộ quét. Bọc lại bằng một thông
    // điệp chung chung là vứt đi đúng thứ 19.C.3 tồn tại để có.
    return { ok: false, errors: [{ message: quet.error, line: quet.line, column: quet.column }] };
  }

  const doc = new BoDoc(quet.positions);
  const goc = quet.documents[0];

  if (quet.documents.length > 1) {
    return {
      ok: false,
      errors: [
        {
          message: `Tài liệu có ${quet.documents.length} phần ngăn bởi "---"; một workflow chỉ được có một.`,
          line: 0,
          column: 0,
        },
      ],
    };
  }
  if (!laMap(goc)) {
    return {
      ok: false,
      errors: [{ message: 'Tài liệu rỗng hoặc không phải một map — cần ít nhất khoá "jobs".', line: 0, column: 0 }],
    };
  }

  for (const khoa of Object.keys(goc)) {
    if (!KHOA_GOC_HIEU.has(khoa)) {
      doc.boQua(goc, khoa, khoa);
    }
  }

  const name = chuoi(goc['name']) ?? TEN_WORKFLOW_MAC_DINH;
  const jobs = goc['jobs'];
  if (jobs === undefined || jobs === null) {
    doc.loiTaiNut(goc, 'Thiếu khoá "jobs" — không có job nào thì không có stage nào.');
    return { ok: false, errors: sapLoi(doc.errors) };
  }
  if (!laMap(jobs)) {
    doc.loi(goc, 'jobs', '"jobs" phải là một map "tên-job: { ... }", không phải một dãy hay một giá trị đơn.');
    return { ok: false, errors: sapLoi(doc.errors) };
  }

  const stages: StageSpec[] = [];
  for (const jobId of Object.keys(jobs)) {
    const stage = docJob(doc, jobs, jobId);
    if (stage !== null) {
      stages.push(stage);
    }
  }

  if (doc.errors.length > 0) {
    return { ok: false, errors: sapLoi(doc.errors) };
  }
  return { ok: true, workflow: { name, stages }, ignored: doc.ignored };
}

/** Tất định: cùng nguồn ⇒ cùng thứ tự lỗi, không phụ thuộc thứ tự duyệt. */
function sapLoi(errors: readonly YamlDiagnostic[]): readonly YamlDiagnostic[] {
  return [...errors].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    if (a.column !== b.column) return a.column - b.column;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
}

// ── Một job ⇒ một stage ─────────────────────────────────────────────────────

function docJob(doc: BoDoc, jobs: YamlMap, jobId: string): StageSpec | null {
  if (!ID_HOP_LE.test(jobId)) {
    doc.loi(
      jobs,
      jobId,
      `Tên job "${jobId}" không hợp lệ: chỉ nhận chữ thường ASCII, chữ số và dấu gạch ngang. ` +
        'Ràng buộc này là thật — id là khoá sắp thứ tự hàng đợi, và sắp chuỗi có dấu cho ra thứ tự khác nhau giữa các máy.',
    );
    return null;
  }

  const job = jobs[jobId];
  if (!laMap(job)) {
    doc.loi(jobs, jobId, `Job "${jobId}" phải là một map các khoá, không phải một giá trị đơn.`);
    return null;
  }

  for (const khoa of Object.keys(job)) {
    if (!KHOA_JOB_HIEU.has(khoa)) {
      doc.boQua(job, khoa, `jobs.${jobId}.${khoa}`);
    }
  }

  const name = chuoi(job['name']) ?? jobId;
  const dependsOn = docNeeds(doc, job, jobId);
  const runnerClass = docRunsOn(doc, job, jobId);
  const blocking = docContinueOnError(doc, job, `jobs.${jobId}`);
  const fanOut = docStrategy(doc, job, jobId);
  const environment = docEnvironment(doc, job, jobId);
  const steps = docSteps(doc, job, jobId);

  const kind = suyRaKind({
    jobId,
    jobName: name,
    uses: steps.uses,
    run: steps.run,
  }).kind;

  return {
    id: jobId,
    kind,
    name,
    dependsOn,
    steps: steps.specs,
    blocking,
    retries: 0,
    runnerClass,
    ...(fanOut === null ? {} : { fanOut }),
    ...(environment === null ? {} : { environment }),
  };
}

function docNeeds(doc: BoDoc, job: YamlMap, jobId: string): readonly StageId[] {
  const raw = job['needs'];
  if (raw === undefined || raw === null) {
    return [];
  }

  const thoMuc: readonly YamlValue[] = laDay(raw) ? raw : [raw];
  if (!laDay(raw) && laMap(raw)) {
    doc.loi(job, 'needs', '"needs" phải là một tên job hoặc một dãy tên job, không phải một map.');
    return [];
  }

  const out: StageId[] = [];
  for (const [i, phan] of thoMuc.entries()) {
    const ten = chuoi(phan);
    if (ten === null) {
      doc.loi(job, 'needs', `Phần tử thứ ${i + 1} của "needs" không phải một tên job.`);
      continue;
    }
    if (!ID_HOP_LE.test(ten)) {
      doc.loi(job, 'needs', `"needs" trỏ tới "${ten}" — tên job chỉ nhận chữ thường ASCII, chữ số và gạch ngang.`);
      continue;
    }
    if (out.includes(ten)) {
      doc.loi(job, 'needs', `"needs" của job "${jobId}" nhắc "${ten}" hai lần.`);
      continue;
    }
    out.push(ten);
  }
  return out;
}

function docRunsOn(doc: BoDoc, job: YamlMap, jobId: string): string {
  const raw = job['runs-on'];
  if (raw === undefined || raw === null) {
    return HANG_MAY_MAC_DINH;
  }
  if (laDay(raw)) {
    doc.loi(
      job,
      'runs-on',
      `Job "${jobId}" khai "runs-on" dạng dãy nhãn. Game mô hình hoá máy chạy bằng MỘT hạng ` +
        '(`runnerClass`), nên hãy viết đúng một giá trị.',
    );
    return HANG_MAY_MAC_DINH;
  }
  const ten = chuoi(raw);
  if (ten === null || ten === '') {
    doc.loi(job, 'runs-on', `"runs-on" của job "${jobId}" phải là một hạng máy chạy dạng chuỗi.`);
    return HANG_MAY_MAC_DINH;
  }
  return ten;
}

/** ⚠ NGHĨA ĐẢO: `continue-on-error: true` ⇒ `blocking: false`. */
function docContinueOnError(doc: BoDoc, map: YamlMap, path: string): boolean {
  const raw = map['continue-on-error'];
  if (raw === undefined || raw === null) {
    return true;
  }
  if (typeof raw !== 'boolean') {
    doc.loi(
      map,
      'continue-on-error',
      `"continue-on-error" ở ${path} phải là true hoặc false. ` +
        'Biểu thức của nhà cung cấp không chạy trong game vì không có ngữ cảnh lượt chạy để tính.',
    );
    return true;
  }
  return !raw;
}

function docEnvironment(doc: BoDoc, job: YamlMap, jobId: string): string | null {
  const raw = job['environment'];
  if (raw === undefined || raw === null) {
    return null;
  }
  if (laMap(raw)) {
    const ten = chuoi(raw['name']);
    if (ten === null || ten === '') {
      doc.loi(job, 'environment', `"environment" dạng map của job "${jobId}" phải có khoá "name".`);
      return null;
    }
    for (const khoa of Object.keys(raw)) {
      if (khoa !== 'name') {
        doc.boQua(raw, khoa, `jobs.${jobId}.environment.${khoa}`);
      }
    }
    return ten;
  }
  const ten = chuoi(raw);
  if (ten === null || ten === '') {
    doc.loi(job, 'environment', `"environment" của job "${jobId}" phải là tên môi trường hoặc một map có "name".`);
    return null;
  }
  return ten;
}

// ── strategy.matrix ⇒ FanOutSpec ────────────────────────────────────────────

function docStrategy(doc: BoDoc, job: YamlMap, jobId: string): FanOutSpec | null {
  const strategy = job['strategy'];
  if (strategy === undefined || strategy === null) {
    return null;
  }
  if (!laMap(strategy)) {
    doc.loi(job, 'strategy', `"strategy" của job "${jobId}" phải là một map.`);
    return null;
  }
  for (const khoa of Object.keys(strategy)) {
    if (khoa !== 'matrix') {
      doc.boQua(strategy, khoa, `jobs.${jobId}.strategy.${khoa}`);
    }
  }

  const matrix = strategy['matrix'];
  if (matrix === undefined || matrix === null) {
    return null;
  }
  if (!laMap(matrix)) {
    doc.loi(strategy, 'matrix', `"strategy.matrix" của job "${jobId}" phải là một map trục → dãy giá trị.`);
    return null;
  }

  if ('include' in matrix) {
    // Không có mặc định nào đúng ở đây. `include` thêm những tổ hợp KHÔNG sinh
    // ra từ tích Descartes của các trục (và còn gắn thêm biến riêng cho từng
    // tổ hợp), trong khi `FanOutSpec` là tích Descartes cộng một danh sách
    // loại trừ. Bỏ qua nó sẽ cho ra một workflow chạy ít thực thể hơn chính
    // file người ta gõ — sai lệch im lặng đúng ở chỗ đắt nhất.
    doc.loi(
      matrix,
      'include',
      `Job "${jobId}": "matrix.include" chưa mô hình hoá được. Game quạt stage bằng TÍCH của các trục ` +
        '(`FanOutSpec.axes`) cộng danh sách loại trừ, nên hãy viết các tổ hợp thành trục, hoặc tách thành nhiều job.',
    );
    return null;
  }

  const axes: FanOutAxis[] = [];
  let soTrucKhai = 0;
  for (const truc of Object.keys(matrix)) {
    if (truc === 'exclude') {
      continue;
    }
    soTrucKhai += 1;
    if (!TEN_TRUC_HOP_LE.test(truc)) {
      doc.loi(matrix, truc, `Tên trục "${truc}" phải là ASCII — nó đi thẳng vào khoá rút ngẫu nhiên của lượt chạy.`);
      continue;
    }
    const gia = matrix[truc];
    if (!laDay(gia)) {
      doc.loi(matrix, truc, `Trục "${truc}" của job "${jobId}" phải là một dãy giá trị.`);
      continue;
    }
    const values = docGiaTriTruc(doc, matrix, truc, gia, jobId);
    if (values !== null) {
      axes.push({ name: truc, values });
    }
  }

  if (axes.length === 0) {
    // ⚠ CHỈ kêu khi ma trận thật sự TRỐNG. Khi có trục nhưng mọi trục đều hỏng,
    // lỗi cụ thể đã được ghi ở vòng trên và nó trỏ đúng vào trục sai; thêm một
    // lỗi tổng quát ở đây là bắt người chơi đọc hai thông điệp cho một chỗ sửa,
    // và cái thứ hai còn trỏ vào một dòng không có gì sai.
    if (soTrucKhai === 0) {
      doc.loi(strategy, 'matrix', `"strategy.matrix" của job "${jobId}" không khai trục nào.`);
    }
    return null;
  }

  const exclude = docExclude(doc, matrix, axes, jobId);
  return {
    axes,
    ...(exclude === null || exclude.length === 0 ? {} : { exclude }),
  };
}

function docGiaTriTruc(
  doc: BoDoc,
  matrix: YamlMap,
  truc: string,
  gia: readonly YamlValue[],
  jobId: string,
): readonly string[] | null {
  if (gia.length === 0) {
    doc.loi(matrix, truc, `Trục "${truc}" của job "${jobId}" rỗng — một trục không có giá trị nào thì quạt ra 0 thực thể.`);
    return null;
  }
  const out: string[] = [];
  for (const [i, v] of gia.entries()) {
    const s = chuoi(v);
    if (s === null || s === '') {
      doc.loi(matrix, truc, `Giá trị thứ ${i + 1} của trục "${truc}" phải là một vô hướng không rỗng.`);
      return null;
    }
    // `InstanceKey` là `stageId + '#' + values.join('/')` (hợp đồng §1). Một
    // giá trị chứa `/` hay `#` làm khoá đó không tách ngược được, nên hai tổ
    // hợp khác nhau có thể trùng khoá — tức trùng cả chuỗi rút ngẫu nhiên.
    if (s.includes('/') || s.includes('#')) {
      doc.loi(
        matrix,
        truc,
        `Giá trị "${s}" của trục "${truc}" chứa "/" hoặc "#". Hai ký tự đó dựng nên khoá thực thể ` +
          '(`stage#giá-trị-1/giá-trị-2`), nên dùng chúng trong giá trị sẽ làm hai tổ hợp khác nhau trùng khoá.',
      );
      return null;
    }
    if (out.includes(s)) {
      doc.loi(matrix, truc, `Trục "${truc}" của job "${jobId}" khai giá trị "${s}" hai lần.`);
      return null;
    }
    out.push(s);
  }
  return out;
}

function docExclude(
  doc: BoDoc,
  matrix: YamlMap,
  axes: readonly FanOutAxis[],
  jobId: string,
): readonly InstanceKey[] | null {
  const raw = matrix['exclude'];
  if (raw === undefined || raw === null) {
    return null;
  }
  if (!laDay(raw)) {
    doc.loi(matrix, 'exclude', `"matrix.exclude" của job "${jobId}" phải là một dãy tổ hợp.`);
    return null;
  }

  const out: InstanceKey[] = [];
  for (const [i, to] of raw.entries()) {
    if (!laMap(to)) {
      doc.loi(matrix, 'exclude', `Tổ hợp loại trừ thứ ${i + 1} của job "${jobId}" phải là một map trục → giá trị.`);
      continue;
    }
    const phan: string[] = [];
    let du = true;
    for (const truc of axes) {
      const v = chuoi(to[truc.name]);
      if (v === null) {
        // Loại trừ MỘT PHẦN ("bỏ mọi tổ hợp có os=mac") là hợp lệ ở nhà cung
        // cấp nhưng `FanOutSpec.exclude` mang `InstanceKey` ĐẦY ĐỦ. Suy ra tập
        // đầy đủ thì được, nhưng nó phình theo tích các trục còn lại và biến
        // một dòng người chơi gõ thành N dòng họ không gõ — hợp đồng cố ý
        // không có chỗ cho chuyện đó.
        doc.loiTaiNut(
          to,
          `Tổ hợp loại trừ thứ ${i + 1} của job "${jobId}" thiếu trục "${truc.name}". ` +
            'Mỗi tổ hợp loại trừ phải khai đủ mọi trục, vì nó được lưu dưới dạng một khoá thực thể đầy đủ.',
        );
        du = false;
        break;
      }
      if (!truc.values.includes(v)) {
        doc.loiTaiNut(
          to,
          `Tổ hợp loại trừ thứ ${i + 1} của job "${jobId}" đặt trục "${truc.name}" = "${v}", ` +
            'giá trị này không có trong trục.',
        );
        du = false;
        break;
      }
      phan.push(v);
    }
    if (!du) {
      continue;
    }
    for (const khoa of Object.keys(to)) {
      if (!axes.some((a) => a.name === khoa)) {
        doc.boQua(to, khoa, `jobs.${jobId}.strategy.matrix.exclude[${i}].${khoa}`);
      }
    }
    out.push(`${jobId}#${phan.join('/')}`);
  }
  return out;
}

// ── steps ───────────────────────────────────────────────────────────────────

interface KetQuaBuoc {
  readonly specs: readonly StepSpec[];
  /** Tín hiệu cho `yaml-kind.ts` — gom ở đây vì chỉ chỗ này duyệt qua các bước. */
  readonly uses: readonly string[];
  readonly run: readonly string[];
}

const KHONG_CO_BUOC: KetQuaBuoc = { specs: [], uses: [], run: [] };

function docSteps(doc: BoDoc, job: YamlMap, jobId: string): KetQuaBuoc {
  const raw = job['steps'];
  if (raw === undefined || raw === null) {
    return KHONG_CO_BUOC;
  }
  if (!laDay(raw)) {
    doc.loi(job, 'steps', `"steps" của job "${jobId}" phải là một dãy các bước, mỗi bước một gạch đầu dòng.`);
    return KHONG_CO_BUOC;
  }

  const specs: StepSpec[] = [];
  const uses: string[] = [];
  const run: string[] = [];
  const daDung = new Set<string>();

  for (const [i, buoc] of raw.entries()) {
    if (!laMap(buoc)) {
      doc.loi(raw, i, `Bước thứ ${i + 1} của job "${jobId}" phải là một map các khoá.`);
      continue;
    }
    for (const khoa of Object.keys(buoc)) {
      if (!KHOA_BUOC_HIEU.has(khoa)) {
        doc.boQua(buoc, khoa, `jobs.${jobId}.steps[${i}].${khoa}`);
      }
    }

    const dung = chuoi(buoc['uses']);
    if (dung !== null) {
      uses.push(dung);
    }
    const chay = chuoi(buoc['run']);
    if (chay !== null) {
      run.push(chay);
    }

    const khaiId = chuoi(buoc['id']);
    // Sinh từ CHỈ SỐ nên tất định, và 1-based để khớp cách người ta đếm bước
    // trong giao diện của nhà cung cấp.
    const id = khaiId ?? `buoc-${i + 1}`;
    if (!ID_HOP_LE.test(id)) {
      doc.loi(
        buoc,
        'id',
        `Bước thứ ${i + 1} của job "${jobId}" có id "${id}" không hợp lệ: chỉ nhận chữ thường ASCII, chữ số, gạch ngang.`,
      );
      continue;
    }
    if (daDung.has(id)) {
      doc.loi(
        buoc,
        khaiId === null ? 'name' : 'id',
        `Job "${jobId}" có hai bước cùng id "${id}". Id bước không khai sẽ sinh thành "buoc-<số thứ tự>", ` +
          'nên một id khai tay trùng dạng đó cũng gây va chạm.',
      );
      continue;
    }
    daDung.add(id);

    specs.push({
      id,
      name: chuoi(buoc['name']) ?? id,
      durationTicks: TICK_MAC_DINH,
      blocking: docContinueOnError(doc, buoc, `jobs.${jobId}.steps[${i}]`),
    });
  }

  return { specs, uses, run };
}
