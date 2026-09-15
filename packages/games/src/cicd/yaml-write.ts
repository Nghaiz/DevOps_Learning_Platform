/**
 * **Ghi** một `WorkflowSpec` ra YAML của nhà cung cấp CI (19.C.2).
 *
 * Tầng nhà cung cấp, như `yaml-read.ts`. Bảng ánh xạ là bảng ở đầu file đó —
 * **một bảng, hai chiều**. Hai bảng sẽ trôi khỏi nhau, và triệu chứng duy nhất
 * là một vòng đọc-ghi làm đổi workflow của người chơi mà không lệnh nào đỏ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * YAML KHÔNG CHỞ ĐƯỢC CẢ `WorkflowSpec` — VÀ ĐÓ LÀ THỨ `dropped` NÓI RA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tài liệu của nhà cung cấp không có khoá nào cho `durationTicks`, `retries`,
 * `flake`, `cache`, `requires`/`produces`, `runnerSlots`, `approval`,
 * `durationSpreadTicks`. Ba đường đi, và hai trong số đó sai:
 *
 * - **Im lặng bỏ** — một level ghi ra rồi đọc lại sẽ mất toàn bộ thời lượng và
 *   cache, engine vẫn chạy, điểm vẫn ra, chỉ là ra số khác. Không gì đỏ.
 * - **Bịa một khoá riêng** (`x-dlp-duration:`) — người chơi học một khoá không
 *   tồn tại ở bất kỳ nhà cung cấp nào. Game này dạy YAML thật; dạy một khoá ma
 *   là phá đúng thứ nó tồn tại để làm.
 * - **Khai ra** — hàm này trả `dropped`, liệt kê từng trường không chở được,
 *   kèm stage/bước và lý do. Nơi gọi quyết định: level giữ bản `WorkflowSpec`
 *   gốc làm nguồn sự thật, YAML chỉ là thứ người chơi nhìn và sửa.
 *
 * `read(write(spec))` bằng `spec` **khi và chỉ khi `dropped` rỗng**, và
 * `yaml-write.test.ts` ghim cả hai vế: vế xuôi trên một tập spec chở được, vế
 * ngược bằng một spec cho mỗi trường không chở được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `kind` — BỘ GHI TỰ KIỂM, KHÔNG TỰ TIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `StageKind` cũng không có khoá YAML nào; bộ đọc SUY nó ra bằng
 * `yaml-kind.ts`. Nên bộ ghi không thể chỉ "bỏ qua kind": nó phải biết liệu
 * phép suy có trả lại đúng giá trị cũ hay không.
 *
 * Cách làm ở đây là chạy chính `suyRaKind` trên tín hiệu mà bản YAML vừa ghi
 * sẽ cấp (`id` + `name`, không `uses`, không `run`) rồi so với `stage.kind`.
 * Khác nhau ⇒ một dòng `dropped`. Đây là khác biệt giữa "chúng tôi tin vòng
 * đọc-ghi giữ nguyên kind" và "chúng tôi vừa đo".
 */

import type { FanOutAxis, StageId, StageSpec, StepId, StepSpec, WorkflowSpec } from './contract.ts';
import { suyRaKind } from './yaml-kind.ts';

/** Một trường của hợp đồng mà bản YAML này không chở được. */
export interface TruongBiBo {
  readonly stage: StageId;
  /** `null` = trường ở cấp stage. */
  readonly step: StepId | null;
  /** Tên trường trong hợp đồng, ví dụ `retries`, `steps[].cache`. */
  readonly field: string;
  /** Tiếng Việt, một câu. */
  readonly reason: string;
}

export interface WorkflowWriteResult {
  readonly yaml: string;
  /** Rỗng ⇔ `readWorkflowYaml(yaml)` dựng lại đúng `spec` đã cho. */
  readonly dropped: readonly TruongBiBo[];
}

const KHONG_CO_KHOA_TUONG_UNG =
  'tài liệu của nhà cung cấp CI không có khoá nào mang thông tin này; dữ liệu đó thuộc về level, không thuộc về YAML';

export function writeWorkflowYaml(spec: WorkflowSpec): WorkflowWriteResult {
  const dong: string[] = [];
  const dropped: TruongBiBo[] = [];

  dong.push(`name: ${voHuong(spec.name)}`);
  dong.push('jobs:');
  if (spec.stages.length === 0) {
    // `jobs: {}` — map rỗng dạng dòng, đúng thứ `core/yaml.ts` nhận.
    dong[dong.length - 1] = 'jobs: {}';
  }

  for (const stage of spec.stages) {
    ghiStage(stage, dong, dropped);
  }

  return { yaml: `${dong.join('\n')}\n`, dropped };
}

function ghiStage(stage: StageSpec, dong: string[], dropped: TruongBiBo[]): void {
  dong.push(`  ${stage.id}:`);
  dong.push(`    name: ${voHuong(stage.name)}`);
  dong.push(`    runs-on: ${voHuong(stage.runnerClass)}`);

  if (stage.dependsOn.length > 0) {
    dong.push('    needs:');
    for (const tren of stage.dependsOn) {
      dong.push(`      - ${voHuong(tren)}`);
    }
  }

  // ⚠ NGHĨA ĐẢO. `blocking: false` ⇒ "đỏ thì đi tiếp" ⇒ `continue-on-error: true`.
  // Chỉ phát khi `false`: vắng khoá đã mang nghĩa `blocking: true`, và phát
  // `continue-on-error: false` thừa ra sẽ làm hai bản YAML cùng nghĩa khác chữ.
  if (!stage.blocking) {
    dong.push('    continue-on-error: true');
  }

  if (stage.environment !== undefined) {
    dong.push(`    environment: ${voHuong(stage.environment)}`);
  }

  if (stage.fanOut !== undefined) {
    ghiFanOut(stage, dong, dropped);
  }

  ghiSteps(stage, dong, dropped);

  if (stage.retries !== 0) {
    dropped.push({
      stage: stage.id,
      step: null,
      field: 'retries',
      reason: `thử lại ở tầng stage: ${KHONG_CO_KHOA_TUONG_UNG}`,
    });
  }
  if (stage.runnerSlots !== undefined) {
    dropped.push({
      stage: stage.id,
      step: null,
      field: 'runnerSlots',
      reason: `số máy chạy một stage chiếm: ${KHONG_CO_KHOA_TUONG_UNG}`,
    });
  }
  if (stage.approval !== undefined) {
    dropped.push({
      stage: stage.id,
      step: null,
      field: 'approval',
      reason: `số người duyệt bắt buộc: ${KHONG_CO_KHOA_TUONG_UNG}`,
    });
  }

  // Tự kiểm phép suy `kind` trên đúng tín hiệu bản YAML vừa ghi sẽ cấp.
  const suy = suyRaKind({ jobId: stage.id, jobName: stage.name, uses: [], run: [] });
  if (suy.kind !== stage.kind) {
    dropped.push({
      stage: stage.id,
      step: null,
      field: 'kind',
      reason:
        `YAML không mang loại stage; đọc lại từ id + tên sẽ ra "${suy.kind}" chứ không phải "${stage.kind}" ` +
        `(${suy.rule === null ? 'nhánh mặc định' : `luật "${suy.rule}"`}: ${suy.why})`,
    });
  }
}

function ghiFanOut(stage: StageSpec, dong: string[], dropped: TruongBiBo[]): void {
  const fanOut = stage.fanOut;
  if (fanOut === undefined) {
    return;
  }
  dong.push('    strategy:');
  dong.push('      matrix:');
  for (const truc of fanOut.axes) {
    dong.push(`        ${truc.name}:`);
    for (const gia of truc.values) {
      dong.push(`          - ${voHuong(gia)}`);
    }
  }

  const to = fanOut.exclude ?? [];
  const giuLai: string[][] = [];
  for (const [i, khoa] of to.entries()) {
    const phan = taoLaiTruc(stage, fanOut.axes, khoa);
    if (phan === null) {
      // Không sinh ra được một tổ hợp trục từ khoá này thì không có gì để ghi.
      // Bỏ im lặng sẽ làm bản đọc lại chạy THÊM thực thể so với spec — nhiều
      // hơn, nên không ai thấy thiếu; chỉ thấy điểm khác.
      dropped.push({
        stage: stage.id,
        step: null,
        field: `fanOut.exclude[${i}]`,
        reason: `khoá thực thể "${khoa}" không tách ngược được thành một tổ hợp đủ trục của stage này`,
      });
      continue;
    }
    giuLai.push(phan);
  }
  if (giuLai.length === 0) {
    return;
  }
  dong.push('        exclude:');
  for (const phan of giuLai) {
    for (const [j, cap] of phan.entries()) {
      dong.push(`${j === 0 ? '          - ' : '            '}${cap}`);
    }
  }
}

/** `test#node20/ubuntu` ⇒ `['node: node20', 'os: ubuntu']`, hoặc `null` khi không khớp. */
function taoLaiTruc(stage: StageSpec, axes: readonly FanOutAxis[], khoa: string): string[] | null {
  const dau = `${stage.id}#`;
  if (!khoa.startsWith(dau)) {
    return null;
  }
  const gia = khoa.slice(dau.length).split('/');
  if (gia.length !== axes.length) {
    return null;
  }
  const out: string[] = [];
  for (const [i, truc] of axes.entries()) {
    const v = gia[i];
    if (v === undefined || !truc.values.includes(v)) {
      return null;
    }
    out.push(`${truc.name}: ${voHuong(v)}`);
  }
  return out;
}

function ghiSteps(stage: StageSpec, dong: string[], dropped: TruongBiBo[]): void {
  if (stage.steps.length === 0) {
    dong.push('    steps: []');
    return;
  }
  dong.push('    steps:');
  for (const buoc of stage.steps) {
    ghiStep(stage, buoc, dong, dropped);
  }
}

function ghiStep(stage: StageSpec, buoc: StepSpec, dong: string[], dropped: TruongBiBo[]): void {
  // `id` luôn được phát, kể cả khi nó trùng dạng sinh tự động: bỏ đi thì một
  // bước chèn thêm ở giữa sẽ đánh số lại mọi bước sau nó, và `RunLog` cũ trỏ
  // vào những id không còn nghĩa như trước.
  dong.push(`      - id: ${voHuong(buoc.id)}`);
  dong.push(`        name: ${voHuong(buoc.name)}`);
  if (!buoc.blocking) {
    dong.push('        continue-on-error: true');
  }

  const khong = (field: string, gi: string): void => {
    dropped.push({ stage: stage.id, step: buoc.id, field, reason: `${gi}: ${KHONG_CO_KHOA_TUONG_UNG}` });
  };
  if (buoc.durationTicks !== 0) {
    khong('steps[].durationTicks', 'thời lượng danh nghĩa của bước');
  }
  if (buoc.durationSpreadTicks !== undefined) {
    khong('steps[].durationSpreadTicks', 'biên động thời lượng');
  }
  if (buoc.flake !== undefined) {
    khong('steps[].flake', 'xác suất và bản chất của đỏ giả');
  }
  if (buoc.cache !== undefined) {
    khong('steps[].cache', 'khoá cache và danh sách làm ôi cache');
  }
  if (buoc.requires !== undefined && buoc.requires.length > 0) {
    khong('steps[].requires', 'sản phẩm bước này cần có sẵn');
  }
  if (buoc.produces !== undefined && buoc.produces.length > 0) {
    khong('steps[].produces', 'sản phẩm bước này tạo ra');
  }
}

// ── Vô hướng ────────────────────────────────────────────────────────────────

/**
 * Chuỗi cần nháy khi nào — luật này đối xứng với `parseScalar` của
 * `core/yaml.ts`, và mỗi vế dưới đây gác một cách đọc-lại-thành-thứ-khác:
 *
 * - rỗng, hoặc có khoảng trắng ở hai đầu — `trim()` của bộ quét sẽ ăn mất;
 * - `12`, `-3`, `1.5` — `parseScalar` trả về `number`, không phải chuỗi;
 * - `true` / `false` / `null` / `~` — trả về boolean / null;
 * - mở đầu bằng `- [ ] { } # & * | > ' "` — bộ quét đọc chúng như cú pháp;
 * - chứa `#` — `stripComment` cắt phần sau nếu `#` đứng sau một dấu cách;
 * - chứa `: ` hoặc kết thúc bằng `:` — trong một dãy, `- a: b` mở một MAP chứ
 *   không phải một chuỗi. Đây là vế dễ quên nhất vì ở cấp map nó vô hại.
 */
function canNhay(text: string): boolean {
  if (text === '' || text !== text.trim()) {
    return true;
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return true;
  }
  if (text === 'true' || text === 'false' || text === 'null' || text === '~') {
    return true;
  }
  if (/^[-[\]{}#&*|>'"]/.test(text)) {
    return true;
  }
  if (text.includes('#')) {
    return true;
  }
  if (text.includes(': ') || text.endsWith(':')) {
    return true;
  }
  return text.includes('\n');
}

function voHuong(text: string): string {
  if (!canNhay(text)) {
    return text;
  }
  // `core/yaml.ts` bỏ nháy bằng cách cắt ký tự đầu và cuối — nó KHÔNG hiểu dấu
  // thoát nào. Nên một chuỗi chứa cả `'` lẫn `"` là không viết ra được, và
  // trả về một chuỗi hỏng sẽ là đúng loại lỗi im lặng mà file này tồn tại để
  // chặn. Ném ở đây, tại chỗ, kèm chính giá trị gây lỗi.
  if (text.includes("'") && text.includes('"')) {
    throw new Error(
      `Không ghi được giá trị chứa cả nháy đơn lẫn nháy kép ra YAML: ${text}. ` +
        'Bộ quét YAML tối thiểu của game không hiểu dấu thoát, nên hãy bỏ bớt một loại nháy.',
    );
  }
  if (text.includes("'")) {
    return `"${text}"`;
  }
  return `'${text}'`;
}
