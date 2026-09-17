/**
 * Dữ liệu dựng tay cho hai ô test của lane-2d. **Chỉ test dùng.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO DỰNG TAY `CicdGraphView` THAY VÌ CHẠY ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `placeWorkflow(view)` chỉ đọc `view.nodes` / `view.edges` / `view.yAxis` —
 * không một đường nào của nó chạm tới `WorkflowSpec` hay `RunRecord`. Nên một
 * view dựng tay đi qua ĐÚNG những nhánh mã mà một view do engine sinh ra đi
 * qua, và nó dựng được những hình dạng mà một level thật khó ép ra (ba thực thể
 * cùng `stageId`, một cạnh chờ-máy nằm trên đường găng).
 *
 * ⚠ Cái nó KHÔNG chứng minh: rằng engine sinh ra đúng những view này. Đó là
 * việc của `scene-view.test.ts` ở `packages/games`, không phải của lane-2d.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `fanOutView()` LÀ Ô CHỐNG ĐÚNG MỘT CON BUG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ba thực thể `test[os=linux|mac|windows]` mang CÙNG `stageId` là `'test'`. Một
 * bộ đếm khoá theo `stageId` trả **1** ở chỗ đáng lẽ phải là **3**, và cảnh vẫn
 * trông hợp lý vì ba node vẫn vẽ ra. Đó là lý do `CICD_NODE_ATTR` khoá theo
 * `InstanceKey` (chú thích của `../scene-props.ts` nói thẳng điều này), và là lý
 * do ô đếm node phải chạy trên MỘT LEVEL CÓ QUẠT RA — chạy trên một level không
 * quạt ra thì hai cách khoá cho cùng một con số và ô đó xanh mà không đo gì.
 */

import type {
  CicdGraphView,
  DagEdgeView,
  StageNodeView,
  StageRunState,
} from '@devops-platform/games';

export function stage(
  instance: string,
  stageId: string,
  over: Partial<StageNodeView> = {},
): StageNodeView {
  const state: StageRunState = over.state ?? 'pending';
  return {
    instance,
    stageId,
    kind: 'build',
    name: stageId,
    state,
    attempt: 0,
    readyTick: null,
    startedTick: null,
    finishedTick: null,
    cacheHit: null,
    environment: null,
    steps: [],
    statusToken: 'status-locked',
    ariaLabel: `${stageId}, chưa chạy`,
    ...over,
  };
}

export function edge(
  from: string,
  to: string,
  over: Partial<DagEdgeView> = {},
): DagEdgeView {
  return { from, to, critical: false, resourceEdge: false, ...over };
}

/**
 * Chương CI, có quạt ra và có một cạnh CHỜ-MÁY nằm trên đường găng.
 *
 * `build → test[×3] → package`, cộng một cạnh máy `test[os=linux] → test[os=windows]`
 * ("linux đang giữ con máy mà windows cần"). Đường găng đi qua đúng cạnh máy đó,
 * nên ô "đường găng có đoạn chờ máy" có thứ để đo.
 *
 * `test[os=windows]` chờ 6 tick (`readyTick 4`, `startedTick 10`) — đó là TRỤC Y
 * của chương CI, thứ phép chiếu 2D gập đi, và là thứ badge chờ-máy phải cứu.
 */
export function ciView(): CicdGraphView {
  return {
    yAxis: 'ci',
    nodes: [
      stage('build', 'build', {
        state: 'passed',
        statusToken: 'success',
        readyTick: 0,
        startedTick: 0,
        finishedTick: 4,
        cacheHit: true,
        ariaLabel: 'build, đã xong',
      }),
      stage('test[os=linux]', 'test', {
        state: 'passed',
        statusToken: 'success',
        readyTick: 4,
        startedTick: 4,
        finishedTick: 9,
        ariaLabel: 'test trên linux, đã xong',
      }),
      stage('test[os=mac]', 'test', {
        state: 'failed',
        statusToken: 'destructive',
        readyTick: 4,
        startedTick: 4,
        finishedTick: 8,
        ariaLabel: 'test trên mac, đỏ',
      }),
      stage('test[os=windows]', 'test', {
        state: 'running',
        statusToken: 'status-progress',
        readyTick: 4,
        startedTick: 10,
        ariaLabel: 'test trên windows, đang chạy',
      }),
      stage('package', 'package', {
        state: 'queued',
        statusToken: 'warning',
        readyTick: 9,
        ariaLabel: 'package, đang xếp hàng',
      }),
    ],
    edges: [
      edge('build', 'test[os=linux]'),
      edge('build', 'test[os=mac]'),
      edge('build', 'test[os=windows]', { critical: true }),
      edge('test[os=linux]', 'package'),
      edge('test[os=mac]', 'package'),
      edge('test[os=windows]', 'package', { critical: true }),
      edge('test[os=linux]', 'test[os=windows]', { critical: true, resourceEdge: true }),
    ],
  };
}

/**
 * Chương CD: ba dải môi trường, và hai job CÙNG dải khác làn — đó là trục bị
 * gập của chương này (`sceneAxes('cd').folded === 'z'`), thứ `foldNudge()` phải
 * cứu bằng một lệch dọc nhỏ.
 */
export function cdView(): CicdGraphView {
  return {
    yAxis: 'cd',
    nodes: [
      stage('package', 'package', {
        state: 'passed',
        statusToken: 'success',
        readyTick: 0,
        startedTick: 0,
        finishedTick: 3,
      }),
      stage('deploy-dev', 'deploy-dev', {
        kind: 'deploy',
        state: 'passed',
        statusToken: 'success',
        environment: 'dev',
        readyTick: 3,
        startedTick: 3,
        finishedTick: 6,
      }),
      stage('smoke-dev', 'smoke-dev', {
        kind: 'smoke',
        state: 'passed',
        statusToken: 'success',
        environment: 'dev',
        readyTick: 3,
        startedTick: 3,
        finishedTick: 5,
      }),
      stage('deploy-prod', 'deploy-prod', {
        kind: 'deploy',
        state: 'skipped',
        statusToken: 'status-locked',
        environment: 'prod',
      }),
    ],
    edges: [
      edge('package', 'deploy-dev', { critical: true }),
      edge('package', 'smoke-dev'),
      edge('deploy-dev', 'deploy-prod', { critical: true }),
    ],
  };
}
