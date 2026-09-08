# Mê cung mạng (`netpol`) — thiết kế

**Trạng thái:** thiết kế, **chưa code**. Đợt P14.1 chỉ hiện thực K8s Game
(`phase-14-exec.md` §1 quyết định 4).

**`GameId`:** `'netpol'` (đã có sẵn trong `packages/games/src/core/types.ts`).

---

## 1. Vòng lặp chơi

Level cho trước một cụm pod có label, một danh sách **luồng phải thông**, và một danh sách
**luồng phải chặn**. Người chơi viết NetworkPolicy sao cho tập được phép đúng bằng tập cần
phép. Không nhiều hơn, không ít hơn.

```
đọc yêu cầu  →  viết policy  →  bấm kiểm  →  đọc ma trận  →  sửa policy
```

Ma trận là màn hình chính. Mỗi ô là một bộ ba (nguồn, đích, cổng) và mang một trong bốn
trạng thái:

| Ô | Nghĩa |
|---|---|
| đúng-thông | luồng cần thông và đang thông |
| đúng-chặn | luồng cần chặn và đang bị chặn |
| **thiếu** | luồng cần thông nhưng đang bị chặn |
| **thừa** | luồng cần chặn nhưng đang thông |

Người chơi qua level khi ma trận không còn ô nào ở hai loại sau. Không có "gần đúng".

### Khác ba game kia ở đâu

Đây là game duy nhất chấm bằng một **phép so tập hợp chính xác**. K8s Game chấm sức khoẻ
của một hệ đang chạy: pod xanh là đủ. Lò rèn Image chấm ba con số có đánh đổi lẫn nhau.
Đường ống chấm một phân bố. Ở đây chỉ có đúng và sai, và điều đáng nói là **hai loại sai
không giống nhau chút nào**:

- Ô **thiếu** tự tố cáo nó. Ứng dụng gãy, người dùng phàn nàn, ai cũng thấy.
- Ô **thừa** không tạo ra triệu chứng gì cả. Không có gì đỏ. Hệ chạy hoàn hảo. Cách duy
  nhất để biết nó tồn tại là **liệt kê ra thứ đáng lẽ phải bị chặn và đi thử từng cái**.

Toàn bộ giá trị sư phạm của game nằm ở vế thứ hai, và §7 nói vì sao K8s Game không với tới
được nó.

---

## 2. Chồng lấn với K8s Game, và ranh giới

Nói trước vì nó là câu hỏi đầu tiên bất kỳ ai cũng hỏi.

`packages/games/src/k8s/predicate-names.ts` **đã có** `netpol-allows` và `netpol-denies`,
và `k8s/contract.ts` **đã có** `IncidentKind` là `networkpolicy-chan-nham` cùng
`dns-khong-phan-giai`. Vậy K8s Game đã chạm tới NetworkPolicy.

Nó chạm tới đúng một nửa:

| | K8s Game | Mê cung mạng |
|---|---|---|
| Chế độ hỏng dạy được | policy **chặn nhầm** một luồng hợp lệ (có triệu chứng) | policy **cho phép thừa** (không triệu chứng) |
| Phạm vi kiểm | vài luồng nêu tên trong `objectives` | toàn bộ ma trận (nguồn × đích × cổng) |
| Người chơi làm gì | tìm cái đang đỏ rồi mở đường cho nó | chứng minh không còn đường nào không được mở |
| Số policy trên màn hình | thường một | nhiều, và chúng cộng dồn lên nhau |

`networkpolicy-chan-nham` là một sự cố **có triệu chứng**, đúng như mọi `IncidentKind`
khác trong danh sách đó. Không mục nào trong 32 mục là *"một thứ đang chạy tốt nhưng
không nên chạy được"*, và không thể thêm vào, vì một game chẩn đoán không có cách nào
hiển thị sự vắng mặt của một triệu chứng.

Ranh giới thực thi: level của K8s Game giữ tối đa **một** NetworkPolicy và không bao giờ
chấm trên toàn ma trận. Mọi bài về ma trận thuộc về game này.

---

## 3. Mô hình trạng thái

Đặt ở `packages/games/src/netpol/contract.ts`.

### 3.1 Dùng lại từ hợp đồng chung

`GameId` · `Difficulty` · `RunResult` · `GameSave` · `storageKey('netpol')` từ
`core/types.ts`, không sửa. Khoá lưu `dlp.games.v1.netpol`.

⚠ `RunLog` và `GameAction` nằm ở `k8s/contract.ts` chứ không ở `core/`, và
`GameAction.kind` không có tên nào cho "viết một policy". Cùng vấn đề mà `pipeline.md`
§2.2 nêu: cơ chế xác minh của `phase-14-exec.md` §8.3 hiện chỉ áp cho K8s Game. **Báo
lead** trước khi hiện thực, đừng tự sửa file lead sở hữu.

Riêng game này có một lối thoát mà hai game kia không có: đáp án của nó là **một tập
policy**, và tập đó nhỏ, serialize được, và kiểm được lại từ số không. Nếu `RunLog` chưa
kịp mở rộng thì xác minh vẫn làm được bằng cách lưu chính tập policy cuối cùng rồi chạy
lại bộ đánh giá trên nó. Không cần phát lại chuỗi hành động vì ở đây **không có trục thời
gian**: kết quả chỉ phụ thuộc trạng thái cuối, không phụ thuộc đường đi tới đó.

### 3.2 Hình dạng khai báo

```ts
export interface PodSpec {
  readonly name: string;
  readonly namespace: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface PodRef {
  readonly namespace: string;
  readonly name: string;
}

/** Một luồng người ra đề tuyên bố. KHÔNG phải toàn bộ ma trận, xem §4. */
export interface Flow {
  readonly id: string;
  readonly from: PodRef | 'ngoai-cum';       // 'ngoai-cum' = nguồn ngoài cluster
  readonly to: PodRef | 'ngoai-cum';
  readonly port: number;
  readonly protocol: 'TCP' | 'UDP';
  readonly expect: 'thong' | 'chan';
  /** Tiếng Việt, giải thích vì sao. Hiện trong bảng yêu cầu, không phải gợi ý. */
  readonly why: string;
}

export interface LabelSelector {
  readonly matchLabels?: Readonly<Record<string, string>>;
  readonly matchExpressions?: readonly {
    readonly key: string;
    readonly operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';
    readonly values?: readonly string[];
  }[];
}

export interface NetPolSpec {
  readonly name: string;
  readonly namespace: string;
  /** `{}` rỗng = CHỌN MỌI POD trong namespace. Đây là ngữ nghĩa thật, xem §5. */
  readonly podSelector: LabelSelector;
  readonly policyTypes: readonly ('Ingress' | 'Egress')[];
  readonly ingress: readonly NetPolRule[];
  readonly egress: readonly NetPolRule[];
}

export interface NetPolRule {
  /** Mảng RỖNG và mảng VẮNG MẶT có nghĩa khác nhau. Xem §5. */
  readonly peers?: readonly NetPolPeer[];
  readonly ports?: readonly { readonly port: number; readonly protocol: 'TCP' | 'UDP' }[];
}

export type NetPolPeer =
  | { readonly kind: 'pod'; readonly podSelector: LabelSelector }
  | { readonly kind: 'namespace'; readonly namespaceSelector: LabelSelector }
  | { readonly kind: 'pod-in-namespace'; readonly podSelector: LabelSelector; readonly namespaceSelector: LabelSelector }
  | { readonly kind: 'ipBlock'; readonly cidr: string; readonly except?: readonly string[] };

export interface NetpolLevel {
  readonly id: string;                    // 'netpol-01-cum-thong-nhau'
  readonly title: string;
  readonly brief: string;                 // markdown tiếng Việt, ≤ 400 từ
  readonly difficulty: Difficulty;
  readonly pods: readonly PodSpec[];
  readonly namespaces: readonly { readonly name: string; readonly labels: Readonly<Record<string, string>> }[];
  /** Policy có sẵn. Rỗng = viết từ số không; có sẵn = level sửa chữa. */
  readonly initialPolicies: readonly NetPolSpec[];
  /** Luồng NÊU TÊN. Level 8 trở đi, đây KHÔNG phải toàn bộ phạm vi chấm. */
  readonly statedFlows: readonly Flow[];
  /** true = chấm trên toàn ma trận, không chỉ statedFlows. */
  readonly gradeFullMatrix: boolean;
  /** Cổng nào xuất hiện trong ma trận. Ma trận đầy đủ = pods × pods × ports. */
  readonly matrixPorts: readonly number[];
  /** Mặc định cho mọi cặp không nêu tên khi gradeFullMatrix = true. */
  readonly unstatedDefault: 'chan' | 'thong';
  readonly hints: readonly string[];
  /** Số luật "chuẩn". Dùng để chấm tính gọn, không phải để giới hạn. */
  readonly parRules: number;
  readonly teaches: readonly string[];
}
```

### 3.3 Hình chiếu cho giao diện

```ts
export interface MatrixView {
  readonly rows: readonly MatrixRowView[];
  readonly stated: { readonly ok: number; readonly total: number };
  readonly full: { readonly ok: number; readonly total: number };
  readonly rulesUsed: number;
  readonly policiesUsed: number;
}

export interface MatrixCellView {
  readonly from: string;
  readonly to: string;
  readonly port: number;
  readonly expected: 'thong' | 'chan';
  readonly actual: 'thong' | 'chan';
  readonly verdict: 'dung-thong' | 'dung-chan' | 'thieu' | 'thua';
  /** Tên các policy đã tham gia quyết định ô này. Rỗng = không policy nào chọn pod đích. */
  readonly decidedBy: readonly string[];
  readonly statusToken: 'success' | 'destructive' | 'warning' | 'status-progress' | 'status-locked';
  readonly ariaLabel: string;              // tiếng Việt, một câu đủ nghĩa khi đọc rời
}
```

`decidedBy` là thứ biến ma trận từ một bảng điểm thành một công cụ chẩn đoán. Bấm vào một
ô **thừa** và thấy policy nào đang mở nó, hoặc thấy `decidedBy` rỗng nghĩa là không policy
nào chọn pod đích nên mặc định cho phép còn nguyên.

Ma trận là một `<table>` DOM thật, không phải canvas. Game này **không cần Three.js**, và
đó là một điểm cộng chứ không phải một thiếu sót: nó đi qua cổng axe bằng cấu trúc bảng
sẵn có (`scope="col"`, `scope="row"`, caption), không phải bằng một lớp DOM song song
dựng thêm.

---

## 4. Cột thứ ba giấu mặt: luồng không được nêu tên

Đây là cơ chế trung tâm, và là lý do game tồn tại.

Level 1 đến 7 chấm trên `statedFlows`: đề nêu tám luồng, người chơi làm đúng tám luồng, qua
level. Level 8 bật `gradeFullMatrix: true` và mọi thứ đổi.

Với sáu pod và ba cổng, ma trận đầy đủ có `6 × 6 × 3 = 108` ô. Tám luồng nêu tên phủ 8 ô.
**Một trăm ô còn lại vẫn có câu trả lời đúng**, và `unstatedDefault: 'chan'` nói rằng câu
trả lời đó là "chặn". Một lời giải thoả mãn cả tám luồng nêu tên hoàn toàn có thể mở thêm
mười hai luồng không ai hỏi tới.

Level 8 cố ý dựng đúng cái bẫy đó: lời giải "hiển nhiên" (một policy `podSelector: {}` với
một rule ingress rộng) đạt 8/8 luồng nêu tên và **20/108 ô sai**. Màn hình chuyển từ *"bạn
đã xong"* sang *"bạn đã mở 12 cửa không ai yêu cầu"*, và đó là khoảnh khắc game dạy được
thứ nó sinh ra để dạy.

Cách này lặp lại chính xác bài học `rules/green-that-proves-nothing.md` của repo, chỉ là
đóng thành một cơ chế chơi: **một phép kiểm chỉ nhìn tập việc-phải-chạy thì không bao giờ
đỏ vì thứ nó đang bỏ sót.**

Ràng buộc thiết kế đi kèm: từ level 8, brief phải **nói trước** rằng chấm trên toàn ma
trận. Giấu luật chấm rồi bất ngờ đánh trượt là một trò đùa, không phải một bài học. Cái
bất ngờ nằm ở *độ lớn* của khoảng cách, không ở luật.

---

## 5. Bộ đánh giá phải đúng ngữ nghĩa Kubernetes

Rủi ro lớn nhất của game này là dạy sai. Một bộ đánh giá làm ẩu vẫn cho ra một ma trận
đầy màu sắc và người chơi vẫn có cảm giác đang học, trong khi mô hình họ dựng trong đầu
sai. Sáu luật phải đúng, mỗi luật kèm một test bắt đúng nó:

1. **Mặc định là cho phép.** Pod không được policy nào chọn thì thông mọi hướng. Policy
   không "chặn"; nó chuyển pod sang chế độ danh sách trắng.
2. **Chọn rồi thì mặc định đảo chiều.** Ngay khi một policy chọn pod và khai
   `policyTypes: ['Ingress']`, mọi ingress không nằm trong rule đều bị chặn. Egress vẫn
   nguyên vẹn cho tới khi có policy khai `Egress`.
3. **Nhiều policy CỘNG DỒN, không giao nhau.** Hai policy cùng chọn một pod thì tập được
   phép là **hợp** của hai tập rule. Không có thứ tự, không có ưu tiên, không có luật
   "deny". Đây là chỗ trực giác firewall làm người ta sai nhiều nhất, và là nội dung của
   level 13.
4. **Hai đầu phải cùng đồng ý.** Một gói đi từ A tới B cần egress của A cho phép **và**
   ingress của B cho phép. Mở một đầu là không đủ. Level 5 và 6 dạy đúng vế này.
5. **Mảng rỗng khác mảng vắng mặt.** `ingress: []` nghĩa là *không cho phép gì cả*;
   không có khoá `ingress` mà `policyTypes` vẫn liệt kê `Ingress` cũng vậy. Còn một rule
   với `peers` rỗng nghĩa là *cho phép từ mọi nơi*. Ba hình dạng gần giống nhau trên màn
   hình, ba nghĩa khác nhau.
6. **`podSelector: {}` chọn mọi pod trong namespace**, không phải không pod nào.

Luật 7 không thuộc về bộ đánh giá nhưng thuộc về nội dung: **DNS đi bằng UDP cổng 53 và
nó chết theo default-deny egress.** Đây là bẫy kinh điển nhất của NetworkPolicy trong đời
thật, và nó là toàn bộ nội dung level 4.

⚠ Nếu người hiện thực chỉ làm được một phần trong sáu luật trên thì **đừng phát hành game
với phần còn lại làm gần đúng**. Một mô phỏng sai về luật 3 dạy người học rằng
NetworkPolicy có thứ tự ưu tiên, và họ sẽ mang niềm tin đó vào một cụm thật. Không dạy còn
tốt hơn.

---

## 6. Chấm điểm

`score` 0..1000 ở `netpol/scoring.ts`. Game này **không tính giờ**, có chủ ý.

| Trục | Trọng số | Cách tính |
|---|---|---|
| Đúng | 700 | Chỉ có 0 hoặc 700. Một ô sai là 0. |
| Gọn | 200 | `clamp(parRules / rulesUsed, 0, 1) × 200` |
| Ít policy | 100 | `clamp(parPolicies / policiesUsed, 0, 1) × 100` |

Vì sao trục "đúng" không cho điểm từng phần: 95% ma trận đúng nghĩa là năm ô đang mở sai,
và một chính sách mạng đúng 95% không phải là một chính sách mạng gần đúng. Điểm từng phần
sẽ dạy rằng nó gần đúng.

Vì sao không tính giờ: đây là bài toán suy luận, không phải bài kiểm tra phản xạ. Đồng hồ
đẩy người chơi sang thử-và-sai, mà thử-và-sai chính là thói quen game này muốn thay thế.
`RunResult.startedAt` và `finishedAt` vẫn được ghi (hợp đồng chung bắt buộc) nhưng
`scoring.ts` không đọc chúng.

Hai trục "gọn" tồn tại vì trong đời thật, một tập chính sách đúng nhưng có ba mươi luật
chồng chéo là một tập chính sách sẽ hỏng ở lần sửa tiếp theo. Level 14 lấy đúng vế đó làm
mục tiêu duy nhất.

---

## 7. Mười lăm level đầu

| # | Tiêu đề | Mục tiêu |
|---|---|---|
| 1 | Cụm chưa có luật nào | Đọc ma trận mặc định và trả lời: mọi cặp pod đều thông. Không viết policy nào; mục tiêu là hiểu điểm xuất phát. |
| 2 | Chọn đúng pod | Viết một policy có `podSelector` khớp đúng `db`, không khớp `web` và `api`. Kiểm bằng cột `decidedBy`. |
| 3 | Đóng cửa một namespace | Áp default-deny ingress cho namespace `noi-bo`, rồi liệt kê những luồng vừa chết theo. |
| 4 | DNS chết theo | Sau default-deny egress, phân giải tên gãy. Mở đúng UDP 53 tới `kube-dns`, không mở gì khác. |
| 5 | Mở một đầu là chưa đủ | Ingress của `db` đã cho phép `api`, luồng vẫn không thông. Tìm ra egress của `api` đang chặn. |
| 6 | Hai đầu cùng đồng ý | Ba cặp pod, mỗi cặp thiếu một đầu khác nhau. Sửa đúng đầu đang thiếu ở từng cặp. |
| 7 | Cùng pod, khác cổng | `api` được gọi ở 8080 nhưng không được gọi ở 9090 (cổng debug). Một cặp pod, hai kết quả. |
| 8 | Ma trận đầy đủ lần đầu | `gradeFullMatrix` bật. Lời giải đạt 8/8 luồng nêu tên vẫn mở 12 luồng không ai hỏi. Đóng chúng lại. |
| 9 | Cho phép theo namespace | Cho phép mọi thứ từ namespace `giam-sat`, không cho phép từ pod cụ thể nào ngoài đó. |
| 10 | Cửa ra Internet | Egress ra một dải `ipBlock` cụ thể, chặn phần còn lại, và `except` một dải con bên trong nó. |
| 11 | Ba tầng | `web → api → db`. `db` nhận từ `api`, không nhận từ `web`, kể cả khi `web` biết địa chỉ của nó. |
| 12 | Label trùng ngoài ý muốn | Hai pod cùng mang `app=api` nhưng chỉ một được phép gọi `db`. Tìm một selector phân biệt được chúng. |
| 13 | Hai policy cộng dồn | Hai policy cùng chọn `db`, và người chơi tưởng cái thứ hai thu hẹp cái thứ nhất. Nó mở rộng. Đọc `decidedBy` để thấy. |
| 14 | Bớt một luật | Ma trận đã đúng với 11 luật. Đạt cùng ma trận đó với `parRules = 6`, không được đổi một ô nào. |
| 15 | Sửa một cụm đang chạy sai | Cho trước 4 policy của một hệ thật, không nói chỗ nào sai. Tìm luồng đang lọt, bịt nó, không làm gãy luồng nào đang hoạt động. |

Level 1 đến 7 dùng `matrixPorts` chỉ một hoặc hai cổng để ma trận còn đọc được bằng mắt.
Từ level 8 ma trận mới đủ lớn để lời giải cẩu thả không còn kiểm được bằng mắt, và đó là
chủ ý.

---

## 8. Cái nó dạy được mà K8s Game không dạy được

**Một chế độ hỏng không có triệu chứng.** Đây là điểm mạnh thật, và nó mang tính cấu trúc
chứ không phải mức độ. Toàn bộ vòng lặp của K8s Game là *tìm cái đang đỏ*: mọi mục trong
`IncidentKind` là một triệu chứng quan sát được, mọi vị từ trong `predicate-names.ts` hỏi
"cái này có đang hoạt động không". Một cửa mở sai không đỏ ở đâu cả, không làm pod nào
`CrashLoopBackOff`, không làm `service-has-endpoints` trả `false`. Nó chỉ nhìn thấy được
khi ai đó viết ra danh sách những thứ **đáng lẽ không được phép** rồi đi thử từng cái.
Thói quen đó là toàn bộ nội dung của an ninh vận hành, và một game chẩn đoán không có
đường nào chạm tới nó.

**Ngữ nghĩa cộng dồn của danh sách trắng.** Người học mang trực giác từ firewall: có thứ
tự luật, có luật deny, luật sau ghi đè luật trước. NetworkPolicy không có thứ nào trong ba
thứ đó. Một game chấm trên toàn ma trận phạt trực giác sai đó ngay tại ô đầu tiên, mỗi
lần, không thương lượng. K8s Game với một policy trên màn hình không bao giờ tạo được tình
huống hai policy cộng dồn, nên nó không thể phát hiện được rằng người chơi đang hiểu sai.

**Chứng minh sự vắng mặt.** Ma trận đầy đủ dạy một tư duy hiếm: câu *"tôi đã kiểm và không
có gì lọt"* chỉ có nghĩa khi kèm theo *"tôi đã kiểm những cái này"*. Đó cũng là quy tắc
`rules/negative-result-scope.md` của chính repo này, và ở đây nó thành một ô đếm được:
`full.ok / full.total`.

---

## 9. Chỗ ý tưởng này yếu, nói thẳng

**Nó là ý tưởng mạnh nhất về sư phạm và yếu nhất về tính chơi được.** Nói thẳng: đây là
một bài toán thoả ràng buộc với một trình soạn YAML và một bảng chân trị. Không có chuyển
động, không có đồng hồ, không có câu chuyện. Vòng phần thưởng duy nhất là ma trận chuyển
xanh. Nếu game này được dựng và không ai chơi quá level 5, tài liệu này đã nói trước lý do.

Hệ quả thực tế cần cân nhắc **trước khi viết dòng code đầu tiên**: có thể thứ này đúng ra
là một **bài lab có chấm tự động** trong trụ cột ①, không phải một game trong trụ cột ③.
Nền tảng đã có sandbox chạy Kubernetes thật và đã có cơ chế `verifyScript`. Một bài lab
"viết NetworkPolicy đạt ma trận này" chạy trên cụm thật dạy đúng cùng một thứ, với
NetworkPolicy thật thay vì mô phỏng, và không cần bộ đánh giá sáu luật ở §5. Cái nó mất là
ràng buộc kiến trúc của trụ cột ③ (0 lời gọi backend, không tốn sandbox) và tốc độ phản
hồi: một vòng sửa-kiểm trên cụm thật mất vài giây thay vì tức thì. **Đây là một quyết định
thật đang mở, không phải một băn khoăn tu từ.** Người hiện thực nên hỏi lead trước.

**Mười lăm màn hình giống hệt nhau.** Level 2 đến 7 khác nhau về nội dung nhưng giống hệt
nhau về hình thức: cùng bảng, cùng trình soạn, cùng thao tác. Thiết kế này dồn toàn bộ sức
nặng lên ba chỗ: level 4 (DNS chết, gây bất ngờ), level 8 (ma trận đầy đủ, đảo ngược cảm
giác đã-xong), và level 13 đến 15 (chuyển từ viết mới sang sửa chữa). Nếu ba chỗ đó không
đủ mạnh thì phần còn lại là một hướng dẫn có bảng điểm.

**Bộ đánh giá là rủi ro hiện thực lớn nhất trong cả bốn game.** Sáu luật ở §5 nghe đơn
giản và không đơn giản: sự khác nhau giữa mảng rỗng và mảng vắng mặt, `policyTypes` suy
diễn khi vắng, `podSelector: {}`, và tổ hợp `namespaceSelector` với `podSelector` trong
cùng một peer (là AND) so với trong hai peer khác nhau (là OR). Sai một luật thì game vẫn
chạy, vẫn tô màu, vẫn cho điểm, và vẫn dạy sai. Bắt buộc: mỗi luật trong sáu luật có test
riêng khẳng định **cả hai chiều**, và một bộ đối chứng lấy từ tài liệu chính thức của
Kubernetes chứ không từ trí nhớ người viết.

**Không có `ipBlock` trong cụm thật của nền tảng.** Level 10 dạy `ipBlock` và `except`,
nhưng cụm học tập của dự án chặn Internet và chỉ mở một cửa tới registry mirror. Người học
sẽ không kiểm chứng được bài này ở sandbox. Hoặc bỏ level 10, hoặc brief của nó nói rõ đây
là kiến thức cho cụm production chứ không phải cho sandbox của nền tảng. Đừng để hai thế
giới mâu thuẫn nhau mà không ai nói gì.
