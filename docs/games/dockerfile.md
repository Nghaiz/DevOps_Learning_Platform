# Lò rèn Image (`dockerfile`) — thiết kế

**Trạng thái:** thiết kế, **chưa code**. Đợt P14.1 chỉ hiện thực Kubernetes Game
(`phase-14-exec.md` §1 quyết định 4).

**`GameId`:** `'dockerfile'` (đã có sẵn trong `packages/games/src/core/types.ts`).

---

## 1. Vòng lặp chơi

Người chơi nhận một `Dockerfile` hỏng hoặc thiếu, sửa nó, và dựng. Mô phỏng trả về một
**chồng layer** kèm ba con số: kích thước image, thời gian dựng, và điểm an toàn.

```
sửa Dockerfile  →  dựng  →  đọc chồng layer + ba con số  →  sửa tiếp  →  dựng lại
```

Ba màn hình, cả ba đều là DOM thật:

1. **Trình soạn** bên trái: từng dòng là một `Instruction` có id riêng.
2. **Chồng layer** bên phải: mỗi dòng lệnh sinh ra một layer, kèm kích thước và trạng
   thái cache. Bấm vào một layer để xem **cái gì nằm trong nó**.
3. **Bảng ba con số** phía dưới, kèm danh sách phát hiện an toàn có trỏ về đúng dòng lệnh.

### Khác ba game kia ở đâu

Đây là game duy nhất **không có hệ thống nào đang chạy**. Không cluster, không đường ống,
không luồng mạng. Đối tượng nghiên cứu là một file và cái chồng byte bất biến mà nó sinh
ra. Không có trục thời gian trong trạng thái chơi: `buildTicks` là một *kết quả đo được*
của lần dựng, không phải một cái đồng hồ đang chạy trong lúc người chơi suy nghĩ.

Hệ quả kiến trúc dễ chịu: reducer của game này gần như là một hàm thuần
`DockerfileSpec → ImageView`. Không tick loop, không hàng đợi sự kiện.

---

## 2. Mô hình trạng thái

Đặt ở `packages/games/src/dockerfile/contract.ts`.

### 2.1 Dùng lại từ hợp đồng chung

`GameId` · `Difficulty` · `RunResult` · `GameSave` · `storageKey('dockerfile')` từ
`core/types.ts`, không sửa. Khoá lưu `dlp.games.v1.dockerfile`.

⚠ `RunLog` và `GameAction` nằm ở `k8s/contract.ts`, và `GameAction.kind` không có tên nào
cho "sửa một dòng Dockerfile" (gần nhất là `'edit'`, nhưng `payload` của nó là hợp đồng
của Kubernetes Game). Cùng vấn đề mà `pipeline.md` §2.2 và `netpol.md` §3.1 nêu: **báo lead**
trước khi hiện thực. Giống game netpol, game này có lối thoát riêng vì trạng thái cuối
(chính `DockerfileSpec`) đủ để chấm lại từ số không, không cần phát lại chuỗi hành động.

### 2.2 Hình dạng khai báo

```ts
export type InstructionKind =
  | 'FROM' | 'RUN' | 'COPY' | 'ADD' | 'WORKDIR' | 'ENV' | 'ARG'
  | 'USER' | 'EXPOSE' | 'CMD' | 'ENTRYPOINT' | 'HEALTHCHECK'
  | 'LABEL' | 'VOLUME';

export interface Instruction {
  /** Ổn định qua các lần sửa. Findings và layer trỏ về id này, không trỏ về số dòng. */
  readonly id: string;
  readonly kind: InstructionKind;
  /** Phần sau từ khoá, nguyên văn. Bộ mô phỏng tự phân tích. */
  readonly argv: string;
  /** Chỉ số stage (multi-stage). Mọi lệnh sau một `FROM` thuộc stage đó. */
  readonly stage: number;
}

export interface DockerfileSpec {
  readonly instructions: readonly Instruction[];
  /** File có trong build context. `.dockerignore` lọc trên tập này. */
  readonly context: readonly ContextFile[];
  readonly dockerignore: readonly string[];
}

export interface ContextFile {
  readonly path: string;
  readonly sizeBytes: number;
  /** true = file này KHÔNG được phép vào image ở bất kỳ layer nào. */
  readonly sensitive: boolean;
}
```

**Danh mục base image là dữ liệu, không phải code.** Đây là quyết định quan trọng nhất
của mô hình:

```ts
export interface BaseImageSpec {
  readonly ref: string;                   // 'python:3.12-slim'
  readonly sizeBytes: number;
  readonly libc: 'glibc' | 'musl' | 'khong-co';
  readonly packageManager: 'apt' | 'apk' | 'khong-co';
  readonly hasShell: boolean;
  readonly defaultUser: 'root' | string;
  /** Số phát hiện theo mức, KÈM ngày đo. Xem §7 về vì sao ngày đo là bắt buộc. */
  readonly findings: Readonly<Record<'thap' | 'trung-binh' | 'cao' | 'nghiem-trong', number>>;
  /** ISO date. Hiện trên giao diện cạnh mọi con số findings. */
  readonly measuredAt: string;
}
```

Danh mục này serialize được, dịch được, và sửa được mà không đụng vào engine. Đó là bài
học từ upstream: điều kiện achievement của họ là closure JavaScript nên không serialize
được, không lưu được, không dịch được ở tầng dữ liệu
(`2026-09-08-p14-k8sgames-upstream-study.md` §5.1). Không lặp lại hình dạng đó ở đây.

```ts
export interface DockerfileLevel {
  readonly id: string;                    // 'dockerfile-01-layer-dau-tien'
  readonly title: string;
  readonly brief: string;                 // markdown tiếng Việt, ≤ 400 từ
  readonly difficulty: Difficulty;
  readonly initial: DockerfileSpec;
  /** Lệnh người chơi được thêm ở level này. Cách kiểm soát nhịp dạy. */
  readonly allowedKinds: readonly InstructionKind[];
  /** Base image người chơi chọn được. Một phần tử = base đã cố định. */
  readonly allowedBases: readonly string[];
  readonly objectives: readonly Objective[];
  readonly hints: readonly string[];
  readonly parBytes: number;
  readonly parRebuildTicks: number;       // §5: đo lần dựng THỨ HAI
  /** Mức findings tối đa còn qua được. Bí mật và root là chặn cứng, không nằm ở đây. */
  readonly maxFindings: Readonly<Record<'cao' | 'nghiem-trong', number>>;
  readonly teaches: readonly string[];
}
```

### 2.3 Hình chiếu cho giao diện

```ts
export interface LayerView {
  readonly index: number;
  readonly instructionId: string;
  readonly sizeBytes: number;
  readonly cache: 'trung' | 'truot' | 'mat-hieu-luc';
  /** Khi cache = 'mat-hieu-luc': id của lệnh phía trên vừa đổi. Đây là cascade. */
  readonly invalidatedBy: string | null;
  /** File thêm vào ở layer này. Đây là chỗ bí mật bị kẹt hiện ra. */
  readonly adds: readonly { readonly path: string; readonly sizeBytes: number; readonly sensitive: boolean }[];
  /** File bị xoá ở layer này. Xoá KHÔNG giảm sizeBytes của layer dưới. */
  readonly removes: readonly string[];
  readonly statusToken: 'success' | 'destructive' | 'warning' | 'status-progress' | 'status-locked';
  readonly ariaLabel: string;
}

export interface ImageView {
  readonly totalBytes: number;
  readonly layerCount: number;
  /** Lần dựng đầu, cache lạnh. */
  readonly coldBuildTicks: number;
  /** Lần dựng lại sau khi sửa. Đây là con số dùng để chấm, xem §5. */
  readonly rebuildTicks: number;
  readonly runsAsRoot: boolean;
  readonly findings: readonly Finding[];
  /** Bí mật còn nằm trong một layer nào đó, dù layer sau đã xoá file. */
  readonly secretsInLayers: readonly { readonly instructionId: string; readonly path: string }[];
  readonly layers: readonly LayerView[];
}

export interface Finding {
  readonly id: string;
  readonly ruleId: string;                // 'khong-ghim-tag', 'chay-bang-root', ...
  readonly severity: 'thap' | 'trung-binh' | 'cao' | 'nghiem-trong';
  readonly instructionId: string | null;  // null = phát hiện thuộc về base image
  readonly message: string;               // tiếng Việt, nói CHUYỆN GÌ và LÀM GÌ TIẾP
}
```

Vị từ cho `Objective.check` nằm ở `dockerfile/predicate-names.ts`, gợi ý ban đầu:
`image-under-bytes` · `rebuild-under-ticks` · `no-secret-in-layers` · `not-running-as-root` ·
`base-image-is` · `stage-count-at-least` · `instruction-before` · `tag-pinned` ·
`digest-pinned` · `findings-at-most` · `dockerignore-excludes` · `layer-count-at-most` ·
`cache-hit-on`.

---

## 3. Cơ chế 1: bí mật kẹt trong layer

Đây là thứ hay nhất game này dạy được, và nó không có bản sao ở bất kỳ đâu trong bộ bốn.

```dockerfile
COPY .env /app/.env
RUN pip install -r requirements.txt
RUN rm /app/.env
```

Ba dòng này cho ra một image mà `ls /app` **không thấy `.env`**, và `.env` vẫn nằm nguyên
vẹn trong layer 2. Bất kỳ ai lấy được image đều đọc được nó bằng cách bóc từng layer.

Game hiển thị đúng chuyện đó: `LayerView.adds` của layer 2 mang `.env` với
`sensitive: true`, `LayerView.removes` của layer 4 mang `.env`, và `totalBytes` **không
giảm**. `ImageView.secretsInLayers` không rỗng, và đó là chặn cứng: level không qua được.

Level 6 dạy nửa trước (xoá file không làm image nhỏ đi, một bài về kích thước) và level 7
dạy nửa sau (cũng đúng cơ chế đó, nhưng hậu quả là an ninh chứ không phải dung lượng).
Tách làm hai vì đó là hai bài học, và bài thứ hai chỉ thấm khi bài thứ nhất đã dựng xong
mô hình layer trong đầu người học.

---

## 4. Cơ chế 2: cascade mất hiệu lực cache

Sửa dòng 4 thì mọi layer từ 4 trở xuống chuyển sang `'mat-hieu-luc'`, và giao diện tô mờ
chúng theo dây chuyền. Người chơi **nhìn thấy** vì sao thứ tự lệnh quyết định thời gian
dựng, thay vì được ai đó nói cho biết.

Bài học chính tắc, và là nội dung level 2:

```dockerfile
COPY . .                          # đổi một dòng code là mất cache từ đây
RUN npm install                   # ... nên cài lại toàn bộ, mọi lần
```

so với

```dockerfile
COPY package.json package-lock.json ./
RUN npm install                   # chỉ mất cache khi lockfile đổi
COPY . .
```

`LayerView.invalidatedBy` trỏ đúng vào lệnh gây ra chuyện đó, nên khi cascade xảy ra người
chơi biết **cái gì** làm mất cache, không phải chỉ biết là đã mất.

Level 4 dạy mặt trái, và mặt trái là điều làm game này không thành một trình lint có điểm:
gộp ba `RUN` thành một làm image nhỏ hơn **và** làm cache thô hơn, nên một lần sửa nhỏ
phải chạy lại cả ba lệnh. Hai luật đúng đang kéo ngược nhau, và người chơi phải chọn dựa
trên cái nào đổi thường xuyên hơn. Không có lời giải nào đúng ở mọi level.

---

## 5. Chấm điểm

`score` 0..1000 ở `dockerfile/scoring.ts`. Trọng số ba trục **do từng level đặt**, tổng
luôn bằng 1000, vì một level dạy multi-stage nên nặng về kích thước còn một level dạy
`USER` nên nặng về an toàn.

| Trục | Trọng số mặc định | Cách tính |
|---|---|---|
| Kích thước | 350 | `clamp(parBytes / totalBytes, 0, 1) × 350` |
| Thời gian dựng lại | 300 | `clamp(parRebuildTicks / rebuildTicks, 0, 1) × 300` |
| An toàn | 350 | `350 × (1 - findings có trọng số / trần của level)` |

**Chặn cứng, không trừ điểm** (level không qua được, bất kể ba trục trên):

- `secretsInLayers` không rỗng.
- `runsAsRoot === true` ở mọi level từ 12 trở đi.
- Bất kỳ finding `nghiem-trong` nào.

Vì sao tách chặn cứng khỏi trừ điểm: kích thước và thời gian dựng là **đánh đổi**, và một
đường cong điểm diễn tả đánh đổi rất tốt. Một bí mật nằm trong layer thì không phải đánh
đổi với cái gì cả. Cho nó thành 80 điểm trừ là dạy rằng nó mua được bằng cách làm tốt hơn
ở chỗ khác.

**Trục thời gian đo lần dựng THỨ HAI, không phải lần đầu.** Lần đầu cache lạnh nên mọi
Dockerfile đều chậm gần bằng nhau và trật tự lệnh không lộ ra. Toàn bộ giá trị của việc
sắp xếp lệnh chỉ hiện ra ở lần dựng lại. Đây cũng là thứ đúng với đời thật: một đường ống
CI dựng lại hàng chục lần mỗi ngày và dựng lạnh vài lần mỗi tháng.

⛔ Ngưỡng phái sinh từ `parBytes` và `parRebuildTicks` của chính level, không phải hằng số
toàn cục. Lý do và bằng chứng: `pipeline.md` §5.

---

## 6. Mười lăm level đầu

| # | Tiêu đề | Mục tiêu |
|---|---|---|
| 1 | Mỗi dòng một layer | Dựng một Dockerfile bốn dòng và đọc bảng layer: chỉ ra layer nào ứng với lệnh nào, và layer nào chiếm nhiều byte nhất. |
| 2 | Vì sao dựng lại vẫn lâu | `COPY . .` đang đứng trước `RUN npm install`. Đảo lại để `rebuildTicks` giảm, `totalBytes` không đổi. |
| 3 | Cascade | Sửa một dòng bất kỳ và dự đoán trước những layer nào sẽ mất hiệu lực; đối chiếu với `invalidatedBy` sau khi dựng. |
| 4 | Gộp lệnh và cái phải trả | Gộp ba `RUN` thành một để giảm layer và byte, rồi đo `rebuildTicks` tăng bao nhiêu. Đạt cả hai mốc cùng lúc. |
| 5 | Trình quản lý gói để lại rác | Layer `apt-get` phình vì cache của apt. Dọn trong **cùng một** `RUN`, và giải thích vì sao dọn ở `RUN` sau thì vô ích. |
| 6 | Xoá không làm nhỏ đi | Một file 40 MB được `COPY` rồi `RUN rm`. `totalBytes` không đổi. Sửa để nó không bao giờ vào image. |
| 7 | Bí mật còn nguyên | `COPY .env` rồi `RUN rm .env`. Tìm nó trong layer inspector, rồi sửa bằng build arg hoặc multi-stage. |
| 8 | Ba base, ba con số | Cùng một ứng dụng trên `python:3.12`, `python:3.12-slim`, `python:3.12-alpine`. Đọc ba `totalBytes` và ba bảng findings; chọn một và nêu lý do trong mục tiêu thưởng. |
| 9 | Multi-stage lần đầu | Biên dịch ở stage 1, chỉ `COPY --from=0` binary sang stage 2. `totalBytes` phải giảm ít nhất 70%. |
| 10 | Distroless và cái mất đi | Chuyển sang base không shell. Image nhỏ nhất bộ, và `RUN` không còn dùng được ở stage cuối; sắp lại cho phù hợp. |
| 11 | `latest` là một cái bẫy | Ghim tag thay cho `latest`, rồi ghim digest thay cho tag. Nêu điều digest bảo đảm mà tag không bảo đảm. |
| 12 | Đừng chạy bằng root | Thêm `USER`, tạo user không đặc quyền, và sửa quyền file cho khớp để ứng dụng vẫn ghi được vào thư mục dữ liệu. |
| 13 | `.dockerignore` | Build context đang mang `.git`, `node_modules`, và một file khoá. Loại chúng ra khỏi context, không phải ra khỏi image. |
| 14 | Bốn dòng metadata hay bị dùng sai | `ENTRYPOINT` với `CMD`, dạng exec với dạng shell, `EXPOSE` không mở cổng thật, `HEALTHCHECK` khi nào có ích. |
| 15 | Một Dockerfile hỏng toàn diện | Chín lỗi cùng lúc. Đạt đồng thời ngân sách kích thước, mốc `rebuildTicks`, và không còn finding mức `cao`. |

Level 1 đến 7 cố định base image (`allowedBases` một phần tử) để người chơi chỉ nghĩ về
thứ tự và nội dung lệnh. Base image mở ra từ level 8, multi-stage từ level 9.

---

## 7. Cái nó dạy được mà Kubernetes Game không dạy được

**Mô hình layer.** Image là một chồng diff bất biến có thứ tự, và một layer sau không xoá
được byte của layer trước. Từ mô hình đó suy ra bốn thứ mà người học thường phải học bằng
cách bị đau: xoá file không làm image nhỏ đi, bí mật ở giữa chồng không biến mất, thứ tự
lệnh quyết định thời gian dựng, và gộp lệnh đánh đổi kích thước lấy cache.

Kubernetes Game bắt đầu **sau khi image đã tồn tại**. Trong 32 mục của `IncidentKind` ở
`k8s/contract.ts`, image xuất hiện đúng ba lần và cả ba đều coi nó là một chuỗi mờ đục:
`image-tag-sai`, `image-registry-khong-toi-duoc`, `thieu-imagepullsecret`. Cluster không
có khái niệm layer, không có khái niệm cache dựng, không có khái niệm build context. Đây
không phải chuyện Kubernetes Game chưa dạy; là chuyện nó không có ngôn ngữ để dạy.

**An toàn của artifact, tách khỏi an toàn của runtime.** Mê cung mạng dạy an toàn của
đường đi. Game này dạy an toàn của **thứ đang chạy**: chạy bằng root hay không, có shell
để kẻ tấn công dùng hay không, có bí mật nướng sẵn bên trong hay không. Hai loại phòng thủ
độc lập nhau và cần cả hai; không game nào trong bộ thay được game kia ở vế này.

---

## 8. Chỗ ý tưởng này yếu, nói thẳng

**Mọi con số đều là hư cấu, và một nửa trong số đó sẽ hỏng theo thời gian.** Kích thước
base image, thời gian dựng, số findings đều đến từ một danh mục viết tay. Trong đó:

| Loại khẳng định | Ôi theo thời gian? |
|---|---|
| Cấu trúc: xoá không giảm byte, bí mật kẹt trong layer, cascade cache | Không. Đây là ngữ nghĩa của định dạng image. |
| So sánh tương đối: alpine nhỏ hơn slim nhỏ hơn bản đầy đủ | Rất chậm. Thứ tự này ổn định qua nhiều năm. |
| Con số tuyệt đối: `python:3.12-slim` nặng 130 MB, có 4 findings mức cao | **Có, trong vài tuần.** |

Ba biện pháp bắt buộc, không phải khuyến nghị: (1) `measuredAt` hiện trên giao diện ngay
cạnh mọi con số findings, và nhãn đọc là *"số đo ngày X"* chứ không phải *"hiện có"*;
(2) **không `Objective` nào được phụ thuộc vào một con số findings tuyệt đối** (chỉ phụ
thuộc vào so sánh tương đối và vào các sự thật cấu trúc ở hàng đầu bảng); (3) danh mục
base image nằm trong một file dữ liệu riêng để cập nhật nó không phải đọc engine.

Nếu bỏ qua ba điều này thì game sẽ dạy một sự thật cấu trúc đúng và một con số sai, **với
cùng một vẻ chắc chắn**, và người học không có cách nào phân biệt.

**Nguy cơ thành một trình lint có điểm.** Nếu mọi level chỉ hỏi "hãy áp luật mà công cụ
quét đã biết", game dạy tuân thủ luật chứ không dạy suy luận. Đối trọng phải là các level
mà **hai luật đúng kéo ngược nhau**: level 4 (gộp `RUN` giảm byte nhưng phá cache), level
8 (base nhỏ hơn nhưng dùng musl thay glibc, và có phần mềm hành xử khác trên musl), level
10 (distroless an toàn hơn nhưng mất shell nên mất luôn đường chẩn đoán tại chỗ). Ba level
đó là xương sống, không phải trang trí. Nếu bị cắt vì hết thời gian thì cái còn lại là một
trình lint.

**Bộ mô phỏng build phải khớp với thực tế mạng của sandbox nền tảng, hoặc nói rõ là không
khớp.** Sandbox của nền tảng không nối Internet; nó chỉ mở một cửa tới registry mirror của
Docker Hub, nên `FROM` chạy được còn `RUN apt-get install`, `RUN pip install`,
`RUN npm install` thì không (đây là nội dung `content/quizzes/dlp-quiz-docker-co-ban.json`).
Nếu `RUN apt-get install` trong game chạy trơn tru thì game và bài lab của cùng nền tảng
đang mô tả hai thế giới khác nhau, và người học sẽ tin cái nào phản hồi nhanh hơn. Hai
đường đi được, phải chọn một và ghi vào brief: **(a)** mô phỏng một máy có Internet đầy
đủ, và mọi level dùng `RUN` cài gói nói thẳng trong brief rằng sandbox của nền tảng không
làm được như vậy; hoặc **(b)** mô phỏng đúng cùng giới hạn mạng đó, và biến nó thành một
level (`apt-get update` thoát 0 dù không tải được gì, lỗi nổ muộn ở `apt-get install` phía
sau). Lựa chọn (b) dạy nhiều hơn và khớp với nền tảng; nó cũng đắt hơn và làm chín trong
mười lăm level phải viết lại. Đây là quyết định cho lead, không phải cho người hiện thực.

**Trình soạn văn bản là một rủi ro a11y nhẹ hơn ba game kia nhưng không bằng không.** Sửa
Dockerfile là gõ chữ vào một `<textarea>`, nên phần soạn thảo qua cổng axe dễ. Phần khó là
**chồng layer**: nó là một danh sách có quan hệ cha con (layer này mất hiệu lực vì layer
kia), và quan hệ đó phải đọc được bằng trình đọc màn hình chứ không chỉ nhìn được bằng độ
mờ của màu. `LayerView.ariaLabel` phải mang cả quan hệ, ví dụ *"layer 5, 12 MB, mất hiệu
lực vì dòng 4 đã đổi"*, không phải chỉ *"layer 5"*.
