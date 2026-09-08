# Đường ống (`pipeline`) — thiết kế

**Trạng thái:** thiết kế, **chưa code**. Đợt P14.1 chỉ hiện thực K8s Game
(`phase-14-exec.md` §1 quyết định 4). Tài liệu này là thứ người hiện thực sau này làm việc từ đó.

**`GameId`:** `'pipeline'` (đã có sẵn trong `packages/games/src/core/types.ts`).

---

## 1. Vòng lặp chơi

Người chơi dựng một đường ống CI/CD dưới dạng **đồ thị có hướng không chu trình**: kéo
stage vào canvas (build, test, scan, deploy), nối cạnh phụ thuộc, rồi bấm chạy. Mô phỏng
chạy nhiều lượt và trả về ba con số: thời gian trôi qua, tỷ lệ lượt chạy xanh, và số
runner-tick đã tiêu.

```
soạn đồ thị  →  chạy N lượt có hạt giống  →  đọc ba con số  →  sửa đồ thị  →  chạy lại
```

Ba thứ định hình mọi level:

1. **Runner có hạn.** Đồ thị cho phép mười stage chạy song song, nhưng chỉ có hai runner.
   Song song trên giấy khác song song trên máy.
2. **Test đỏ giả (flaky).** Mỗi stage mang `flakeRate`. Một lượt chạy xanh không chứng
   minh đường ống tốt.
3. **Cache có khoá.** Cache đúng khoá thì bỏ được phần lớn `durationTicks`. Khoá quá rộng
   thì lấy nhầm cache của lần build khác và stage đỏ vì lý do không liên quan gì tới code.

### Khác ba game kia ở đâu

| Game | Câu hỏi trung tâm | Đối tượng |
|---|---|---|
| K8s Game | *"Cái gì đang hỏng, và sửa thế nào?"* | một hệ đang chạy |
| **Đường ống** | *"Việc nào chờ việc nào, và bao giờ xong?"* | một kế hoạch |
| Mê cung mạng | *"Tập được phép có đúng bằng tập cần phép không?"* | một tập hợp |
| Lò rèn Image | *"Cái artifact này gồm những gì?"* | một vật thể |

Đường ống là game duy nhất mà **đáp án là một hình dạng, không phải một giá trị**, và là
game duy nhất người chơi không chẩn đoán gì cả. Không có gì hỏng để tìm. Cái phải tìm là
một trật tự.

---

## 2. Mô hình trạng thái

Đặt ở `packages/games/src/pipeline/contract.ts`, đối xứng với `k8s/contract.ts`.

### 2.1 Cái gì dùng lại được từ hợp đồng chung

Từ `core/types.ts` (lead sở hữu, dùng nguyên vẹn, không sửa):
`GameId` · `Difficulty` · `RunResult` · `GameSave` · `GameSettings` · `storageKey('pipeline')`.

Khoá lưu: `dlp.games.v1.pipeline`. Không field suy ra được: `passed`, `percent`,
`durationSeconds` tính ở chỗ dùng, đúng như `RunResult` đã dặn.

### 2.2 Cái gì KHÔNG dùng lại được, và phải báo lead

⚠ `RunLog` và `GameAction` nằm ở **`k8s/contract.ts`**, không ở `core/`. Và
`GameAction.kind` là union đóng `'apply' | 'delete' | 'scale' | 'edit' | 'kubectl' |
'hint' | 'wait'`: `'kubectl'` vô nghĩa với game này, `'scale'` cũng vậy, còn hành động
thật của nó (thêm stage, nối cạnh, đổi retry) thì không có tên nào.

Hệ quả: **cơ chế xác minh chống gian lận ở `phase-14-exec.md` §8.3 hiện chỉ dùng được
cho K8s Game.** Muốn nó áp cho Đường ống thì `RunLog` phải chuyển lên `core/` và
`GameAction` phải mở ra theo game. Cả hai file đều do lead sở hữu, nên đây là **việc báo
lead**, không phải việc người hiện thực tự làm. Ghi ở đây để người đó không đọc §8.3 rồi
tưởng cơ chế đã sẵn.

Tương tự, `EdgeView` trong `k8s/contract.ts` có `kind: 'owns' | 'selects' | 'mounts' |
'routes'` nên không tả được cạnh phụ thuộc của một DAG, dù cái tên nghe như dùng chung
được. Đây là một cái bẫy đặt tên: **mọi thứ trong `k8s/contract.ts` là của K8s, kể cả khi
tên nó không nói vậy.**

### 2.3 Hình dạng khai báo (dữ liệu level)

```ts
export type StageKind =
  | 'clone' | 'build' | 'unit-test' | 'integration-test' | 'lint'
  | 'sast' | 'image-scan' | 'package' | 'push'
  | 'deploy-staging' | 'smoke' | 'deploy-prod' | 'approval';

export interface StageSpec {
  readonly id: string;
  readonly kind: StageKind;
  readonly name: string;                 // tiếng Việt
  /** Tick danh nghĩa khi cache trượt. TICK_MS là hằng công khai, giống k8s/tick.ts. */
  readonly durationTicks: number;
  /** 0..1. Xác suất stage đỏ mà KHÔNG phải do lỗi thật. Rút từ core/rng.ts. */
  readonly flakeRate: number;
  /** 0 = không thử lại. Retry chỉ cứu được đỏ giả, xem §4. */
  readonly retries: number;
  /** Số runner stage này chiếm suốt thời gian chạy. */
  readonly runnerSlots: number;
  readonly cache?: CacheSpec;
  /** id các stage phải PASS trước. Đây là cạnh của đồ thị. */
  readonly needs: readonly string[];
  /** true = stage đỏ thì cả lượt chạy đỏ. false = đỏ nhưng đi tiếp (ví dụ lint cảnh báo). */
  readonly blocking: boolean;
}

export interface CacheSpec {
  /** Khoá cache. Hai lượt cùng khoá thì lượt sau trúng. */
  readonly key: string;
  /** Tick tiết kiệm được khi trúng. Không bao giờ vượt durationTicks. */
  readonly savesTicks: number;
  /**
   * Stage nào làm hỏng khoá này khi nội dung của nó đổi. Đây là chỗ dạy
   * "khoá quá rộng": một khoá phụ thuộc mọi thứ thì không bao giờ trúng.
   */
  readonly invalidatedBy: readonly string[];
}

export interface PipelineLevel {
  readonly id: string;                   // 'pipeline-01-mot-hang'
  readonly title: string;
  readonly brief: string;                // markdown tiếng Việt, ≤ 400 từ
  readonly difficulty: Difficulty;       // từ core/types.ts
  /** Đồ thị người chơi bắt đầu với. Rỗng = dựng từ số không. */
  readonly initialStages: readonly StageSpec[];
  /** Stage người chơi được phép thêm ở level này. Cách kiểm soát nhịp dạy. */
  readonly allowedKinds: readonly StageKind[];
  /** Cái gì người chơi được sửa: cạnh, retry, khoá cache, số runner. */
  readonly editable: readonly ('edges' | 'retries' | 'cache' | 'runners' | 'stages')[];
  readonly runners: { readonly count: number; readonly editableUpTo?: number };
  readonly objectives: readonly Objective[];   // cùng hình dạng Objective của k8s
  readonly hints: readonly string[];
  /** Mốc chấm điểm. §5 nói vì sao ngưỡng phải phái sinh từ đây, không phải hằng số. */
  readonly parTicks: number;
  readonly budgetTicks: number;
  readonly minReliability: number;       // 0..1
  readonly teaches: readonly string[];
}
```

⚠ **Stage đầu tiên tên là `'clone'`, không phải `'checkout'`, và đó là chủ ý.** GitHub
Actions gọi bước này là `checkout`, nên đó là cái tên đầu tiên ai cũng nghĩ tới. Nhưng
`scripts/check-no-commerce.mjs` bắt token trần `checkout` trong luật `en-thương-mại` và chỉ
che hai dạng `git checkout` với `actions/checkout`, lại **không có lối thoát inline** (cố ý,
xem đầu script). Một union chứa `'checkout'` sẽ làm đỏ cổng ngay khi `packages/games/src`
được thêm vào `ROOTS` của script đó, và người sửa sẽ mất một vòng CI để hiểu vì sao. `clone`
mô tả đúng việc runner làm và không va vào mẫu nào.

(Đoạn vừa rồi gọi tên token bị cấm là an toàn vì `docs/` **không** nằm trong `ROOTS`. Một
tài liệu giải thích cổng thì buộc phải nêu tên thứ cổng bắt; chính `check-no-commerce.mjs`
cũng chứa đủ mẫu của nó và tự loại mình khỏi vùng quét vì đúng lý do đó. Nếu sau này ai
thêm `docs/` vào `ROOTS` thì cần một `MASK`, không phải sửa câu này.)

📌 Việc kèm theo, **cho lead**: `packages/games/src` hiện **không** nằm trong `ROOTS` của
`scripts/check-no-commerce.mjs` (vùng quét là `apps/web/{src,e2e,drizzle}`,
`packages/{ui,scenario,shared-types,terminal}/src`, `content`). Package game mới sinh ra sau
khi script được viết nên nó rơi ra ngoài. Không phải việc của lane tài liệu để sửa
`scripts/`, nhưng cần có người sửa.

`Objective.check` là **tên vị từ dạng chuỗi**, y hệt ràng buộc của K8s Game và vì đúng
lý do đó: level phải serialize được để lưu replay và so bằng `toEqual` trong test. Từ
vựng vị từ riêng của game này nằm ở `pipeline/predicate-names.ts`, gợi ý ban đầu:
`stage-exists` · `stage-depends-on` · `stage-not-depends-on` · `graph-acyclic` ·
`p50-under` · `reliability-at-least` · `runner-ticks-under` · `stage-has-retries` ·
`cache-hits-at-least` · `no-blocking-after` · `stage-count-at-most`.

### 2.4 Hình dạng lúc chạy (hình chiếu cho giao diện)

```ts
export type StageRunState =
  | 'pending' | 'queued' | 'running' | 'retrying'
  | 'passed' | 'failed' | 'skipped';

export interface PipelineView {
  readonly tick: number;
  readonly stages: readonly StageRunView[];
  readonly edges: readonly DagEdgeView[];
  readonly runnersBusy: number;
  readonly runnersTotal: number;
  readonly events: readonly EventView[];   // hình dạng giống EventView của k8s
}

export interface StageRunView {
  readonly stageId: string;
  readonly state: StageRunState;
  readonly attempt: number;
  readonly startedTick: number | null;
  readonly finishedTick: number | null;
  readonly cacheHit: boolean | null;       // null = stage không có cache
  /** true = đỏ vì flake, false = đỏ vì lỗi thật. CHỈ lộ ra sau khi lượt chạy kết thúc. */
  readonly failedByFlake: boolean | null;
  /** Token màu ngữ nghĩa, KHÔNG phải mã màu. Cùng luật với ObjectView.statusToken. */
  readonly statusToken: 'success' | 'destructive' | 'warning' | 'status-progress' | 'status-locked';
  readonly ariaLabel: string;              // tiếng Việt, đọc được bằng trình đọc màn hình
}

export interface DagEdgeView {
  readonly fromStageId: string;
  readonly toStageId: string;
  /** true = cạnh này nằm trên đường găng của lượt chạy vừa rồi. */
  readonly critical: boolean;
}
```

`critical` là thứ làm game này dạy được: sau mỗi lượt, đường găng được tô sáng. Người chơi
thấy ngay việc rút ngắn một stage **không** nằm trên đường găng thì không đổi được gì.

---

## 3. Vì sao phải chạy N lượt, không phải một

Đây là quyết định thiết kế trung tâm, và nó khác mọi game còn lại.

`phase-14-exec.md` §3.4 bắt mô phỏng phải **tất định**: cùng seed + cùng chuỗi action ⇒
cùng trạng thái. Ràng buộc đó vẫn giữ nguyên ở đây, nhưng nó được áp ở tầng khác: một
**lượt chấm** gồm `N = 20` lượt chạy với seed dẫn xuất `rng(baseSeed, i)`. Cùng `baseSeed`
+ cùng đồ thị ⇒ cùng đúng 20 lượt chạy đó ⇒ cùng điểm. Tất định giữ nguyên; cái ngẫu
nhiên nằm *bên trong* một phép đo lặp lại được.

Vì sao không một lượt: một đường ống có `flakeRate = 0.05` ở ba stage sẽ xanh khoảng 86%
số lượt. Chấm trên một lượt là tung đồng xu. Người chơi sẽ học được đúng bài học sai:
*"chạy lại là hết"*. Chấm trên 20 lượt buộc họ đọc một **phân bố**, và đó là cách người
vận hành CI thật nhìn vấn đề flaky.

Giao diện phải hiện cả hai: một lượt chạy đang diễn ra (để nhìn được), và bảng tổng 20
lượt (để chấm). Con số dùng để chấm là **p50 của 20 lượt**, không phải lượt đang xem.

---

## 4. Retry cứu được gì, không cứu được gì

Một stage đỏ vì hai lý do khác nhau, và game phải phân biệt được:

| Loại đỏ | Retry có cứu không | Người chơi thấy gì |
|---|---|---|
| Đỏ giả (flake) | **Có.** Lần thử sau rút lại xúc xắc | Lần 2 xanh, log giống hệt |
| Đỏ thật (lỗi trong đồ thị: thiếu phụ thuộc, cache lấy nhầm) | **Không.** Thử bao nhiêu lần cũng đỏ | Ba lần đỏ liên tiếp, cùng thông điệp |

Đây là mục tiêu sư phạm của level 6 và 7. Retry đặt bừa khắp nơi làm ba việc cùng lúc:
che lỗi thật, kéo dài p50, và tiêu runner-tick. Game phạt cả ba, nên "cứ retry hết cho
chắc" là một chiến lược **thua điểm**, không phải một chiến lược an toàn.

`failedByFlake` chỉ lộ ra **sau khi lượt chạy kết thúc**. Trong lúc chạy, hai loại đỏ
trông giống hệt nhau, đúng như đời thật.

---

## 5. Chấm điểm

`score: number` trong `RunResult` là 0..1000, tính ở `pipeline/scoring.ts`.

| Trục | Trọng số mặc định | Cách tính |
|---|---|---|
| Thời gian | 400 | `clamp(parTicks / p50Ticks, 0, 1) × 400` |
| Độ tin cậy | 400 | `clamp((greenRuns/N - minReliability) / (1 - minReliability), 0, 1) × 400` |
| Tiết kiệm runner | 200 | `clamp(parRunnerTicks / actualRunnerTicks, 0, 1) × 200` |

Ba ràng buộc cứng, không phải trừ điểm:

- Đồ thị có chu trình ⇒ không chạy được, `score = 0`. Không có "gần đúng" ở đây.
- `p50Ticks > budgetTicks` ⇒ trượt level, bất kể ba trục trên.
- `greenRuns/N < minReliability` ⇒ trượt level.

⛔ **Ngưỡng phải phái sinh từ `parTicks` và `budgetTicks` của chính level đó, không được là
hằng số toàn cục.** Đây là lỗi thiết kế đo được ở upstream: ngưỡng sao của challenge mode
hardcode `completionTime <= 120` trong khi challenge #10 có ngân sách 600 giây, nên muốn
điểm cao phải nhanh gấp năm lần ngân sách được cấp, còn hai challenge có ngân sách 180
giây thì mốc điểm giữa trùng đúng bằng deadline nên không bao giờ đạt nổi
(`2026-09-08-p14-k8sgames-upstream-study.md` §2.4). Một hệ chấm không đọc ngân sách của
bài là một hệ chấm nói dối, và nó nói dối khác nhau ở mỗi bài.

---

## 6. Mười lăm level đầu

| # | Tiêu đề | Mục tiêu |
|---|---|---|
| 1 | Ba bước một hàng | Nối `clone → build → unit-test` thành một chuỗi chạy được; đọc bảng stage và hiểu mỗi ô là một đơn vị công việc. |
| 2 | Hai việc không cần đợi nhau | Tách `lint` khỏi nhánh `build` để nó chạy song song; p50 phải giảm so với đồ thị tuyến tính. |
| 3 | Bốn việc, hai runner | Bốn stage độc lập nhưng chỉ hai runner: xếp thứ tự sao cho p50 dưới `budgetTicks`. |
| 4 | Đường găng | Rút ngắn đúng stage nằm trên đường găng; chứng minh bằng cách rút một stage khác trước và thấy p50 không đổi. |
| 5 | Cache có ích ở đâu | Đặt `cache.key` cho `build` sao cho lượt chạy thứ hai trúng cache; đọc `cacheHit` trong bảng. |
| 6 | Khoá quá rộng | Khoá hiện tại `invalidatedBy` mọi stage nên không bao giờ trúng; thu hẹp lại mà không làm cache lấy nhầm. |
| 7 | Test đỏ 5% | Thêm `retries` đúng cho stage flaky; đạt `reliability ≥ 0.95` trên 20 lượt mà p50 vẫn trong ngân sách. |
| 8 | Retry không cứu được lỗi thật | Một stage đỏ 100% vì thiếu phụ thuộc; tìm ra nó thay vì tăng `retries` (mọi lời giải tăng retry đều trượt). |
| 9 | Dừng sớm hay chạy hết | Chọn `blocking` cho từng stage; so hai chính sách trên cùng đồ thị và giải thích lựa chọn trong mục tiêu thưởng. |
| 10 | Quét bảo mật chặn hay cảnh báo | Đặt `sast` và `image-scan` vào đúng chỗ: chặn trước `deploy-prod`, không chặn trước `unit-test`. |
| 11 | Fan-out, fan-in | `build` một lần, `integration-test` ba nhánh song song, gộp lại một cổng trước khi đóng gói. |
| 12 | Cổng phê duyệt của con người | `approval` có thời gian không đoán được; đặt nó sao cho nó không chiếm runner và không nằm trên đường găng của phần tự động. |
| 13 | Hai vùng | `deploy-staging → smoke → deploy-prod`; `deploy-prod` không được chạy nếu `smoke` chưa xanh, kể cả khi runner đang rảnh. |
| 14 | Chu trình | Đồ thị cho sẵn có một vòng phụ thuộc; tìm và phá nó mà không mất một stage nào. |
| 15 | Ngân sách mười phút | Đồ thị 14 stage, ba stage flaky, hai runner: đạt cùng lúc p50 dưới ngân sách, `reliability ≥ 0.9`, và runner-tick dưới mốc. |

Level 1 đến 4 chỉ mở `editable: ['edges']`. Cache mở từ level 5, retry từ level 7, thêm
stage từ level 10. Đây là cùng cơ chế `allowedResources` mà K8s Game dùng để kiểm soát
nhịp dạy.

---

## 7. Cái nó dạy được mà K8s Game không dạy được

Ba thứ, và cả ba đều **không có đường nào để xuất hiện** trong một mô phỏng cluster.

**1. Khác biệt giữa tổng công việc và thời gian trôi qua.** K8s Game có trục thời gian
(tick), nhưng thời gian ở đó là *thứ trôi qua trong lúc người chơi sửa*, không phải thứ
người chơi tối ưu. Không mục tiêu nào của nó thưởng cho việc hiểu rằng hai việc có thể
xảy ra cùng lúc. Đường ống thì toàn bộ đáp án nằm ở đó: cùng một tập stage, cùng một tổng
`durationTicks`, hai đồ thị khác nhau cho ra hai p50 chênh nhau hai lần. Khái niệm đường
găng không diễn đạt được bằng ngôn ngữ của cluster.

**2. Đọc một phân bố thay vì một kết quả.** Hợp đồng của K8s Game *bắt buộc* tất định
(`contract.ts`, khối chú thích của `GameAction`): mỗi level có đúng một trạng thái đích và
người chơi hoặc tới đó hoặc không. Đó là thiết kế đúng cho một game chẩn đoán, và nó khiến
K8s Game **về mặt cấu trúc** không thể dạy được rằng một hệ có thể vừa đúng vừa hỏng 14%
số lần. Flaky test là vấn đề tốn nhiều giờ nhất của kỹ sư CI thật, và nó chỉ nhìn thấy
được khi có nhiều lượt để so.

**3. Cache là một nguy cơ về tính đúng, không chỉ là một nút tăng tốc.** Level 6 dạy một
thứ mà không có tài nguyên Kubernetes nào biểu diễn được: một stage xanh vì nó dùng lại
kết quả của một lần build khác. Không có `IncidentKind` nào trong `k8s/contract.ts` tả
được chuyện đó, và không thể thêm vào, vì cluster không có khái niệm build.

### Vế yếu nhất trong ba vế, nói trước khi ai đó chỉ ra

Vế 2 là vế gần bị chồng lấn nhất, và câu trả lời của nó mỏng hơn hai vế kia. Chaos mode
của K8s Game **cũng** có ngẫu nhiên: sự cố bốc theo `ChaosWave` từ một hạt giống, nên
người chơi cũng phải xử lý thứ mình không đoán trước được. Ai đó đọc lướt sẽ kết luận là
hai game dạy cùng một thứ.

Khác biệt có thật nhưng hẹp, nên phải phát biểu chính xác: chaos mode ngẫu nhiên hoá
**đề bài** (sự cố nào rơi xuống), còn mỗi sự cố vẫn có đúng một cách sửa và sửa xong là
xong. Đường ống ngẫu nhiên hoá **kết quả của một lời giải đã đúng**: cùng một đồ thị, cùng
một người chơi, chạy hai mươi lần ra mười bảy lần xanh. Câu hỏi *"lời giải này có đúng
không"* ở chaos mode trả lời được bằng một lượt chơi; ở đây thì không, và đó là toàn bộ
khác biệt.

Nếu người hiện thực bỏ cơ chế N lượt ở §3 để tiết kiệm công (chấm trên một lượt cho nhanh)
thì vế 2 **biến mất hoàn toàn**, và game tụt xuống còn hai lý do để tồn tại. Nó vẫn đủ để
tồn tại nhờ vế 1 và vế 3, nhưng ghi ở đây để việc cắt đó là một quyết định có ý thức chứ
không phải một lần tối giản vô tình.

---

## 8. Chỗ ý tưởng này yếu, nói thẳng

**Rào a11y là rào cao nhất, và nó có thể giết game.** `phase-14-exec.md` §4.4 bắt **mọi
hành động chơi được phải làm xong bằng bàn phím**. Một trình soạn đồ thị kéo-thả đầy đủ
bàn phím là việc lớn hơn nhiều so với panel danh sách tài nguyên của K8s Game: phải có
cách chọn stage, cách "nối từ A sang B" mà không cần chuột, và cách đọc được cấu trúc đồ
thị bằng trình đọc màn hình. Đường đi duy nhất mà tài liệu này thấy khả thi là **đồ thị
có một biểu diễn danh sách tương đương và bình đẳng** (bảng stage với cột "phụ thuộc vào",
sửa được bằng combobox), còn canvas chỉ là hình minh hoạ như quy định. Nếu người hiện thực
làm canvas trước và coi danh sách là bản dự phòng, game này sẽ trượt cổng axe và phải viết
lại. Nói trước ở đây.

**Mọi con số đều do người thiết kế đặt.** `durationTicks`, `flakeRate`, `savesTicks` không
đo từ một đường ống thật nào. Người chơi học cách tối ưu một mô hình. Mô hình đó đúng về
*hình dạng* (song song giúp, đường găng quyết định, retry không cứu lỗi thật) nhưng sai về
*độ lớn*. Cách giảm thiệt hại: mọi mục tiêu phát biểu theo **so sánh tương đối** ("p50
phải nhỏ hơn đồ thị tuyến tính") thay vì theo con số tuyệt đối, và brief của level nói rõ
đây là mô phỏng.

**Nguy cơ trôi thành một bài toán xếp lịch không còn dính gì tới CI/CD.** Nếu người chơi
không bao giờ đọc output của một stage, thì `unit-test` và `image-scan` chỉ là hai cái hộp
có `durationTicks` khác nhau, và game đã thành một bài xếp việc song song đội lốt DevOps.
Ba đối trọng phải có mặt, không phải tuỳ chọn: level 8 (phải đọc log mới phân biệt được đỏ
thật với đỏ giả), level 10 (vị trí của stage quét chỉ đúng nếu hiểu nó quét cái gì), level
13 (thứ tự staging trước prod là một luật về hậu quả, không phải về thời gian).

**Chồng lấn với `deploy-staging`/`deploy-prod` của K8s Game là có thật nhưng nông.** K8s
Game có `IncidentKind` là `image-tag-sai`, tức nó chạm tới hậu quả của một lần deploy hỏng.
Đường ống chạm tới *quyết định* dẫn tới lần deploy đó. Hai đầu của cùng một sợi dây, và
không đầu nào nói được phần của đầu kia.
