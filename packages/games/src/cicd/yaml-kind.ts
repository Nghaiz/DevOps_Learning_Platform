/**
 * Bảng tra **loại stage** (`StageKind`) từ một job YAML.
 *
 * `StageKind` là một union ĐÓNG 16 giá trị (`contract.ts` §2) và **YAML của nhà
 * cung cấp không mang nó**: không khoá nào trong tài liệu Actions nói "job này
 * là một bước lint". Nên nó phải được SUY RA, và chỗ suy ra phải là MỘT chỗ.
 *
 * ## Vì sao một bảng tường minh chứ không phải mấy câu `if` rải rác
 *
 * Nếu phép suy nằm rải trong bộ đọc, mỗi chỗ đọc một tín hiệu khác nhau và
 * không ai đọc được TOÀN BỘ luật. Tệ hơn: bộ GHI (19.C.2) cũng cần biết phép
 * suy này để tự kiểm rằng vòng đọc-ghi giữ nguyên `kind` — xem
 * `yaml-write.ts`. Hai bản sao của cùng một phép suy sẽ trôi khỏi nhau trong im
 * lặng, vì cả hai vẫn biên dịch và cả hai vẫn trả về một `StageKind` hợp lệ.
 *
 * ## Luật khớp — hai lượt, thứ tự khai là thứ tự ưu tiên
 *
 * 1. **Lượt 1 — `uses:`.** Tên một hành động dựng sẵn là tín hiệu MẠNH: nó nói
 *    chính xác việc gì đang chạy, không phụ thuộc cách người ta đặt tên job.
 * 2. **Lượt 2 — chữ.** `jobId`, `jobName`, rồi từng dòng `run:`, theo đúng thứ
 *    tự đó. Yếu hơn, vì tên job là văn xuôi người viết tự đặt.
 *
 * Trong mỗi lượt, luật đầu tiên khớp thắng. Thứ tự trong `KIND_RULES` đi từ
 * **hẹp tới rộng**: `build` nằm CUỐI vì "build" là từ xuất hiện trong tên của
 * gần như mọi job đa việc (`TypeScript (lint + build + test)`), nên đặt nó
 * trước sẽ nuốt hết các luật hẹp hơn.
 *
 * ## Nhánh mặc định NÓI RA ĐƯỢC
 *
 * Không tín hiệu nào khớp ⇒ `KIND_FALLBACK`, và nó mang `rule: null` cùng một
 * câu giải thích. Tầng trên đọc được `rule === null` để biết đây là phỏng đoán
 * chứ không phải một phép tra trúng — thứ mà một `return 'build'` trần không
 * bao giờ nói ra.
 */

import type { StageKind } from './contract.ts';

/** Tín hiệu rút từ MỘT job. Thuần dữ liệu, để test dựng được mà không cần YAML. */
export interface KindSignals {
  /** Khoá của job trong `jobs:`. */
  readonly jobId: string;
  /** `jobs.<key>.name`, hoặc chính `jobId` khi job không khai tên. */
  readonly jobName: string;
  /** Mọi `steps[].uses` của job, theo thứ tự nguồn. */
  readonly uses: readonly string[];
  /** Mọi `steps[].run` của job, theo thứ tự nguồn. Dòng nào cũng đã là chuỗi. */
  readonly run: readonly string[];
}

export interface KindRule {
  /** Định danh ổn định để test ghim và để thông điệp chỉ đúng luật. */
  readonly id: string;
  readonly kind: StageKind;
  /** Một câu tiếng Việt: vì sao tín hiệu này kéo về loại đó. */
  readonly why: string;
  /** Tiền tố của `uses:`. Khớp bằng `startsWith` nên `@v5` không cần khai. */
  readonly uses?: readonly string[];
  /** Khớp trên `jobId`, `jobName`, rồi từng dòng `run`. KHÔNG được có cờ `g`. */
  readonly text?: RegExp;
}

/**
 * Bảng tra. **Thứ tự LÀ luật** — xem khối chú thích đầu file.
 *
 * Phủ đủ 16 giá trị của `STAGE_KINDS`; `yaml-kind.test.ts` khẳng định quan hệ
 * đó bằng chính mảng runtime trong hợp đồng, nên thêm một loại vào hợp đồng mà
 * quên bảng này là đỏ ngay, không phải một loại chết nằm im.
 */
export const KIND_RULES: readonly KindRule[] = [
  {
    id: 'clone',
    kind: 'clone',
    why: 'job lấy mã nguồn về máy chạy',
    // ⚠ CỐ Ý KHÔNG có tín hiệu `uses:`, dù hành động lấy mã nguồn của nhà cung
    // cấp là thứ dễ nhận ra nhất trong cả tài liệu. Lý do đo được: trong một
    // workflow thật, MỌI job đều mở đầu bằng bước lấy mã nguồn — đọc
    // `.github/workflows/ci.yml` của chính kho này, cả 12 job đều có. Nhận
    // diện theo `uses` sẽ kéo toàn bộ 12 job về `'clone'`, tức bảng tra sập về
    // một giá trị duy nhất và không còn phân biệt gì nữa.
    //
    // Ở mô hình của game, `clone` là một STAGE riêng (hợp đồng §2), còn ở nhà
    // cung cấp nó là một BƯỚC bên trong mọi job. Hai tầng khác nhau, nên tín
    // hiệu đúng là TÊN job/`run`, không phải sự có mặt của bước đó.
    text: /\b(clone|scm)\b/i,
  },
  {
    id: 'cache',
    kind: 'restore-cache',
    why: 'khôi phục bộ nhớ đệm giữa các lượt chạy',
    uses: ['actions/cache'],
    text: /\bcache\b/i,
  },
  {
    id: 'sast',
    kind: 'sast',
    why: 'quét mã tĩnh tìm lỗ hổng hoặc bí mật lọt vào kho mã',
    uses: ['github/codeql-action', 'gitleaks/gitleaks-action'],
    text: /\b(sast|codeql|semgrep|gitleaks|gosec|govulncheck)\b|\bsecret[- ]scan/i,
  },
  {
    id: 'image-scan',
    kind: 'image-scan',
    why: 'quét lỗ hổng bên trong một image đã dựng',
    uses: ['aquasecurity/trivy-action', 'anchore/scan-action'],
    text: /\b(trivy|grype|snyk)\b|\bimage[- ]scan/i,
  },
  {
    id: 'rollback',
    kind: 'rollback',
    why: 'quay bản phát hành về phiên bản trước',
    text: /\b(rollback|revert|undo)\b/i,
  },
  {
    id: 'promote',
    kind: 'promote',
    why: 'đẩy một artifact đã kiểm lên môi trường cao hơn',
    text: /\bpromot(e|ion)\b/i,
  },
  {
    id: 'smoke',
    kind: 'smoke',
    why: 'phép thử nhanh sau phát hành xem hệ có sống không',
    text: /\bsmoke\b|\bhealth[- ]?check\b/i,
  },
  {
    id: 'deploy',
    kind: 'deploy',
    why: 'đưa artifact lên một môi trường',
    text: /\b(deploy|rollout)\b|\bhelm upgrade\b|\bkubectl apply\b/i,
  },
  {
    id: 'approval',
    kind: 'approval',
    why: 'cổng chờ người duyệt — tốn thời gian, không chiếm máy chạy',
    uses: ['trstringer/manual-approval'],
    text: /\bapprov(e|al)\b|\bmanual\b/i,
  },
  {
    id: 'publish',
    kind: 'publish',
    why: 'đẩy sản phẩm ra một nơi bên ngoài lượt chạy',
    uses: ['docker/build-push-action'],
    text: /\b(publish|push|release|upload)\b/i,
  },
  {
    id: 'package',
    kind: 'package',
    why: 'đóng gói sản phẩm build thành một artifact phát hành được',
    uses: ['docker/setup-buildx-action'],
    text: /\b(package|buildx|pack)\b|\bdocker build\b/i,
  },
  {
    id: 'integration-test',
    kind: 'integration-test',
    why: 'phép thử chạy nhiều thành phần cùng lúc',
    text: /\b(integration|e2e)\b|\bend[- ]to[- ]end\b/i,
  },
  {
    id: 'unit-test',
    kind: 'unit-test',
    why: 'phép thử một đơn vị mã, không cần dịch vụ ngoài',
    text: /\bunit\b/i,
  },
  {
    id: 'lint',
    kind: 'lint',
    why: 'kiểm hình thức mã, không chạy sản phẩm',
    text: /lint\b|\b(fmt|format|prettier|vet|shellcheck)\b/i,
  },
  {
    id: 'gate',
    kind: 'gate',
    why: 'job tổng hợp, chỉ gom kết quả của các job khác',
    text: /\b(gate|guard|required|ok)\b/i,
  },
  {
    id: 'build',
    kind: 'build',
    why: 'dịch mã nguồn thành sản phẩm chạy được',
    text: /\b(build|compile|make|tsc)\b/i,
  },
];

export interface KindGuess {
  readonly kind: StageKind;
  /** `null` = nhánh mặc định, tức KHÔNG luật nào khớp. */
  readonly rule: string | null;
  readonly why: string;
}

/**
 * Nhánh mặc định.
 *
 * Chọn `'build'` chứ không phải một loại "không rõ" vì `StageKind` là union
 * đóng và không có giá trị nào mang nghĩa đó — thêm một giá trị như vậy là đổi
 * hợp đồng, và hợp đồng đã chốt 16 loại. `'build'` là loại trung tính nhất: nó
 * chiếm máy chạy, tốn thời gian, và không kéo theo luật engine riêng nào (chỉ
 * `'approval'` có luật riêng, xem `StageSpec.runnerSlots`).
 *
 * ⚠ `rule: null` là phần quan trọng hơn cả giá trị: nó phân biệt "tra trúng
 * build" với "đoán bừa ra build", và tầng trên có thể hiện lời nhắc dựa vào đó.
 */
export const KIND_FALLBACK: KindGuess = {
  kind: 'build',
  rule: null,
  why: 'không tín hiệu nào khớp — mặc định về loại trung tính nhất, không phải một phép tra trúng',
};

export function suyRaKind(signals: KindSignals): KindGuess {
  for (const rule of KIND_RULES) {
    if (rule.uses === undefined) {
      continue;
    }
    for (const dung of signals.uses) {
      for (const prefix of rule.uses) {
        if (dung.startsWith(prefix)) {
          return { kind: rule.kind, rule: rule.id, why: rule.why };
        }
      }
    }
  }

  const chu: readonly string[] = [signals.jobId, signals.jobName, ...signals.run];
  for (const rule of KIND_RULES) {
    if (rule.text === undefined) {
      continue;
    }
    for (const doan of chu) {
      if (rule.text.test(doan)) {
        return { kind: rule.kind, rule: rule.id, why: rule.why };
      }
    }
  }

  return KIND_FALLBACK;
}
