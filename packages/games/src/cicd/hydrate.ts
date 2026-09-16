/**
 * Ghép một `WorkflowSpec` đọc từ YAML với dữ liệu mà YAML KHÔNG chở được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO TẦNG NÀY PHẢI TỒN TẠI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `contract.ts` §"QUYẾT ĐỊNH KIẾN TRÚC 2026-09-16" đã chốt: **YAML là khung
 * soạn, không phải bản tuần tự hoá.** CHÍN trường của hợp đồng không có khoá
 * YAML nào chở được — `StageSpec.retries`, `runnerSlots`, `approval`, và
 * `StepSpec.durationTicks`, `durationSpreadTicks`, `flake`, `cache`,
 * `requires`, `produces`. `readWorkflowYaml` áp mặc định trung tính cho tất cả
 * và **không đoán** (xem `TICK_MAC_DINH`).
 *
 * Hệ quả đo được, trên chính `solutionWorkflow` của `cicd-c01` (2026-09-16):
 *
 * | Đường đi | leadTimeSeconds | runnerMinutes |
 * |---|---|---|
 * | chấm thẳng `solutionWorkflow` | 120 | 6 |
 * | ghi ra YAML rồi đọc lại | **0** | **0** |
 *
 * Nghĩa là vòng chơi mà 19.E mô tả — "soạn YAML ⇒ chấm ba trục" — cho ba con số
 * VÔ NGHĨA nếu không có tầng này. Không lỗi, không cảnh báo: engine vẫn chạy,
 * điểm vẫn ra, chỉ là ra số khác. Đúng nhánh "im lặng bỏ" mà quyết định kiến
 * trúc ở trên đã bác bỏ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LUẬT GHÉP — `editable` LÀ NGUỒN SỰ THẬT, KHÔNG PHẢI MỘT DANH SÁCH TỰ NGHĨ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `CicdLevel.editable` đã có sẵn trong hợp đồng và mang đúng nghĩa cần ở đây:
 * *"Người chơi được sửa gì ở level này. Cách kiểm soát nhịp dạy."* Nên luật là:
 *
 * - phần **có** trong `editable` ⇒ lấy giá trị của NGƯỜI CHƠI
 * - phần **không** có ⇒ lấy giá trị của BẢN GỐC (catalogue)
 *
 * Không có nhánh thứ ba, và không có bảng ánh xạ nào viết tay ở file này. Thêm
 * một `EditablePart` mới vào hợp đồng mà quên nó ở đây sẽ ĐỎ, không im lặng —
 * xem `hydrate.test.ts` §"mọi EditablePart đều có đường đi".
 *
 * ⚠ **`retries` và `cache` không đi qua YAML**, dù cả hai đều nằm trong
 * `EDITABLE_PARTS`. Hợp đồng ghi rõ đây là câu còn mở của 19.E và cho hai
 * đường; đường đã chọn 2026-09-16 là **ô điều khiển riêng ngoài ô soạn YAML**,
 * nên chúng vào đây qua `overrides` chứ không qua `edited`. Đọc chúng từ
 * `edited` là đọc mặc định trung tính của bộ đọc, tức luôn luôn `0`/vắng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁI BẪY ĐÃ ĐO: "BẢN GỐC LUÔN THẮNG" LÀ SAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phép ghép ngây thơ — khớp theo `id` rồi chép NGƯỢC mọi trường không-YAML từ
 * catalogue — đã được dựng thử và chạy trên cả hai lời giải của 14 level ngày
 * 2026-09-16: **18/28 khớp, 10/28 LỆCH**, và hai ca đảo hẳn tín hiệu đạt/trượt
 * (`c08` greenRate 1 → 0; `c11` greenRate 0.75 → 1).
 *
 * Mọi ca lệch đều là level cache hoặc retries, vì ở những level đó khoá cache /
 * số lần thử lại CHÍNH LÀ lời giải. "Catalogue thắng" ở đó nghĩa là chép đè lên
 * đúng thứ người chơi vừa sửa — chấm lại bản gốc chứ không chấm bài làm.
 *
 * Nên luật phải hỏi `editable` trước, chứ không hỏi "trường này YAML có chở
 * được không". Hai câu đó khác nhau đúng ở `retries` và `cache`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG BIẾT `CicdLevel`, VÀ ĐÓ LÀ CÓ CHỦ Ý
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tham số là `catalogue: WorkflowSpec` + `editable: readonly EditablePart[]`,
 * không phải một `CicdLevel`. Cùng lý lẽ `predicates.ts` đã ghi cho
 * `CicdScoringContext`: sandbox của 19.H **không có level nào**, nên một hàm
 * đòi `CicdLevel` sẽ không chấm nổi workflow ở đó. Sandbox truyền chính
 * workflow của người chơi làm catalogue và mở hết `EDITABLE_PARTS`.
 */

import {
  EDITABLE_PARTS,
  type CacheSpec,
  type EditablePart,
  type InputId,
  type StageSpec,
  type StepSpec,
  type WorkflowSpec,
} from './contract.ts';

/**
 * Phần của một cache mà NGƯỜI CHƠI chọn: khoá băm vào đâu. Chỉ vậy.
 *
 * ⛔ Không mang `invalidatedBy`, `savesTicks`, `id`. Ba thứ đó là sự thật của
 * level (`CacheSpec.invalidatedBy`: *"người chơi KHÔNG sửa được"*), và bản đầu
 * của kiểu này nhận nguyên một `CacheSpec` từ client. Hệ quả đã đo 2026-09-16:
 * bảng điều khiển đặt `invalidatedBy = keyParts`, tức đúng thứ hợp đồng gọi tên
 * là làm C08 "không bao giờ kích hoạt được" — và không ô nào đỏ, vì ô test nạp
 * `CacheSpec` của lời giải chứ không nạp thứ bảng điều khiển phát ra.
 */
export interface CicdCacheChoice {
  readonly keyParts: readonly InputId[];
}

/**
 * Hai thứ người chơi sửa được mà YAML không chở.
 *
 * Khoá là `StageId` cho `retries`, và `"<StageId>/<StepId>"` cho `cache` — cache
 * gắn vào BƯỚC chứ không vào stage (`StepSpec.cache`), nên một khoá chỉ có
 * `StageId` sẽ không phân biệt được hai bước cùng stage.
 *
 * Vắng một khoá ⇒ dùng giá trị bản CHUẨN. Đó là điều làm `{}` (người chơi chưa
 * đụng ô điều khiển nào) cư xử đúng như "chưa sửa gì", chứ không phải "xoá hết
 * cache". Với cache: `null` = tắt; một `CicdCacheChoice` = bật với khoá đó.
 */
export interface CicdPlayerOverrides {
  readonly retries?: Readonly<Record<string, number>>;
  readonly cache?: Readonly<Record<string, CicdCacheChoice | null>>;
}

/**
 * Hai nguồn, hai vai. **Gộp chúng làm một là một lỗi đã đo**, không phải một
 * lựa chọn kiểu dáng.
 *
 * - `baseline` — bản chuẩn của level (`CicdLevel.initialWorkflow`). Là THẨM
 *   QUYỀN cho phần `editable` không cho sửa. Một stage vắng mặt ở đây là stage
 *   người chơi tự tạo, và level không có ý kiến gì về nó.
 * - `catalogue` — hộp linh kiện (`mergeStageCatalogue(...)`). Chỉ chở THỜI LƯỢNG
 *   và hành vi mô phỏng, và biết cả stage người chơi tự thêm.
 *
 * Bản đầu dùng một object cho cả hai vai và `cicd-c07` đỏ ngay: level đó cho sửa
 * `cache` + `stages` nhưng KHÔNG cho sửa `edges`, còn hộp linh kiện gộp cả hai
 * lời giải nên `dependsOn` của nó là của lời giải ĐẾN TRƯỚC. Chấm lời giải thay
 * thế bằng đồ thị của lời giải chính cho ra `EvaluationRecord.error`, và
 * `scoreAxes` trả `null` — ba trục biến mất sạch, không phải sai lệch nhẹ.
 *
 * Bài học chung: "thêm được stage" kéo theo "phải nối được stage đó". Một stage
 * mới mà đồ thị của nó bị bản chuẩn ghi đè là một stage treo lơ lửng.
 */
export interface CicdHydrateSources {
  readonly baseline: WorkflowSpec;
  readonly catalogue: WorkflowSpec;
}

/** Khoá `overrides.cache`. Một chỗ dựng, để tầng giao diện không tự nối chuỗi. */
export function cacheOverrideKey(stageId: string, stepId: string): string {
  return `${stageId}/${stepId}`;
}

function has(editable: readonly EditablePart[], part: EditablePart): boolean {
  return editable.includes(part);
}

/**
 * Ghép một bước.
 *
 * `durationTicks`, `durationSpreadTicks`, `flake`, `requires`, `produces` LUÔN
 * lấy từ bản gốc: không phần nào của `EDITABLE_PARTS` nhắc tới chúng, tức hợp
 * đồng nói người chơi không được sửa chúng ở bất kỳ level nào. Đó cũng là thứ
 * làm dữ liệu mô phỏng không đi qua ô soạn thảo — tính chất chống gian lận mà
 * quyết định kiến trúc đã ghi.
 */
function hydrateStep(
  edited: StepSpec,
  goc: StepSpec | undefined,
  chuanStep: StepSpec | undefined,
  stageId: string,
  editable: readonly EditablePart[],
  overrides: CicdPlayerOverrides,
): StepSpec {
  /*
   * Bước KHÔNG có trong bản gốc là bước người chơi vừa thêm. Không có thời
   * lượng nào để mượn, nên nó giữ nguyên mặc định trung tính (`durationTicks: 0`)
   * của bộ đọc. Đây là câu trả lời trung thực chứ không phải một thiếu sót: bịa
   * một con số cho một bước mà level chưa bao giờ mô tả là bịa ra kết quả đo.
   */
  if (goc === undefined) {
    return edited;
  }

  const cache = has(editable, 'cache')
    ? resolveCache(goc.cache, chuanStep?.cache, overrides.cache?.[cacheOverrideKey(stageId, edited.id)])
    : /*
       * Không cho sửa ⇒ bước của bản chuẩn là thẩm quyền. Catalogue chỉ lên
       * tiếng cho bước level chưa từng mô tả — và nó phải KHÔNG được lên tiếng
       * trước bản chuẩn, vì `mergeStageCatalogue` bổ sung khuôn cache từ lời giải.
       */
      chuanStep === undefined
      ? goc.cache
      : chuanStep.cache;

  return {
    ...edited,
    durationTicks: goc.durationTicks,
    ...(goc.durationSpreadTicks === undefined ? {} : { durationSpreadTicks: goc.durationSpreadTicks }),
    ...(goc.flake === undefined ? {} : { flake: goc.flake }),
    ...(goc.requires === undefined ? {} : { requires: goc.requires }),
    ...(goc.produces === undefined ? {} : { produces: goc.produces }),
    ...(cache === undefined ? {} : { cache }),
    blocking: has(editable, 'blocking') ? edited.blocking : goc.blocking,
  };
}

/**
 * Cache của một bước ở level CHO sửa cache.
 *
 * Ba nguồn, ba vai, và không nguồn nào được lấn vai nguồn kia:
 *
 * - `khuon` (catalogue) — SỰ THẬT của bước: `id`, `invalidatedBy`, `savesTicks`.
 *   Vắng ⇒ bước này không cache được, và không lựa chọn nào của người chơi bịa ra
 *   được một cái: bịa `savesTicks` là bịa kết quả đo.
 * - `chuan` (bản chuẩn) — chỉ trả lời "mặc định BẬT hay TẮT", và khoá mặc định.
 * - `chon` (người chơi) — `null` tắt, một lựa chọn bật với `keyParts` của nó.
 *
 * ⚠ Mặc định KHÔNG lấy từ catalogue. Catalogue gộp cả hai lời giải, nên một
 * stage người chơi tự thêm mà trùng id stage của lời giải sẽ tự nhận luôn cache
 * của lời giải — đã đo được ở bản trước, tức đáp án được bật hộ.
 */
function resolveCache(
  khuon: CacheSpec | undefined,
  chuan: CacheSpec | undefined,
  chon: CicdCacheChoice | null | undefined,
): CacheSpec | undefined {
  if (khuon === undefined || chon === null) {
    return undefined;
  }
  if (chon === undefined) {
    return chuan === undefined ? undefined : { ...khuon, keyParts: chuan.keyParts };
  }
  return { ...khuon, keyParts: chon.keyParts };
}

/**
 * Ghép một stage.
 *
 * ⚠ Hai vai, hai tham số — gộp chúng làm một là lỗi đã đo (xem `CicdHydrateSources`):
 *
 * - `chuan` (từ `baseline`) là THẨM QUYỀN cho phần level không cho sửa. `undefined`
 *   nghĩa là level chưa bao giờ mô tả stage này, tức người chơi vừa tạo nó — và
 *   level không có ý kiến gì về một stage nó không biết, nên mọi trường YAML chở
 *   được đều của người chơi, bất kể `editable` nói gì.
 * - `kho` (từ `catalogue`) là HỘP LINH KIỆN, chỉ chở thời lượng và hành vi mô
 *   phỏng. Nó biết cả stage người chơi tự thêm; `chuan` thì không.
 */
function hydrateStage(
  edited: StageSpec,
  chuan: StageSpec | undefined,
  kho: StageSpec | undefined,
  editable: readonly EditablePart[],
  overrides: CicdPlayerOverrides,
): StageSpec {
  const khoSteps = new Map((kho?.steps ?? []).map((step) => [step.id, step]));
  const chuanSteps = new Map((chuan?.steps ?? []).map((step) => [step.id, step]));
  const steps = edited.steps.map((step) =>
    hydrateStep(step, khoSteps.get(step.id), chuanSteps.get(step.id), edited.id, editable, overrides),
  );

  /*
   * Stage người chơi TỰ TẠO: level không mô tả nó, nên không có thẩm quyền nào
   * để áp. Giữ nguyên đồ thị, máy chạy, blocking của người chơi — chỉ mượn thời
   * lượng từ hộp linh kiện, việc đã làm ở `steps` bên trên.
   */
  if (chuan === undefined) {
    const retriesMoi = overrides.retries?.[edited.id];
    return {
      ...edited,
      steps,
      ...(kho?.kind === undefined ? {} : { kind: kho.kind }),
      retries: has(editable, 'retries') ? (retriesMoi ?? edited.retries) : edited.retries,
      ...(kho?.runnerSlots === undefined ? {} : { runnerSlots: kho.runnerSlots }),
    };
  }

  const retriesOverride = overrides.retries?.[edited.id];
  return {
    ...edited,
    steps,
    /*
     * `kind` từ bản chuẩn: ngữ nghĩa do người viết level đặt. Giá trị trong
     * `edited` là thứ `yaml-kind.ts` SUY RA từ hình dạng bước — đúng cho stage
     * mới, nhưng không có quyền ghi đè lời khai của level.
     */
    kind: chuan.kind,
    dependsOn: has(editable, 'edges') ? edited.dependsOn : chuan.dependsOn,
    runnerClass: has(editable, 'runners') ? edited.runnerClass : chuan.runnerClass,
    blocking: has(editable, 'blocking') ? edited.blocking : chuan.blocking,
    retries: has(editable, 'retries') ? (retriesOverride ?? chuan.retries) : chuan.retries,
    ...(has(editable, 'fan-out')
      ? edited.fanOut === undefined
        ? {}
        : { fanOut: edited.fanOut }
      : chuan.fanOut === undefined
        ? {}
        : { fanOut: chuan.fanOut }),
    /* Không nằm trong `EDITABLE_PARTS` ⇒ luôn của bản chuẩn. */
    ...(chuan.runnerSlots === undefined ? {} : { runnerSlots: chuan.runnerSlots }),
    ...(chuan.environment === undefined ? {} : { environment: chuan.environment }),
    ...(chuan.approval === undefined ? {} : { approval: chuan.approval }),
  };
}

/**
 * `edited` (đọc từ YAML của người chơi) + `catalogue` (bản gốc của level) ⇒ một
 * `WorkflowSpec` chấm được.
 *
 * Tất định: chỉ đọc hai đầu vào, không đồng hồ, không ngẫu nhiên, và giữ nguyên
 * thứ tự mảng của `edited` — thứ tự đó là thứ tự TRÌNH BÀY (hợp đồng §
 * `WorkflowSpec.stages`) nên nó không đi vào luật xếp lịch, nhưng nó LÀ thứ tự
 * người chơi nhìn thấy và không việc gì phải xáo.
 */
export function hydrateWorkflow(
  edited: WorkflowSpec,
  sources: CicdHydrateSources,
  editable: readonly EditablePart[],
  overrides: CicdPlayerOverrides = {},
): WorkflowSpec {
  const chuanStages = new Map(sources.baseline.stages.map((stage) => [stage.id, stage]));
  const khoStages = new Map(sources.catalogue.stages.map((stage) => [stage.id, stage]));

  /*
   * `stages` KHÔNG nằm trong `editable` ⇒ người chơi không được thêm/bớt stage,
   * nên tập stage là của bản chuẩn và mọi stage lạ trong YAML bị bỏ. Không ném:
   * một stage thừa là một bài làm sai, và bài làm sai được CHẤM trượt chứ không
   * làm hỏng lượt chấm.
   */
  const nguon = has(editable, 'stages')
    ? edited.stages
    : edited.stages.filter((stage) => chuanStages.has(stage.id));

  const thieu = has(editable, 'stages')
    ? []
    : sources.baseline.stages.filter((stage) => !nguon.some((co) => co.id === stage.id));

  return {
    name: edited.name,
    stages: [
      ...nguon.map((stage) =>
        hydrateStage(stage, chuanStages.get(stage.id), khoStages.get(stage.id), editable, overrides),
      ),
      ...thieu,
    ],
  };
}

/**
 * "Hộp linh kiện" của một level: mọi stage/bước mà level BIẾT thời lượng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG THỂ CHỈ DÙNG `initialWorkflow`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đo trên cả 28 lời giải của 14 level (2026-09-16): **10 lời giải thêm stage
 * hoặc bước mà `initialWorkflow` không có**. Nặng nhất là `cicd-c01`, nơi
 * `initialWorkflow` KHÔNG CÓ STAGE NÀO — hợp đồng nói thẳng "Không stage nào =
 * dựng từ số không", nên cả hai stage của lời giải đều là stage người chơi tạo.
 *
 * Ghép chỉ với `initialWorkflow` thì những stage đó không mượn được thời lượng
 * ở đâu và giữ `durationTicks: 0`. Nghĩa là ba trục điểm VÔ NGHĨA ở đúng những
 * level dạy dựng đường ống từ đầu — hỏng ở chỗ tệ nhất có thể.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO GỘP CẢ HAI LỜI GIẢI KHÔNG PHẢI LÀ LỘ ĐÁP ÁN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hộp linh kiện chỉ chở **thời lượng và hành vi của từng khối rời**. Thứ level
 * chấm là ĐỒ THỊ — nối chúng theo thứ tự nào, cái gì song song với cái gì, khoá
 * cache rộng hay hẹp. Biết "`clone` chạy mất 3 tick" không nói cho ai biết phải
 * nối nó vào đâu.
 *
 * Và `solutionWorkflow` vốn ĐÃ nằm trong bundle của trình duyệt: `CI_LEVELS` là
 * dữ liệu tĩnh của gói này, AC-8 chạy nó ngay trên máy người chơi. Cơ chế chống
 * gian lận không phải giấu đáp án mà là `RunLog` phát lại (`core/run-log.ts`:
 * *"cơ chế chống gian lận DUY NHẤT chạy được trong trình duyệt"*). Nên hàm này
 * không mở thêm cánh cửa nào đang đóng.
 *
 * Thứ tự ưu tiên khi một id có ở nhiều nơi: `initialWorkflow` trước, rồi
 * `solutionWorkflow`, rồi `altSolutionWorkflow`. Bản người chơi khởi đầu cùng là
 * bản mô tả đúng nhất thứ họ đang cầm trên tay.
 */
export function mergeStageCatalogue(...nguon: readonly WorkflowSpec[]): WorkflowSpec {
  const theoId = new Map<string, StageSpec>();
  for (const wf of nguon) {
    for (const stage of wf.stages) {
      const da = theoId.get(stage.id);
      if (da === undefined) {
        theoId.set(stage.id, stage);
        continue;
      }
      /*
       * Stage đã có ⇒ giữ nguyên nó, chỉ BỔ SUNG thứ nó chưa biết: bước mới, và
       * khuôn cache cho bước đã có mà chưa mang cache.
       *
       * Vế thứ hai có mặt vì C06 đo ra: bản đầu chỉ bổ sung bước, nên một bước
       * mà `initialWorkflow` không cache còn lời giải thì có ⇒ catalogue không
       * có khuôn ⇒ bảng điều khiển không hiện núm nào cho bước đó ⇒ level chỉ cho
       * sửa `cache` trở thành KHÔNG GIẢI ĐƯỢC bằng giao diện. Khuôn là sự thật
       * của bước chứ không phải lời giải; bật hay tắt vẫn là của người chơi.
       */
      const khuonTheoBuoc = new Map(stage.steps.map((s) => [s.id, s.cache]));
      const buocCu = da.steps.map((s) => {
        const khuon = khuonTheoBuoc.get(s.id);
        return s.cache === undefined && khuon !== undefined ? { ...s, cache: khuon } : s;
      });
      const coBuoc = new Set(da.steps.map((s) => s.id));
      const themBuoc = stage.steps.filter((s) => !coBuoc.has(s.id));
      theoId.set(stage.id, { ...da, steps: [...buocCu, ...themBuoc] });
    }
  }
  return { name: nguon[0]?.name ?? '', stages: [...theoId.values()] };
}

/**
 * Mọi `EditablePart` đã khai có được `hydrateWorkflow` đọc tới chưa.
 *
 * Tồn tại để `hydrate.test.ts` hỏi được câu đó mà không phải đọc mã: thêm một
 * phần mới vào `EDITABLE_PARTS` rồi quên nó ở đây là một lỗ IM LẶNG — phần mới
 * sẽ luôn lấy giá trị bản gốc, tức người chơi sửa mà không có gì thay đổi, và
 * không ô nào đỏ.
 */
export const HYDRATED_PARTS: readonly EditablePart[] = EDITABLE_PARTS;
