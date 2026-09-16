/**
 * Ghim bộ đọc YAML → `WorkflowSpec` (19.C.1) và vị trí lỗi (19.C.3).
 *
 * Phép đo đắt nhất ở cuối file: đọc một workflow THẬT, lấy từ
 * `.github/workflows/ci.yml` của chính kho này. Một tài liệu tự bịa sẽ chỉ chứa
 * những hình dạng mà người viết bộ đọc đã nghĩ tới — nó đo lại chính giả định
 * của mình. File thật mang `needs` ở CẢ HAI dạng, một ma trận, một
 * `continue-on-error` cấp bước, mười hai job, và không có khoá `name` ở gốc;
 * ba trong số đó không có trong bản nháp đầu của bộ đọc này.
 */
import { describe, expect, it } from 'vitest';

import {
  HANG_MAY_MAC_DINH,
  TEN_WORKFLOW_MAC_DINH,
  TICK_MAC_DINH,
  readWorkflowYaml,
} from './yaml-read.ts';
import type { WorkflowReadResult } from './yaml-read.ts';
import type { StageSpec, WorkflowSpec } from './contract.ts';

function docOk(source: string): { readonly workflow: WorkflowSpec; readonly ket: WorkflowReadResult } {
  const ket = readWorkflowYaml(source);
  if (!ket.ok) {
    throw new Error(`Đáng lẽ đọc được, nhưng bị từ chối: ${ket.errors.map((e) => e.message).join(' | ')}`);
  }
  return { workflow: ket.workflow, ket };
}

function docLoi(source: string): readonly { message: string; line: number; column: number }[] {
  const ket = readWorkflowYaml(source);
  if (ket.ok) {
    throw new Error('Đáng lẽ bị từ chối, nhưng lại đọc được.');
  }
  return ket.errors;
}

function stage(workflow: WorkflowSpec, id: string): StageSpec {
  const found = workflow.stages.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`Không thấy stage "${id}" trong [${workflow.stages.map((s) => s.id).join(', ')}]`);
  }
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bảng ánh xạ
// ═══════════════════════════════════════════════════════════════════════════

describe('ánh xạ cơ bản', () => {
  it('tên workflow, id job, tên job, hạng máy chạy', () => {
    const { workflow } = docOk(`name: Đường ống mẫu
jobs:
  build:
    name: Dựng sản phẩm
    runs-on: linux-lon
    steps:
      - name: Biên dịch
        run: make build
`);
    expect(workflow.name).toBe('Đường ống mẫu');
    expect(workflow.stages).toHaveLength(1);
    expect(stage(workflow, 'build')).toMatchObject({
      id: 'build',
      name: 'Dựng sản phẩm',
      runnerClass: 'linux-lon',
      dependsOn: [],
      blocking: true,
      retries: 0,
    });
  });

  it('thiếu `name` ở gốc và ở job ⇒ mặc định khai báo được, không phải chuỗi rỗng', () => {
    const { workflow } = docOk(`jobs:
  lint:
    steps: []
`);
    expect(workflow.name).toBe(TEN_WORKFLOW_MAC_DINH);
    expect(stage(workflow, 'lint').name).toBe('lint');
    expect(stage(workflow, 'lint').runnerClass).toBe(HANG_MAY_MAC_DINH);
  });

  it('`needs` dạng chuỗi và dạng dãy cho ra cùng một `dependsOn`', () => {
    const chuoi = docOk(`jobs:
  clone:
    steps: []
  build:
    needs: clone
    steps: []
`).workflow;
    const day = docOk(`jobs:
  clone:
    steps: []
  build:
    needs:
      - clone
    steps: []
`).workflow;
    expect(stage(chuoi, 'build').dependsOn).toEqual(['clone']);
    expect(stage(day, 'build').dependsOn).toEqual(['clone']);
    expect(stage(chuoi, 'build')).toEqual(stage(day, 'build'));
  });

  it('`continue-on-error: true` ⇒ `blocking: false` — NGHĨA ĐẢO, ở cả hai tầng', () => {
    const { workflow } = docOk(`jobs:
  lint:
    continue-on-error: true
    steps:
      - id: canh-bao
        name: Chỉ cảnh báo
        continue-on-error: true
      - id: chan
        name: Chặn nếu đỏ
`);
    const s = stage(workflow, 'lint');
    expect(s.blocking).toBe(false);
    expect(s.steps.map((b) => ({ id: b.id, blocking: b.blocking }))).toEqual([
      { id: 'canh-bao', blocking: false },
      { id: 'chan', blocking: true },
    ]);
  });

  it('`continue-on-error: false` tường minh vẫn là blocking', () => {
    const { workflow } = docOk(`jobs:
  lint:
    continue-on-error: false
    steps: []
`);
    expect(stage(workflow, 'lint').blocking).toBe(true);
  });

  it('`environment` dạng chuỗi và dạng map có `name`', () => {
    const { workflow } = docOk(`jobs:
  deploy:
    environment: prod
    steps: []
  smoke:
    environment:
      name: staging
      url: https://vi-du.invalid
    steps: []
`);
    expect(stage(workflow, 'deploy').environment).toBe('prod');
    expect(stage(workflow, 'smoke').environment).toBe('staging');
  });
});

describe('bước', () => {
  it('bước không khai `id` được sinh từ CHỈ SỐ, tất định và 1-based', () => {
    const { workflow } = docOk(`jobs:
  build:
    steps:
      - run: pnpm install
      - id: dung
        run: pnpm build
      - run: pnpm test
`);
    expect(stage(workflow, 'build').steps.map((b) => b.id)).toEqual(['buoc-1', 'dung', 'buoc-3']);
  });

  it('bước không khai `name` lấy id làm tên, và thời lượng về mặc định trung tính', () => {
    const { workflow } = docOk(`jobs:
  build:
    steps:
      - run: make
`);
    expect(stage(workflow, 'build').steps[0]).toEqual({
      id: 'buoc-1',
      name: 'buoc-1',
      durationTicks: TICK_MAC_DINH,
      blocking: true,
    });
  });

  it('`steps: []` là hợp lệ và cho một stage không bước nào', () => {
    const { workflow } = docOk(`jobs:
  gate:
    steps: []
`);
    expect(stage(workflow, 'gate').steps).toEqual([]);
  });

  it('id khai tay trùng dạng sinh tự động bị bắt, không âm thầm đè nhau', () => {
    const errors = docLoi(`jobs:
  build:
    steps:
      - id: buoc-2
        run: a
      - run: b
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('hai bước cùng id "buoc-2"');
  });
});

describe('strategy.matrix ⇒ fanOut', () => {
  it('nhiều trục, giữ nguyên thứ tự khai', () => {
    const { workflow } = docOk(`jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        node:
          - '20'
          - '22'
        os:
          - ubuntu
          - mac
    steps: []
`);
    expect(stage(workflow, 'test').fanOut).toEqual({
      axes: [
        { name: 'node', values: ['20', '22'] },
        { name: 'os', values: ['ubuntu', 'mac'] },
      ],
    });
  });

  it('giá trị không nháy bị bộ quét đọc thành số vẫn ra chuỗi', () => {
    const { workflow } = docOk(`jobs:
  test:
    strategy:
      matrix:
        node:
          - 20
          - 22
    steps: []
`);
    expect(stage(workflow, 'test').fanOut?.axes[0]?.values).toEqual(['20', '22']);
  });

  it('`exclude` đủ trục ⇒ khoá thực thể đầy đủ, đúng thứ tự trục đã khai', () => {
    const { workflow } = docOk(`jobs:
  test:
    strategy:
      matrix:
        node:
          - '20'
          - '22'
        os:
          - ubuntu
          - mac
        exclude:
          - node: '22'
            os: mac
    steps: []
`);
    expect(stage(workflow, 'test').fanOut?.exclude).toEqual(['test#22/mac']);
  });

  it('`exclude` thiếu một trục bị từ chối, và lỗi trỏ vào chính tổ hợp đó', () => {
    const errors = docLoi(`jobs:
  test:
    strategy:
      matrix:
        node:
          - '20'
        os:
          - ubuntu
        exclude:
          - os: ubuntu
    steps: []
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('thiếu trục "node"');
    expect(errors[0]?.line).toBe(10);
  });

  it('`matrix.include` bị từ chối kèm lý do, không im lặng bỏ qua', () => {
    const errors = docLoi(`jobs:
  images:
    strategy:
      matrix:
        include:
          - name: web
    steps: []
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('"matrix.include" chưa mô hình hoá được');
    expect(errors[0]).toMatchObject({ line: 5, column: 9 });
  });

  it('giá trị trục chứa "/" bị từ chối — nó phá khoá thực thể', () => {
    // `InstanceKey` là `stage#v1/v2`. Ma trận thật của `ci.yml` có
    // `dockerfile: apps/web/Dockerfile`, nên đây không phải một ca giả tưởng.
    const errors = docLoi(`jobs:
  images:
    strategy:
      matrix:
        dockerfile:
          - apps/web/Dockerfile
    steps: []
`);
    // ĐÚNG MỘT lỗi, và đó là phần dễ mất nhất: trục hỏng ⇒ không trục nào hợp
    // lệ ⇒ rất dễ kèm thêm một lỗi "ma trận rỗng" trỏ vào dòng `matrix:`, tức
    // hai thông điệp cho một chỗ sửa, cái thứ hai trỏ vào một dòng không sai.
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('chứa "/" hoặc "#"');
  });

  it('ma trận thật sự TRỐNG thì mới kêu là trống', () => {
    const errors = docLoi(`jobs:
  test:
    strategy:
      matrix: {}
    steps: []
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('không khai trục nào');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19.C.3 — lỗi trỏ đúng dòng và cột
// ═══════════════════════════════════════════════════════════════════════════

describe('vị trí lỗi', () => {
  it('lỗi CÚ PHÁP được chuyển tiếp nguyên vẹn từ bộ quét, không bọc lại', () => {
    const errors = docLoi('jobs:\n  build:\n\tname: a\n');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3, column: 1 });
    expect(errors[0]?.message).toContain('tab');
  });

  it('lỗi cú pháp ở giữa tài liệu giữ đúng số dòng của nguồn GỐC', () => {
    const errors = docLoi(`name: a
jobs:
  build:
    steps:
      - run: |
          nhiều dòng
`);
    expect(errors[0]?.line).toBe(5);
  });

  it('`jobs` không phải map ⇒ lỗi trỏ vào chính khoá `jobs`', () => {
    const errors = docLoi(`name: a
jobs: mot-chuoi
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2, column: 1 });
  });

  it('thiếu `jobs` ⇒ lỗi trỏ vào khối gốc', () => {
    const errors = docLoi('name: a\n');
    expect(errors[0]?.message).toContain('Thiếu khoá "jobs"');
    expect(errors[0]?.line).toBe(1);
  });

  it('`steps` không phải dãy ⇒ lỗi trỏ vào khoá `steps`', () => {
    const errors = docLoi(`jobs:
  build:
    name: a
    steps: mot-chuoi
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 4, column: 5 });
  });

  it('tên job không hợp lệ ⇒ lỗi trỏ vào chính khoá job', () => {
    const errors = docLoi(`jobs:
  Build_Thu:
    steps: []
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 2, column: 3 });
    expect(errors[0]?.message).toContain('không hợp lệ');
  });

  it('`continue-on-error` là biểu thức ⇒ lỗi trỏ vào khoá đó', () => {
    const errors = docLoi(`jobs:
  build:
    continue-on-error: khong-phai-boolean
    steps: []
`);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 3, column: 5 });
  });

  it('nhiều lỗi được trả về cùng lúc, đã sắp theo dòng rồi cột', () => {
    const errors = docLoi(`jobs:
  a:
    runs-on:
      - linux
      - mac
    steps: []
  b:
    needs:
      - KHONG-HOP-LE
    steps: []
`);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.line)).toEqual([3, 8]);
  });

  it('mọi lỗi mang dòng và cột THẬT — 0 nghĩa là không biết, và ở đây không được phép', () => {
    const errors = docLoi(`jobs:
  build:
    steps:
      - id: KHONG-HOP-LE
`);
    for (const e of errors) {
      expect(e.line).toBeGreaterThan(0);
      expect(e.column).toBeGreaterThan(0);
    }
  });
});

describe('khoá game không mô phỏng', () => {
  it('được ghi vào `ignored` kèm vị trí — không từ chối, cũng không im lặng', () => {
    const { ket } = docOk(`name: a
on:
  pull_request:
jobs:
  build:
    runs-on: linux
    timeout-minutes: 10
    steps:
      - name: b
        working-directory: apps/web
        run: make
`);
    if (!ket.ok) {
      throw new Error('không tới được đây');
    }
    expect(ket.ignored.map((k) => k.path)).toEqual([
      'on',
      'jobs.build.timeout-minutes',
      'jobs.build.steps[0].working-directory',
    ]);
    expect(ket.ignored[1]).toMatchObject({ line: 7, column: 5 });
  });

  it('`uses` và `run` KHÔNG bị coi là bỏ qua — chúng là tín hiệu suy loại stage', () => {
    const { ket } = docOk(`jobs:
  build:
    steps:
      - uses: actions/cache@v4
        run: make
`);
    if (!ket.ok) {
      throw new Error('không tới được đây');
    }
    expect(ket.ignored).toEqual([]);
    expect(stage(ket.workflow, 'build').kind).toBe('restore-cache');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-C — đọc một workflow THẬT của kho này
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `.github/workflows/ci.yml` (2026-09-16), rút gọn. **Bốn phép rút gọn**, mỗi
 * phép vì một giới hạn CÓ THẬT của tầng dưới, không phải vì tiện:
 *
 * 1. **Thân `run: |` bị thu về một dòng.** `core/yaml.ts` cố ý không nhận chuỗi
 *    nhiều dòng (`|`, `>`), và nó BÁO LỖI chứ không bỏ qua — xem ô "lỗi cú
 *    pháp ở giữa tài liệu" ở trên, dùng đúng hình dạng đó.
 * 2. **Dãy dạng dòng `[a, b]` viết lại thành gạch đầu dòng.** Cùng lý do:
 *    `[]`/`{}` chỉ nhận ở dạng RỖNG. Ảnh hưởng `on.push.branches` và
 *    `ci-ok.needs`. `images.needs: ci-ok` giữ nguyên dạng chuỗi — bản gốc viết
 *    vậy, và đó là lý do bảng ánh xạ phải nhận cả hai dạng.
 * 3. **`images.strategy.matrix.include` đổi thành một trục.** `FanOutSpec` là
 *    tích Descartes các trục, không biểu diễn được `include`; và giá trị
 *    `dockerfile: apps/web/Dockerfile` chứa `/`, ký tự dựng nên `InstanceKey`.
 *    Cả hai đều có ô test riêng ở trên.
 * 4. **Bớt bước, bớt khoá `with:`/`env:`/`services:`, bỏ `name` của job
 *    `no-commerce`.** Bốn thứ đầu chỉ làm tài liệu dài ra. Cái cuối là để
 *    `scripts/check-no-commerce.mjs` — cổng có quét `packages/games/src` —
 *    không phải đọc một chuỗi tiếng Việt về thương mại nằm trong test này; và
 *    tình cờ nó cho luôn một ca job KHÔNG khai `name`.
 *
 * Mọi thứ còn lại là nguyên văn: 12 job, `needs` đúng như bản gốc, tên job,
 * nhãn máy chạy, `continue-on-error` cấp bước của job `sandbox-image`, và —
 * đáng chú ý — kho này KHÔNG có khoá `name` ở gốc workflow.
 */
const CI_YML_RUT_GON = `on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  proto:
    name: Contract (buf)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - uses: bufbuild/buf-setup-action@a47c93e0b1648d5651a065437926377d060baa99
      - name: Lint proto
        run: make proto-lint

  ts:
    name: TypeScript (lint + build + test)
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Cài phụ thuộc
        run: pnpm install --frozen-lockfile
      - name: Cổng chất lượng
        run: pnpm turbo run lint typecheck build test

  go:
    name: Go (build + vet + test + lint + vuln)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Dựng và kiểm
        run: go work sync && make go-build go-vet go-test

  infra:
    name: Infra (helm + kubeconform + shellcheck + actionlint)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Kiểm manifest
        run: make helm-lint

  secret-scan:
    name: Secret scan (gitleaks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Quét bí mật
        run: gitleaks detect --no-git

  sandbox-image:
    name: 'Build thử: sandbox-base'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: 'Trivy — CỔNG CHẶN ở CRITICAL (trước khi vào main)'
        id: trivy-critical
        continue-on-error: true
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25

  terminal-browser:
    name: Terminal (Chromium — WebGL fallback + StrictMode)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Chạy spec trình duyệt
        run: pnpm exec playwright test terminal.spec.ts

  web-a11y:
    name: 'Web (axe + CSP trên next start)'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Dựng web
        run: pnpm --filter @devops-platform/web build

  no-commerce:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Cổng nội dung
        run: node scripts/check-no-commerce.mjs

  cicd-neutral:
    name: 'Lõi CI/CD trung lập (không tên nhà cung cấp)'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Cổng trung lập
        run: node scripts/check-cicd-vendor-neutral.mjs

  ci-ok:
    name: ci-ok
    if: always()
    needs:
      - proto
      - ts
      - go
      - infra
      - secret-scan
      - sandbox-image
      - terminal-browser
      - web-a11y
      - no-commerce
      - cicd-neutral
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: 'Mọi cổng phải success (hoặc skipped hợp lệ)'
        run: echo "kết quả các cổng: $RESULTS"

  images:
    name: 'Build & push: \${{ matrix.name }}'
    needs: ci-ok
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        name:
          - web
          - migrator
          - orchestrator
          - terminal-gateway
          - sandbox-base
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      - name: Dựng và đẩy image
        uses: docker/build-push-action@v6
`;

describe('AC-C — workflow thật của kho này (ci.yml rút gọn)', () => {
  const { workflow, ket } = docOk(CI_YML_RUT_GON);

  it('đọc được đủ 12 job, theo đúng thứ tự nguồn', () => {
    expect(workflow.stages.map((s) => s.id)).toEqual([
      'proto',
      'ts',
      'go',
      'infra',
      'secret-scan',
      'sandbox-image',
      'terminal-browser',
      'web-a11y',
      'no-commerce',
      'cicd-neutral',
      'ci-ok',
      'images',
    ]);
  });

  it('kho này không khai `name` ở gốc ⇒ mặc định được dùng', () => {
    expect(workflow.name).toBe(TEN_WORKFLOW_MAC_DINH);
  });

  it('đồ thị phụ thuộc đúng bản gốc — và hai dạng `needs` cùng có mặt', () => {
    // `ci-ok` viết dạng dãy (bản gốc dùng dãy dạng dòng), `images` viết dạng
    // chuỗi. Đây là lý do bảng ánh xạ phải nhận cả hai, không phải một lựa chọn
    // "cho đủ".
    expect(stage(workflow, 'ci-ok').dependsOn).toEqual([
      'proto',
      'ts',
      'go',
      'infra',
      'secret-scan',
      'sandbox-image',
      'terminal-browser',
      'web-a11y',
      'no-commerce',
      'cicd-neutral',
    ]);
    expect(stage(workflow, 'images').dependsOn).toEqual(['ci-ok']);
    expect(stage(workflow, 'proto').dependsOn).toEqual([]);
  });

  it('job không khai `name` lấy id làm tên', () => {
    expect(stage(workflow, 'no-commerce').name).toBe('no-commerce');
  });

  it('`continue-on-error: true` cấp bước của job quét image đọc ra `blocking: false`', () => {
    const buoc = stage(workflow, 'sandbox-image').steps;
    expect(buoc.map((b) => ({ id: b.id, blocking: b.blocking }))).toEqual([
      { id: 'buoc-1', blocking: true },
      { id: 'trivy-critical', blocking: false },
    ]);
    // Job thì KHÔNG khai `continue-on-error`, nên nó vẫn chặn — hai tầng độc lập.
    expect(stage(workflow, 'sandbox-image').blocking).toBe(true);
  });

  it('ma trận của job `images` ra một trục năm giá trị', () => {
    expect(stage(workflow, 'images').fanOut).toEqual({
      axes: [{ name: 'name', values: ['web', 'migrator', 'orchestrator', 'terminal-gateway', 'sandbox-base'] }],
    });
  });

  it('tên job chứa dấu hai chấm trong nháy vẫn giữ nguyên', () => {
    expect(stage(workflow, 'images').name).toBe('Build & push: ${{ matrix.name }}');
    expect(stage(workflow, 'sandbox-image').name).toBe('Build thử: sandbox-base');
  });

  it('loại stage suy ra được cho cả 12 job, và ba job rơi vào nhánh mặc định', () => {
    // Ghim NGUYÊN TRẠNG, kể cả những chỗ đọc ra hơi lạ. Đây là thứ bảng tra
    // thật sự làm trên một kho thật, không phải thứ nó làm trên một ví dụ đã
    // chọn cho đẹp: tên job ngoài đời mô tả CẤU TRÚC KHO (`ts`, `go`, `infra`)
    // chứ không mô tả GIAI ĐOẠN đường ống, nên bốn job cùng đọc ra `lint` và
    // ba job không có tín hiệu nào.
    expect(Object.fromEntries(workflow.stages.map((s) => [s.id, s.kind]))).toEqual({
      proto: 'lint',
      ts: 'lint',
      go: 'lint',
      infra: 'lint',
      'secret-scan': 'sast',
      'sandbox-image': 'image-scan',
      'terminal-browser': 'build',
      'web-a11y': 'build',
      'no-commerce': 'build',
      'cicd-neutral': 'build',
      'ci-ok': 'gate',
      images: 'publish',
    });
  });

  it('khoá không mô phỏng được liệt kê, không nuốt im lặng', () => {
    if (!ket.ok) {
      throw new Error('không tới được đây');
    }
    const paths = ket.ignored.map((k) => k.path);
    expect(paths).toContain('on');
    expect(paths).toContain('permissions');
    expect(paths).toContain('jobs.proto.timeout-minutes');
    expect(paths).toContain('jobs.ci-ok.if');
    expect(paths).toContain('jobs.images.strategy.fail-fast');
    for (const k of ket.ignored) {
      expect(k.line).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 19.C.4 — lỗi ĐỒ THỊ báo tại đúng dòng, và hai job trùng tên bị từ chối
// ═══════════════════════════════════════════════════════════════════════════

describe('19.C.4 — phụ thuộc trỏ vào hư không', () => {
  /*
   * ĐỐI CHỨNG DƯƠNG: trước 19.C.4 nguồn này đọc RA `ok: true` và cạnh hỏng đi
   * thẳng vào engine, chỗ nó thành `EvaluationError` không mang dòng nào.
   */
  it('`needs` trỏ job không tồn tại ⇒ TỪ CHỐI, trỏ vào đúng phần tử của dãy', () => {
    const loi = docLoi(`jobs:
  a:
    needs:
      - ghost
    steps: []
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.message).toContain('ghost');
    expect(loi[0]?.line).toBe(4);
    // Cột của dấu '-', không phải của khoá `needs`.
    expect(loi[0]?.column).toBe(7);
  });

  it('`needs` dạng CHUỖI đơn trỏ vào hư không ⇒ lỗi tại chính khoá `needs`', () => {
    const loi = docLoi(`jobs:
  a:
    needs: ghost
    steps: []
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.line).toBe(3);
    expect(loi[0]?.column).toBe(5);
  });

  /*
   * MỌI cạnh hỏng, không chỉ cái đầu. Engine chỉ mang được một lỗi; ô soạn
   * (19.E) gạch chân hết cùng lúc, nên người chơi không phải chạy lại sau mỗi
   * lần sửa một chữ.
   */
  it('nhiều phụ thuộc hỏng ⇒ báo HẾT, mỗi cái một dòng', () => {
    const loi = docLoi(`jobs:
  a:
    needs:
      - ma-mot
      - ma-hai
    steps: []
  b:
    needs:
      - ma-ba
    steps: []
`);
    expect(loi).toHaveLength(3);
    expect(loi.map((e) => e.line)).toEqual([4, 5, 9]);
  });

  it('job hỏng ở chỗ khác KHÔNG đẻ thêm lỗi "job không tồn tại" ăn theo', () => {
    // `steps` sai kiểu ⇒ job `b` bị loại khỏi `stages`. Nếu phép kiểm đồ thị
    // chạy bất chấp, `a` sẽ bị báo thêm là cần một job không tồn tại.
    const loi = docLoi(`jobs:
  a:
    needs:
      - b
    steps: []
  b:
    steps: khong-phai-day
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.message).toContain('steps');
  });
});

describe('19.C.4 — chu trình', () => {
  it('vòng hai job ⇒ gạch chân CẢ HAI cạnh tạo thành vòng', () => {
    const loi = docLoi(`jobs:
  b:
    needs:
      - c
    steps: []
  c:
    needs:
      - b
    steps: []
`);
    expect(loi).toHaveLength(2);
    expect(loi.map((e) => e.line)).toEqual([4, 8]);
    for (const e of loi) {
      expect(e.message).toContain('Chu trình');
    }
  });

  it('tự phụ thuộc là vòng độ dài 1, và nói ra đúng chuyện đó', () => {
    const loi = docLoi(`jobs:
  a:
    needs:
      - a
    steps: []
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.message).toContain('chính nó');
    expect(loi[0]?.line).toBe(4);
  });

  it('vòng ba job ⇒ ba cạnh, và thông điệp đọc xuôi được cả vòng', () => {
    const loi = docLoi(`jobs:
  a:
    needs:
      - b
    steps: []
  b:
    needs:
      - c
    steps: []
  c:
    needs:
      - a
    steps: []
`);
    expect(loi).toHaveLength(3);
    expect(loi[0]?.message).toContain('a → b → c → a');
  });

  /*
   * Thứ tự ưu tiên mượn nguyên của `validateGraph`: tên gõ nhầm thường đang che
   * đi chính cạnh người chơi định viết, nên báo vòng trước là bắt họ gỡ một vòng
   * có thể biến mất ngay khi sửa chữ đó.
   */
  it('hỏng cả hai kiểu ⇒ chỉ báo phụ thuộc thiếu, chưa báo vòng', () => {
    const loi = docLoi(`jobs:
  a:
    needs:
      - ghost
    steps: []
  b:
    needs:
      - c
    steps: []
  c:
    needs:
      - b
    steps: []
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.message).toContain('ghost');
  });

  it('ĐỐI CHỨNG DƯƠNG — một DAG hợp lệ vẫn đọc được', () => {
    const { workflow } = docOk(`jobs:
  a:
    needs:
      - b
    steps: []
  b:
    steps: []
`);
    expect(workflow.stages.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });
});

describe('19.C.4 — hai job trùng tên', () => {
  /*
   * AC-C đòi "C.4 từ chối được một YAML có hai job trùng tên".
   *
   * ⚠ Phép chặn KHÔNG nằm ở file này mà ở `core/yaml.ts`, và đó là kết luận của
   * một phép đo chứ không phải một lựa chọn kiến trúc: plan P19 §19.C giả định
   * hai job trùng tên đi tới engine thành hai mục cùng `id` trong
   * `WorkflowSpec.stages`. Đo lại 2026-09-16 thì chúng KHÔNG tới được — bộ quét
   * dựng map bằng `map[khoá] = giá trị` nên mục thứ hai đè mục thứ nhất, và bộ
   * đọc này chỉ bao giờ thấy MỘT job. Mất dữ liệu im lặng, không phải trùng id.
   */
  it('hai job trùng tên bị TỪ CHỐI, kèm dòng của lần khai thứ hai', () => {
    const loi = docLoi(`jobs:
  build:
    needs:
      - test
    steps: []
  build:
    steps: []
  test:
    steps: []
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.message).toContain('build');
    expect(loi[0]?.line).toBe(6);
  });

  it('trùng tên ở cấp BƯỚC cũng bị bắt', () => {
    const loi = docLoi(`jobs:
  a:
    steps:
      - id: mot
        id: hai
`);
    expect(loi).toHaveLength(1);
    expect(loi[0]?.line).toBe(5);
  });
});
