# P14 — Nghiên cứu upstream `rohitg00/k8sgames`: trích xuất design intelligence

**Ngày:** 2026-09-08 · **Đối tượng:** `github.com/rohitg00/k8sgames` · **Commit chốt:** `af5dbc19b3a41dcb42822572dd766bdf225a1860` (nhánh `main`) · **Mục tiêu:** lấy *tri thức thiết kế*, không lấy code.

Chúng ta đang dựng một game Kubernetes **thiết kế lại hoàn toàn** cho nền tảng học DevOps tiếng Việt. Báo cáo này trả lời: cái gì trong upstream là tri thức miền đáng học, cái gì là quyết định kỹ thuật của riêng họ, và ràng buộc pháp lý thật sự là gì.

---

## 0. Cách lấy dữ liệu, và giới hạn của nó

| Việc | Cách làm |
|---|---|
| Đọc repo | GitHub API (`/git/trees/main?recursive=1`) + `raw.githubusercontent.com`, tải về **thư mục scratchpad ngoài repo** |
| Clone vào working tree | **KHÔNG** — đúng ràng buộc read-only |
| Copy source code vào repo ta | **KHÔNG** — trừ hai trích đoạn *dữ liệu level* ở §3, trích để học **hình dạng schema**, có ghi nguồn, và **không được dán vào codebase** |
| Kiểm URL | 13/13 URL trích dẫn trả `200` (kiểm bằng `curl -sIL -w %{http_code}`, 2026-09-08) |

Repo tại thời điểm đọc: **41 file**, 2.005.965 byte, trong đó **1.165.858 byte là 2 file ảnh PNG** (`screenshot.png` 900KB + `og-image.png` 265KB). Phần code thực chỉ ~840KB. Không có build step, không lockfile, không `package.json`.

> ⚠ **README của upstream nói sai số ở hai chỗ**, đã đối chiếu trực tiếp với file dữ liệu. README ghi "29 incidents" nhưng `IncidentDefs.js` chứa **34** định nghĩa; README ghi "40 achievements" nhưng `Achievements.js` chứa **45**. Cả hai đều đếm bằng script parse trực tiếp, và tổng theo category khớp lại đúng (34 = 8+4+6+3+7+6; 45 = 10+10+10+15). Nêu ra vì mọi con số trong đề bài giao việc đều lấy từ README, nên **đừng dùng README làm SSOT** khi đối chiếu.
>
> README cũng ghi "~50K lines across 90+ files" — repo thật có **41 file**. Con số marketing, không phải con số đo.

---

## 1. License — đã xác minh, không suy đoán

### 1.1 Cái gì thật sự nằm trong file

Tải `raw.githubusercontent.com/rohitg00/k8sgames/main/LICENSE` (200 OK): **Apache License, Version 2.0, January 2004**, bản boilerplate chuẩn, 190 dòng. Dòng bản quyền nằm ở **dòng 178**, trong phần APPENDIX đã điền:

```
   Copyright 2026 Rohit Ghumare

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
```

GitHub API cũng phân loại `spdx_id = Apache-2.0`. Hai nguồn khớp.

**Không có file `NOTICE` trong repo.** Đã kiểm bằng cách quét toàn bộ cây 41 file: không path nào chứa chuỗi `notice` (không phân biệt hoa thường). Đây là dữ kiện quyết định — xem §1.3.

### 1.2 Điều khoản ràng buộc, trích nguyên văn

Nghĩa vụ nằm ở **Section 4 (Redistribution)**, và nó chỉ kích hoạt khi ta *"reproduce and distribute copies of the Work or Derivative Works thereof"*:

```
   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file [...]
```

Và định nghĩa "Derivative Works" ở Section 1 có một mệnh đề đáng chú ý, nguyên văn:

```
      "Derivative Works" shall mean any work [...] that is based on (or
      derived from) the Work and for which the editorial revisions,
      annotations, elaborations, or other modifications represent, as a
      whole, an original work of authorship.
```

### 1.3 Ta nợ gì — phân biệt BẮT BUỘC với LỊCH SỰ

Đây là phần đề bài hỏi thẳng, nên trả lời thẳng. Ba tình huống, ba mức nghĩa vụ khác nhau:

| Tình huống | Nghĩa vụ pháp lý |
|---|---|
| **A. Chỉ lấy ý tưởng, cơ chế, tri thức miền — tự viết 100% code** | **Không có nghĩa vụ nào theo Apache-2.0.** Section 4 chỉ ràng buộc khi phân phối "the Work or Derivative Works thereof". Code ta tự viết không phải Derivative Work của code họ. Thêm nữa, **ý tưởng, cơ chế game, và sự kiện thực tế không được bảo hộ bản quyền** — "CrashLoopBackOff do sai image tag, sửa bằng cách sửa tag" là **sự thật kỹ thuật về Kubernetes**, không phải sáng tạo của Rohit Ghumare. Danh mục 34 incident ở §4 nằm gần trọn trong nhóm này. |
| **B. Copy/port/dịch bất kỳ file code nào (kể cả sửa nhiều)** | Kích hoạt đủ 4(a)(b)(c): kèm bản copy license, ghi rõ file nào đã sửa, giữ nguyên mọi copyright notice. **4(d) KHÔNG kích hoạt** vì upstream không có NOTICE file. |
| **C. Copy nguyên văn dữ liệu level / mô tả bài học** | Vùng xám và là vùng rủi ro thật. Cấu trúc schema (tên field) thì không bảo hộ; **văn xuôi trong `description` và `hints` thì có** — đó là prose sáng tạo. Ta viết lại bằng tiếng Việt nên né được, nhưng phải *viết lại thật*, không dịch máy từng câu. |

**Chốt cho dự án:** ta ở **tình huống A**. Không cần NOTICE, không cần nhúng license Apache, không cần "state changes notice".

**Nhưng vẫn nên ghi công** — đây là lịch sự, không phải nghĩa vụ, và có ba lý do thực dụng: (1) đây là NCKH, minh bạch nguồn cảm hứng là chuẩn học thuật; (2) nếu sau này có tranh cãi "sao giống thế", một dòng ghi công có sẵn tốt hơn một lời giải thích muộn; (3) rẻ. Đề xuất đúng một dòng trong `README.md` hoặc trang About:

> *Lấy cảm hứng từ [k8sgames](https://github.com/rohitg00/k8sgames) (Apache-2.0, © 2026 Rohit Ghumare). Toàn bộ code, dữ liệu bài học và mô phỏng của dự án này được viết mới.*

**Một cảnh báo về trademark.** Section 6 không cấp quyền dùng tên thương mại. Tránh đặt tên sản phẩm gần "K8s Games" / "k8sgames" — không phải vì Apache-2.0 mà vì luật nhãn hiệu là một trục độc lập.

---

## 2. Kiểm kê game mode

Bốn mode chơi + một công cụ vẽ. Số liệu dưới đây đọc từ `js/modes/*.js` và `js/engine/ScoringEngine.js`, không lấy từ README.

### 2.1 Campaign — 20 level, 5 chapter

- **Người chơi làm gì:** đọc mô tả khái niệm → dùng palette bên trái hoặc gõ `kubectl` ở command bar (phím `/`) để tạo resource → hoàn thành danh sách objective. Từ level 4 trở đi có incident bơm vào theo lịch.
- **Điều kiện thắng:** **mọi** objective trong mảng `objectives` đúng. Không có điều kiện thua — level không fail, chỉ chậm.
- **Chấm điểm:** 1–3 sao, so với `starCriteria = { time, efficiency, noFailures }`:
  - 1 sao = hoàn thành, bất kể thế nào (mặc định)
  - 2 sao = `time` đạt **và** `efficiency` đạt
  - 3 sao = 2 sao **và** không có failure (nếu level bật `noFailures`)
- **XP:** `baseXP = 100 + levelId × 25`, cộng `starBonus = stars × 50`.
- **Độ dài phiên:** đọc từ ngân sách `starCriteria.time` — từ **120 giây** (level 1) leo lên **900 giây** (level 20). Trung vị 300s. Một chapter (4 level) ≈ 15–25 phút.

### 2.2 Chaos — sinh tồn vô hạn

Đây là mode có cơ chế thú vị nhất, và cũng là mode ta nên học kỹ nhất.

- **Cluster khởi đầu cố định:** 3 node (8 CPU/16Gi), 3 Deployment (`web-frontend` ×2, `api-backend` ×2, `worker` ×1), 2 Service.
- **Thanh máu:** `clusterHealth` bắt đầu 100. Mỗi giây tính lại:

  ```
  penalty  = Σ(incident.severity × 2 × (1 + tuổi_incident_phút × 0.5)) + healthDecayRate
  health  -= penalty/60 ;  health += regen/60   (regen = 0.5 nếu đã fix ≥1 incident)
  ```

  Điểm thiết kế đáng lấy: **hệ số `timeFactor` tăng theo tuổi của incident**. Một incident bỏ mặc gây sát thương *tăng dần*, nên game ép người chơi **triage theo tuổi**, không chỉ theo severity. Đó chính là hành vi SRE thật.
- **Đường cong khó:** `difficultyLevel = min(10, 1 + floor(phút/2))` — lên 1 bậc mỗi 2 phút, trần ở phút 18. `chaosBudget = 1 + phút × 0.5` (tăng tuyến tính vô hạn). `healthDecayRate = difficultyLevel × 0.1` — nghĩa là **từ phút 18 trở đi luôn có sát thương nền 1.0/giây kể cả khi cluster sạch bong**. Vậy mode này **được thiết kế để cuối cùng phải thua**, đúng nghĩa survival.
- **Điều kiện thua:** `clusterHealth <= 0`.
- **Điều kiện thắng:** không có.
- **Combo:** fix nhiều incident liên tiếp nhân XP (`incidentEngine.comboCount`); fix xong hồi máu `min(10, severity × 2)`.
- **Độ dài phiên:** không chốt cứng. Mốc achievement cho biết kỳ vọng của tác giả: **600 giây** = "Chaos Survivor", **1800 giây** = "Chaos Master". Vậy 10–30 phút.

### 2.3 Sandbox — xây tự do, chấm kiến trúc

- **Người chơi làm gì:** 3 node rỗng (16 CPU/32Gi), mở khoá cả **26 resource type**, xây gì tuỳ ý.
- **Thắng/thua:** **không có cả hai.** Đây là công cụ, không phải game.
- **Chấm điểm:** "Architecture Advisor" chấm 0–100, **tự chạy lại mỗi 10 giây**. Điểm tổng là **trung bình cộng không trọng số của 10 hạng mục**: `highAvailability`, `security`, `scalability`, `costEfficiency`, `reliability`, `networking`, `storage`, `configuration`, `observability`, `organization`. Mỗi hạng mục trả về `{score, recommendations[]}` — tức là **kèm lời khuyên cụ thể**, không chỉ con số. Đây là thứ đáng lấy nhất trong mode này.
- **Độ dài phiên:** mở.

### 2.4 Challenges — 10 kịch bản bấm giờ

| # | Tên | timeLimit |
|---|---|---|
| 1 | Three-Tier Web App | 300s |
| 2 | Fix CrashLoopBackOff | 180s |
| 3 | Ingress with TLS | 240s |
| 4 | Network Segmentation | 300s |
| 5 | Black Friday Scaling | 180s |
| 6 | Node Failure Recovery | 240s |
| 7 | StatefulSet with PVC | 300s |
| 8 | RBAC Fortress | 300s |
| 9 | DNS Resolution Failure | 180s |
| 10 | Full Production Readiness | 600s |

- **Thắng:** đạt 100% objective trước khi hết `timeLimit`. **Thua:** hết giờ.
- **XP:** `floor(completionPercentage × 2) + stars × 75` — chú ý XP trả **theo phần trăm hoàn thành**, nên thua vẫn có điểm.

> 🔴 **Một lỗi thiết kế thật trong upstream, đáng để ta không lặp lại.** Ngưỡng sao của challenge là **hằng số toàn cục**, không hề đọc `timeLimit` của chính challenge đó:
>
> ```js
> if (completionPercentage >= 100) stars = 1;
> if (completionPercentage >= 100 && completionTime <= 180) stars = 2;
> if (completionPercentage >= 100 && completionTime <= 120) stars = 3;
> ```
>
> Hệ quả đo được: challenge #10 có ngân sách **600 giây** nhưng muốn 3 sao vẫn phải xong trong **120 giây** — tức là phải nhanh gấp 5 lần ngân sách được cấp. Challenge #2 và #9 (`timeLimit` 180s) thì **không bao giờ đạt nổi 2 sao đúng nghĩa**, vì mốc 2 sao trùng đúng bằng deadline. Bài học: **ngưỡng chấm phải phái sinh từ ngân sách của từng bài**, không hardcode. Campaign làm đúng điều này (`starCriteria.time` theo từng level); Challenge thì không — hai hệ chấm trong cùng một codebase không nhất quán.

### 2.5 K8s Draw (`/draw`) — không phải game

Whiteboard 3D vẽ kiến trúc: kéo thả 21 resource type, nối đường, auto-layout theo tier, export YAML/PNG, chia sẻ qua URL. **Không có game logic, không incident, không scoring.** Về bản chất là một sản phẩm thứ hai dùng chung renderer.

---

## 3. Thiết kế level — schema và ví dụ

### 3.1 Hình dạng dữ liệu

20 level nằm trong một mảng phẳng `CAMPAIGN_LEVELS` ở `js/data/CampaignLevels.js` (38KB). Quét toàn bộ 20 phần tử cho ra đúng **13 field**, không level nào lệch:

| Field | Kiểu | Vai trò |
|---|---|---|
| `id` | int | khoá, 1–20 |
| `title` | string | tên hiển thị |
| `chapter` / `chapterName` | int / string | **lặp dữ liệu** — chapter suy ra được từ `id`, xem §3.4(b) |
| `description` | string dài | bài giảng khái niệm, 3–5 câu, đọc trước khi chơi |
| `objectives[]` | array | **success predicate** — mỗi phần tử `{type, ...tham số, label}` |
| `startingResources[]` | array | trạng thái cluster ban đầu `{kind, name, spec}` |
| `availableResources[]` | string[] | palette được phép dùng ở level này (giới hạn phạm vi) |
| `incidents[]` | array | lịch bơm sự cố `{type, triggerTime, target, severity}` |
| `hints[]` | string[] | 2–3 gợi ý, thường kèm lệnh `kubectl` cụ thể |
| `starCriteria` | object | `{time, efficiency, noFailures}` |
| `nextLevel` | int/null | liên kết tuyến tính |
| `tutorial` | object/null | `{steps: [{target, text}]}` — chỉ level 1 và 2 có |

### 3.2 Hai ví dụ nguyên văn

> Trích từ `js/data/CampaignLevels.js`, © 2026 Rohit Ghumare, Apache-2.0. Trích ở đây **chỉ để đọc hình dạng schema**. Không dán đoạn này vào codebase của dự án.

Level 1 — đơn giản nhất, không incident, có tutorial:

```js
{
  id: 1,
  title: 'Your First Pod',
  chapter: 1,
  chapterName: 'Foundations',
  description: 'A Pod is the smallest deployable unit in Kubernetes. It wraps one or more containers that share a network namespace and storage volumes. [...]',
  objectives: [
    { type: 'deploy', kind: 'Pod', count: 1, label: 'Deploy a Pod (the atomic unit of K8s)' },
    { type: 'deploy', kind: 'Namespace', count: 1, label: 'Create a Namespace to isolate resources' }
  ],
  startingResources: [
    { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
  ],
  availableResources: ['Pod', 'Namespace'],
  incidents: [],
  hints: [
    'Type "kubectl run my-pod --image=nginx" — this creates a Pod running the nginx container image',
    'Type "kubectl create namespace staging" — Namespaces are virtual clusters inside your physical cluster',
    'Click a Pod to inspect it: see its phase (Pending -> ContainerCreating -> Running), IP, and conditions'
  ],
  starCriteria: { time: 120, efficiency: 0.8, noFailures: true },
  nextLevel: 2,
  tutorial: {
    steps: [
      { target: 'command-bar', text: 'Press / to open the kubectl command bar. Type "kubectl run web --image=nginx" to create a Pod.' },
      { target: 'cluster-view', text: 'Your Pod transitions through phases: Pending (waiting for a node) -> ContainerCreating (pulling image) -> Running. Watch it happen.' },
      { target: 'inspector', text: 'Click the Pod to open the Inspector. The "Describe" tab shows the same output as "kubectl describe pod".' }
    ]
  }
}
```

Level 8 — có incident theo lịch, objective là *hành động* chứ không phải *đếm*:

```js
{
  id: 8,
  title: 'Rolling Updates & Rollbacks',
  chapter: 2,
  chapterName: 'Workloads',
  objectives: [
    { type: 'update',   /* ... */ },
    { type: 'rollback', /* ... */ },
    { type: 'uptime',   /* ... */ }
  ],
  availableResources: ['Pod', 'Deployment', 'ReplicaSet'],
  incidents: [
    { type: 'ImagePullBackOff', triggerTime: 20, target: 'api-server', severity: 3 }
  ],
  starCriteria: { time: 240, efficiency: 0.8, noFailures: false }
}
```

### 3.3 Bảng 20 level

| # | Ch | Chapter | Tên | Objective types | Incident bơm vào | star.time |
|---|---|---|---|---|---|---|
| 1 | 1 | Foundations | Your First Pod | deploy ×2 | — | 120 |
| 2 | 1 | Foundations | Deployments & ReplicaSets | deploy, scale | — | 180 |
| 3 | 1 | Foundations | Scheduling & Multi-Node | deploy ×2, distribute | — | 240 |
| 4 | 1 | Foundations | CrashLoopBackOff | resolve, uptime | CrashLoopBackOff @10s | 180 |
| 5 | 2 | Workloads | Self-Healing & Pod Eviction | deploy, replicas, resolve | PodEviction @30s, @60s | 300 |
| 6 | 2 | Workloads | DaemonSets | deploy ×2, coverage | — | 240 |
| 7 | 2 | Workloads | Jobs & CronJobs | deploy, complete, deploy | JobDeadlineExceeded @45s | 300 |
| 8 | 2 | Workloads | Rolling Updates & Rollbacks | update, rollback, uptime | ImagePullBackOff @20s | 240 |
| 9 | 3 | Networking | Services & Discovery | deploy, connect, serviceType | — | 300 |
| 10 | 3 | Networking | Ingress: L7 Routing | deploy, route, tls | — | 360 |
| 11 | 3 | Networking | NetworkPolicies: Zero Trust | deploy, isolate, allow | UnauthorizedAccess @30s | 360 |
| 12 | 3 | Networking | DNS Debugging | resolve, verify, deploy | DNSResolutionFailure @5s | 300 |
| 13 | 4 | State & Config | ConfigMap Essentials | deploy, mount, envFrom | — | 240 |
| 14 | 4 | State & Config | Secret Operations | deploy, mount, noConfigMap | SecretExposed @15s | 300 |
| 15 | 4 | State & Config | Persistent Storage | deploy ×2, bound | — | 300 |
| 16 | 4 | State & Config | StatefulSet Database | deploy, scale, headless, stable | PodStuckTerminating @60s | 360 |
| 17 | 5 | Production | Production Readiness | resources, probes, hpa, resolve | OOMKilled @20s, ReadinessProbeFailure @45s | 420 |
| 18 | 5 | Production | RBAC Fortress | deploy ×3, leastPrivilege | UnauthorizedAccess @25s (sev 5) | 420 |
| 19 | 5 | Production | Multi-Node Outage | resolve, uptime, reschedule, pdb | NodeNotReady @10s, @15s (sev 5) | 480 |
| 20 | 5 | Production | Full Stack Production | deploy ×7, probes, architectureScore | CrashLoopBackOff @60s, NodeNotReady @120s | 900 |

### 3.4 Ba nhận xét về schema này

**(a) Success predicate không phải data — nó là 30 nhánh `switch`.** 20 level dùng **30 `type` objective khác nhau**: `allow`, `architectureScore`, `bound`, `complete`, `connect`, `coverage`, `deploy`, `distribute`, `envFrom`, `headless`, `hpa`, `isolate`, `leastPrivilege`, `mount`, `noConfigMap`, `pdb`, `probes`, `replicas`, `reschedule`, `resolve`, `resources`, `rollback`, `route`, `scale`, `serviceType`, `stable`, `tls`, `update`, `uptime`, `verify` (cộng `investigate` chỉ tồn tại trong `switch` mà không level nào dùng — **nhánh chết**).

Mỗi `type` là một `case` viết tay trong `CampaignMode.js`. Tỷ lệ **30 predicate cho 20 level** nghĩa là gần như *mỗi level đẻ ra một luật riêng* — schema chỉ có vẻ là data, thực chất là code trá hình. Thêm một level mới phần lớn sẽ phải sửa engine. Với ta, đây là bài học kiến trúc quan trọng nhất của §3: **predicate phải là một ngôn ngữ nhỏ, có thể tổ hợp** (kiểu `{kind, count, where: {...}}` + `and`/`or`), chứ không phải một từ vựng phình ra theo số bài.

**(b) `chapter` và `chapterName` là derived field.** Chapter suy ra được từ `id` — `ScoringEngine.js` chứng minh chính điều đó bằng một mảng hardcode `[[1,2,3,4],[5,6,7,8],...]` để đếm chapter đã xong. Vậy cùng một sự thật được lưu ở **ba** nơi: field `chapter` trong level, field `chapterName` trong level, và mảng nhóm trong scoring engine. Ba nơi thì sẽ có ngày lệch nhau. Theo `code-conventions.md` § "No Derived Fields", bên ta lưu `chapterId` một chỗ và tính phần còn lại lúc đọc.

**(c) `incidents[]` bơm theo `triggerTime` tuyệt đối, không theo trạng thái.** `{triggerTime: 20}` nghĩa là "giây thứ 20 kể từ lúc vào level", bất kể người chơi đã làm gì. Đơn giản, nhưng nó tạo ra tình huống vô lý: level 8 bơm `ImagePullBackOff` vào `api-server` ở giây 20 kể cả khi người chơi chưa kịp tạo Deployment nào. Bơm **theo điều kiện** (`when: deployment/api-server is Running`) đắt hơn chút nhưng bỏ được cả một lớp bug về thứ tự.

---

## 4. Danh mục incident — 34 loại

Đây là phần giá trị nhất, và cũng là phần **an toàn nhất về pháp lý**: nội dung dưới đây là sự thật kỹ thuật về Kubernetes, không phải sáng tạo được bảo hộ. Ta có thể dùng thoải mái, và **nên** dùng — nó là một bộ khung triage khá đầy đủ cho CKA.

Đọc từ `js/data/IncidentDefs.js`. Schema mỗi incident: `{id, name, category, severity, description, visualEffect, affectedResourceTypes[], investigationSteps[{command,hint}], resolutionActions[{action,label,difficulty}], kubectlCommands[], autoResolveTime}`.

**Phân bố:** Pod 8 · ControlPlane 7 · Network 6 · Workload 6 · Node 4 · Storage 3 = **34**.

**Thang severity** (từ `SEVERITY_LEVELS`), quyết định cả XP lẫn thời gian được phép:

| Level | Tên | XP | timeMultiplier |
|---|---|---|---|
| 1 | Low | 25 | 1.5 |
| 2 | Medium | 50 | 1.2 |
| 3 | High | 100 | 1.0 |
| 4 | Critical | 200 | 0.8 |
| 5 | Emergency | 350 | 0.6 |

> Không incident nào trong file dùng severity 1 — thang thực tế chỉ chạy 2–5.

**Trọng số bốc ngẫu nhiên theo category** (từ `INCIDENT_CATEGORIES`): Pod 0.30 · Node 0.20 · Network 0.20 · Storage 0.10 · ControlPlane 0.10 · Workload 0.10. Tổng = 1.00. Nghĩa là ở Chaos mode, 30% sự cố là chuyện của Pod — hợp lý, vì đó cũng là phân bố thật ở production.

`autoResolveTime` chỉ khác `null` ở **4/34** incident (ReadinessProbeFailure 60s, PodStuckTerminating 120s, WebhookTimeout 90s, WebhookAdmissionRejection 90s) — tức là chỉ 4 loại tự khỏi nếu bỏ mặc; 30 loại còn lại đứng đó mãi cho tới khi người chơi xử lý.

### 4.1 Nhóm Pod (8)

**1. CrashLoopBackOff** · sev 3 · `pulse-red`
- *Triệu chứng người chơi thấy:* pod nhấp nháy đỏ, restart count tăng dần, không bao giờ Ready.
- *Root cause thật:* container khởi động rồi chết ngay; kubelet restart lại theo backoff luỹ thừa. Ba nguyên nhân gốc phổ biến: image tag sai, entrypoint/command sai, hoặc bị OOM ngay lúc khởi động.
- *Điều tra:* `kubectl logs <pod> --previous` (log của lần chạy TRƯỚC — đây là mấu chốt, log hiện tại thường rỗng) → `kubectl describe pod <pod>` xem Events và restart count → `kubectl get events --field-selector involvedObject.name=<pod>`.
- *Khắc phục:* sửa image tag (d1) · sửa entrypoint command (d2) · tăng memory limit (d1).

**2. ImagePullBackOff** · sev 2 · `pulse-yellow`
- *Triệu chứng:* pod kẹt, không bao giờ vào ContainerCreating.
- *Root cause:* kubelet không kéo được image — sai tên/tag, registry private thiếu credential, hoặc registry không với tới được.
- *Điều tra:* `kubectl describe pod <pod>` (lỗi pull nằm trong Events) → `kubectl get pod <pod> -o jsonpath="{.spec.containers[*].image}"` để đọc đúng chuỗi image.
- *Khắc phục:* sửa tên/tag image (d1) · thêm `imagePullSecret` (d2).

**3. OOMKilled** · sev 3 · `flash-red`
- *Triệu chứng:* container chết đột ngột không báo trước, exit code 137.
- *Root cause:* container vượt `memory limit`, kernel OOM killer giết. Khác CrashLoopBackOff ở chỗ **app không sai** — nó chỉ cần nhiều RAM hơn mức được cấp, hoặc rò rỉ bộ nhớ.
- *Điều tra:* `kubectl describe pod <pod>` tìm `OOMKilled` ở **Last State** (không phải Current State) → `kubectl top pod <pod>` → đọc `resources` hiện tại.
- *Khắc phục:* tăng memory limit (d1) · sửa memory leak trong app (d3) · thêm HPA để scale ngang (d2).

**4. PodEviction** · sev 2 · `fade-out`
- *Triệu chứng:* pod biến mất khỏi node, phải reschedule chỗ khác.
- *Root cause:* node bị resource pressure, kubelet đuổi pod theo thứ tự QoS (BestEffort trước, rồi Burstable, Guaranteed cuối).
- *Điều tra:* `kubectl describe pod <pod>` → `kubectl describe node <node>` xem condition pressure → `kubectl top node`.
- *Khắc phục:* thêm node (d1) · đặt PriorityClass (d2) · chỉnh lại resource requests (d2).

**5. ReadinessProbeFailure** · sev 2 · `pulse-yellow` · **tự khỏi sau 60s**
- *Triệu chứng:* pod **Running nhưng không Ready**, và bị gỡ khỏi endpoint của Service — traffic không tới nữa dù container vẫn sống.
- *Root cause:* readiness probe fail. Thường là sai path, sai port, hoặc `initialDelaySeconds` quá ngắn với app khởi động chậm.
- *Điều tra:* `kubectl describe pod <pod>` → `kubectl logs <pod>` → **`kubectl get endpoints <service>`** (đây là bước dạy đúng nhất: chứng minh pod đã rớt khỏi endpoint list).
- *Khắc phục:* sửa path (d1) · sửa port (d1) · tăng `initialDelaySeconds` (d1).

**6. PodStuckTerminating** · sev 2 · `blink-gray` · **tự khỏi sau 120s**
- *Triệu chứng:* pod ở `Terminating` mãi không biến mất.
- *Root cause:* finalizer chưa được gỡ, hoặc process không chịu chết sau `SIGTERM` nên phải chờ hết grace period.
- *Điều tra:* `kubectl describe pod <pod>` → `kubectl get pod <pod> -o jsonpath="{.metadata.finalizers}"`.
- *Khắc phục:* force delete (d1) · gỡ finalizer chặn (d2).

**7. LivenessProbeFailure** · sev 3 · `pulse-red`
- *Triệu chứng:* container bị kubelet restart lặp đi lặp lại, khác OOMKilled ở chỗ RAM vẫn bình thường.
- *Root cause:* liveness probe fail nên kubelet kết luận container treo và giết nó. Bẫy kinh điển: app khởi động chậm hơn `initialDelaySeconds` → probe giết nó trước khi nó kịp sống → vòng lặp vĩnh viễn.
- *Điều tra:* `kubectl describe pod <pod>` → `kubectl logs <pod> --previous` → events.
- *Khắc phục:* sửa health endpoint (d1) · tăng `timeoutSeconds`/`failureThreshold` (d1) · **thêm `startupProbe`** cho app khởi động chậm (d2) — đây là câu trả lời đúng nhất và cũng là thứ hay bị bỏ sót nhất.

**8. InitContainerCrash** · sev 3 · `pulse-red`
- *Triệu chứng:* pod kẹt ở `Init:0/1`, container chính chưa bao giờ chạy.
- *Root cause:* init container crash → container chính bị chặn theo thiết kế.
- *Điều tra:* `kubectl describe pod <pod>` → **`kubectl logs <pod> -c init`** (phải chỉ đích danh container, `logs <pod>` trống) → `jsonpath="{.status.initContainerStatuses}"`.
- *Khắc phục:* sửa image/command của init (d2) · sửa ConfigMap/Secret mà init tham chiếu (d2) · bỏ init container không cần thiết (d1).

### 4.2 Nhóm Node (4)

**9. NodeNotReady** · **sev 5** · `shake-fade`
- *Triệu chứng:* cả một node chuyển xám, mọi pod trên đó lâm nguy.
- *Root cause:* kubelet ngừng gửi heartbeat lên API server — kubelet chết, mất mạng, hoặc node down thật.
- *Điều tra:* `kubectl describe node <node>` → `kubectl get pods --field-selector spec.nodeName=<node>` (đếm bán kính thiệt hại) → events của node.
- *Khắc phục:* restart kubelet (d2) · drain và reschedule (d2) · thay hẳn node (d3).

**10. NodeDiskPressure** · sev 4 · `pulse-orange`
- *Triệu chứng:* node báo pressure, sắp có eviction hàng loạt.
- *Root cause:* hết dung lượng đĩa — thường do image cũ tích tụ và pod của Job đã xong không được dọn.
- *Điều tra:* `kubectl describe node <node>` → `kubectl get pods --field-selector spec.nodeName=<node> --sort-by=.status.startTime`.
- *Khắc phục:* xoá image không dùng (d1) · xoá pod của Job đã hoàn thành (d1) · mở rộng đĩa (d3).

**11. NodeMemoryPressure** · sev 4 · `pulse-orange`
- *Triệu chứng:* RAM node cạn, eviction theo priority sắp xảy ra.
- *Root cause:* tổng mức dùng thật vượt khả năng node, thường vì pod không đặt limit.
- *Điều tra:* `kubectl top node <node>` → `kubectl top pods --sort-by=memory`.
- *Khắc phục:* đuổi pod priority thấp (d1) · thêm node (d2) · **đặt memory limit cho mọi pod** (d2 — cách chữa gốc).

**12. NodePIDPressure** · sev 3 · `pulse-orange`
- *Triệu chứng:* node hết PID, không fork được process mới.
- *Root cause:* nghi fork bomb — một container đẻ process không kiểm soát.
- *Điều tra:* `kubectl describe node <node>` → liệt kê pod trên node đó.
- *Khắc phục:* xoá pod chạy loạn (d1) · đặt PID limit cho container (d2).

### 4.3 Nhóm Network (6)

**13. ServiceEndpointMissing** · sev 3 · `pulse-yellow`
- *Triệu chứng:* Service tồn tại nhưng gọi vào không ai trả lời.
- *Root cause:* selector của Service không khớp label nào của pod — hoặc pod có label đúng nhưng chưa Ready nên bị loại khỏi endpoint.
- *Điều tra:* **`kubectl get endpoints <service>`** (rỗng = xác nhận ngay) → `kubectl describe service <service>` → `kubectl get pods --show-labels`.
- *Khắc phục:* sửa selector (d1) · sửa label của pod (d1) · sửa readiness probe (d2 — trường hợp label đúng mà pod chưa Ready).

**14. DNSResolutionFailure** · sev 4 · `screen-static`
- *Triệu chứng:* mọi service discovery bằng tên gãy; gọi bằng IP thì vẫn được.
- *Root cause:* CoreDNS chết, ConfigMap của CoreDNS sai, hoặc **NetworkPolicy chặn cổng 53** — nguyên nhân thứ ba là thứ khiến người ta mất nhiều giờ nhất.
- *Điều tra:* `kubectl get pods -n kube-system -l k8s-app=kube-dns` → `kubectl logs -n kube-system -l k8s-app=kube-dns` → `kubectl get configmap coredns -n kube-system -o yaml`.
- *Khắc phục:* restart CoreDNS (d1) · sửa Corefile trong ConfigMap (d2) · **mở egress DNS trong NetworkPolicy** (d2).

**15. NetworkPolicyBlocking** · sev 3 · `connection-red`
- *Triệu chứng:* hai service không nói chuyện được với nhau dù cả hai đều khoẻ.
- *Root cause:* NetworkPolicy chặn traffic hợp lệ. Bẫy kinh điển: vừa áp một policy default-deny là **DNS cũng chết theo**, vì egress 53 không được mở.
- *Điều tra:* `kubectl get networkpolicies` → `kubectl describe networkpolicy <policy>` → `kubectl get pods --show-labels -n <namespace>`.
- *Khắc phục:* thêm allow rule (d2) · sửa namespace/pod selector (d2) · **mở egress DNS** (d1).

**16. IngressMisconfigured** · sev 3 · `pulse-yellow`
- *Triệu chứng:* truy cập từ ngoài trả 404 hoặc 502; nội bộ gọi Service thì vẫn ổn.
- *Root cause:* backend service name/port sai, path rule sai, hoặc TLS chưa cấu hình.
- *Điều tra:* `kubectl describe ingress <ingress>` → `kubectl get svc` (đối chiếu tên và port).
- *Khắc phục:* sửa backend name/port (d1) · sửa path rule (d1) · cấu hình TLS termination (d2).

**17. UnauthorizedAccess** · **sev 5** · `alert-red-border`
- *Triệu chứng:* mẫu truy cập bất thường, cảnh báo an ninh.
- *Root cause:* ServiceAccount có quyền quá rộng (thường là wildcard trong Role), hoặc thiếu network isolation.
- *Điều tra:* **`kubectl auth can-i --list --as=system:serviceaccount:<ns>:<sa>`** — lệnh đáng dạy nhất trong cả bộ, vì nó trả lời chính xác "SA này làm được gì" → `kubectl get rolebindings,clusterrolebindings --all-namespaces` → `kubectl logs <pod>`.
- *Khắc phục:* thu hẹp RBAC (d2) · thêm NetworkPolicy (d2) · xoay vòng token của SA (d3).

**18. LoadBalancerPending** · sev 2 · `pulse-yellow`
- *Triệu chứng:* Service `type: LoadBalancer` kẹt `<pending>`, EXTERNAL-IP không bao giờ có.
- *Root cause:* không có cloud controller manager cấp LB — đúng tình huống của cluster bare-metal hoặc local.
- *Điều tra:* `kubectl get svc <service>` → `describe` → events của service.
- *Khắc phục:* đổi sang NodePort (d1) · sửa cấu hình cloud provider (d3) · dùng Ingress cho L7 (d2).

### 4.4 Nhóm Storage (3)

**19. PVCPending** · sev 3 · `pulse-yellow`
- *Triệu chứng:* PVC kẹt `Pending`, pod dùng nó kẹt theo.
- *Root cause:* không có PV nào khớp — sai StorageClass, dung lượng yêu cầu lớn hơn PV có sẵn, hoặc access mode không tương thích.
- *Điều tra:* `kubectl describe pvc <pvc>` (lý do nằm trong Events) → `kubectl get pv` → `kubectl get storageclass`.
- *Khắc phục:* tạo PV khớp (d1) · sửa tham chiếu StorageClass (d2) · giảm size yêu cầu (d1).

**20. VolumeMountFailure** · sev 3 · `pulse-red`
- *Triệu chứng:* container không khởi động được, kẹt ở ContainerCreating.
- *Root cause:* sai mount path, sai tên PVC, hoặc **access mode xung đột** — RWO đã bị node khác giữ nên pod trên node này không mount được.
- *Điều tra:* `kubectl describe pod <pod>` → `kubectl get pvc`.
- *Khắc phục:* sửa mount path (d1) · sửa tên PVC (d1) · đổi access mode RWO↔RWX (d2).

**21. VolumeCapacityFull** · sev 4 · `pulse-orange`
- *Triệu chứng:* app báo lỗi ghi, nhưng pod vẫn Running và mọi probe vẫn xanh — đây là loại sự cố **không** hiện ra ở trạng thái pod.
- *Root cause:* PV đầy.
- *Điều tra:* **`kubectl exec <pod> -- df -h`** (phải chui vào trong mới thấy) → `kubectl describe pv <pv>`.
- *Khắc phục:* mở rộng PV (d2) · dọn dữ liệu cũ (d1) · thêm alert cho mức dùng volume (d2).

### 4.5 Nhóm ControlPlane (7)

**22. EtcdLatency** · **sev 5** · `slow-motion`
- *Triệu chứng:* mọi lệnh `kubectl` chậm rề, toàn cluster ì.
- *Root cause:* etcd chậm — DB phân mảnh, quá nhiều revision chưa nén, hoặc đĩa chậm.
- *Điều tra:* `kubectl -n kube-system get pods -l component=etcd` → `kubectl logs -n kube-system etcd-master`.
- *Khắc phục:* defrag etcd (d3) · compact revision (d3) · scale etcd cluster (d3). **Cả ba đều d3** — incident khó nhất bộ, đúng với thực tế.

**23. APIServerOverloaded** · **sev 5** · `screen-lag`
- *Triệu chứng:* request bị throttle, `kubectl` trả 429.
- *Root cause:* quá nhiều watch connection hoặc client hành xử tồi làm bão hoà API server.
- *Điều tra:* `kubectl get --raw /metrics | grep apiserver_request` → `kubectl get events --all-namespaces --sort-by=.lastTimestamp`.
- *Khắc phục:* giảm watch connection (d2) · bật API Priority and Fairness (d3) · scale API server (d3).

**24. SchedulerFailure** · sev 4 · `pulse-yellow`
- *Triệu chứng:* pod nằm `Pending` mãi, không node nào nhận.
- *Root cause:* không node nào thoả — hết tài nguyên, node affinity quá chặt, hoặc taint chưa có toleration.
- *Điều tra:* `kubectl describe pod <pod>` (**scheduler ghi rõ lý do từ chối của từng node ở Events** — điều nhiều người không biết) → `kubectl get nodes` → `kubectl describe nodes | grep -A5 "Allocated resources"`.
- *Khắc phục:* thêm node (d1) · nới affinity (d2) · gỡ taint (d1).

**25. WebhookTimeout** · sev 4 · `pulse-orange` · **tự khỏi sau 90s**
- *Triệu chứng:* tạo resource nào cũng treo rồi timeout.
- *Root cause:* admission webhook không phản hồi mà `failurePolicy: Fail`, nên mọi request bị chặn.
- *Điều tra:* `kubectl get validatingwebhookconfigurations` → `kubectl get mutatingwebhookconfigurations` → log của webhook pod.
- *Khắc phục:* restart webhook pod (d1) · đổi `failurePolicy: Ignore` (d2) · xoá webhook config (d2).

**26. WebhookAdmissionRejection** · sev 4 · `alert-red-border` · **tự khỏi sau 90s**
- *Triệu chứng:* pod bị từ chối thẳng, `FailedCreate`.
- *Root cause:* webhook từ chối resource — khác #25 ở chỗ webhook **sống và trả lời**, chỉ là trả lời "không".
- *Điều tra:* liệt kê webhook config → `kubectl describe pod <pod>` → `kubectl get events --field-selector reason=FailedCreate`.
- *Khắc phục:* sửa webhook service endpoint (d3) · thêm namespace exclusion (d2) · xoá webhook chặn (d1, khẩn cấp).

**27. CertificateExpiry** · **sev 5** · `alert-red-border`
- *Triệu chứng:* HTTPS gãy, browser báo lỗi cert.
- *Root cause:* cert TLS trong Secret đã hết hạn.
- *Điều tra:* `kubectl get secret <tls-secret> -o jsonpath` rồi `base64 -d | openssl x509 -noout -dates` → `kubectl describe ingress <ingress>` → `kubectl get secrets --field-selector type=kubernetes.io/tls`.
- *Khắc phục:* gia hạn cert (d2) · cập nhật Secret (d1) · **cài cert-manager để tự gia hạn** (d3 — chữa gốc).

**28. SecretExposed** · **sev 5** · `alert-red-border`
- *Triệu chứng:* cảnh báo bảo mật: dữ liệu nhạy cảm nằm trong ConfigMap thay vì Secret.
- *Root cause:* lỗi cấu hình của con người. Đây là incident **duy nhất trong bộ không phải sự cố runtime** — cluster hoàn toàn khoẻ, chỉ là sai về bảo mật. Thiết kế hay: nó dạy rằng "mọi thứ đang chạy" không đồng nghĩa "mọi thứ ổn".
- *Điều tra:* `kubectl get configmaps -o yaml` → `kubectl get secrets`.
- *Khắc phục:* chuyển sang Secret (d1) · **xoay vòng credential đã lộ** (d2 — bước hay bị quên: chuyển chỗ lưu không cứu được thứ đã lộ) · cập nhật mọi tham chiếu trong pod (d2).

### 4.6 Nhóm Workload (6)

**29. DeploymentStuckRollout** · sev 3 · `pulse-yellow`
- *Triệu chứng:* rollout treo giữa chừng, ReplicaSet mới không lên nổi.
- *Root cause:* pod mới không bao giờ Ready (image hỏng, probe fail) nên `maxUnavailable` chặn không cho tiến tiếp.
- *Điều tra:* `kubectl rollout status deployment/<deployment>` → `kubectl describe deployment` → `kubectl get replicasets -l app=<deployment>` (thấy cả RS cũ và mới cùng tồn tại).
- *Khắc phục:* `rollout undo` về revision trước (d1) · sửa image (d1) · tăng `maxSurge` (d2).

**30. HPAScalingFailure** · sev 2 · `pulse-yellow`
- *Triệu chứng:* tải cao mà HPA không scale.
- *Root cause:* metrics-server chết (HPA đọc `<unknown>`), đã chạm `maxReplicas`, hoặc **container không đặt resource requests** — không có requests thì không tính được phần trăm CPU, HPA mù.
- *Điều tra:* `kubectl describe hpa <hpa>` → `kubectl top pods` → `kubectl get hpa`.
- *Khắc phục:* tăng `maxReplicas` (d1) · sửa metrics-server (d2) · **đặt resource requests** (d1).

**31. JobDeadlineExceeded** · sev 2 · `fade-out`
- *Triệu chứng:* Job bị giết giữa chừng, không hoàn thành.
- *Root cause:* vượt `activeDeadlineSeconds`.
- *Điều tra:* `kubectl describe job <job>` → `kubectl logs job/<job>`.
- *Khắc phục:* tăng `activeDeadlineSeconds` (d1) · tăng `parallelism` (d1) · xoá và tạo lại (d1).

**32. CronJobMissedSchedule** · sev 2 · `pulse-yellow`
- *Triệu chứng:* CronJob bỏ lỡ lịch chạy.
- *Root cause:* controller không kịp trong `startingDeadlineSeconds`, hoặc `concurrencyPolicy: Forbid` chặn vì lần chạy trước còn sống.
- *Điều tra:* `kubectl describe cronjob <cronjob>` → `kubectl get jobs --sort-by=.status.startTime` → events.
- *Khắc phục:* tăng `startingDeadlineSeconds` (d1) · đổi `concurrencyPolicy: Allow` (d1) · tạo Job thủ công từ template (d1).

**33. StatefulSetOrderedReadyStuck** · sev 3 · `pulse-yellow`
- *Triệu chứng:* StatefulSet dừng ở pod thứ N, các pod sau không bao giờ được tạo.
- *Root cause:* `podManagementPolicy: OrderedReady` bắt pod N-1 phải Ready trước khi tạo pod N. Một pod hỏng chặn toàn bộ phần đuôi — **hành vi đặc trưng chỉ StatefulSet mới có**, Deployment không như vậy.
- *Điều tra:* `kubectl get statefulset` → `kubectl get pods -l app=<...>` (thấy đứt quãng ở đúng index) → `describe` + `logs` pod kẹt.
- *Khắc phục:* sửa readiness probe của pod kẹt (d2) · xoá pod kẹt cho tạo lại (d1) · đổi `podManagementPolicy: Parallel` (d2).

**34. ResourceQuotaExceeded** · sev 3 · `pulse-yellow`
- *Triệu chứng:* không tạo được pod mới, lỗi từ **API server chứ không phải scheduler** — pod không hề xuất hiện ở trạng thái Pending.
- *Root cause:* namespace chạm trần ResourceQuota.
- *Điều tra:* `kubectl describe resourcequota -n <namespace>` (bảng used/hard) → `kubectl get pods -n <namespace>` → `kubectl top pods -n <namespace> --sort-by=cpu`.
- *Khắc phục:* nâng quota (d1) · giảm requests của pod (d2) · xoá pod nhàn rỗi (d1).

### 4.7 Điều đáng học nhất từ danh mục này

Nhìn tổng thể, bộ 34 incident này mạnh không phải vì số lượng mà vì **cấu trúc ba tầng nhất quán**: triệu chứng quan sát được → lệnh điều tra dẫn tới bằng chứng → nhiều đường sửa có độ khó khác nhau. Ba nguyên tắc đáng lấy:

1. **`investigationSteps` có `hint` riêng cho từng lệnh.** Không chỉ "chạy lệnh này" mà "chạy lệnh này để **tìm cái gì**". Đó là khác biệt giữa dạy gõ lệnh và dạy chẩn đoán.
2. **`resolutionActions` luôn có nhiều hơn một đường, kèm `difficulty` 1–3.** Điều này ngầm dạy rằng d1 thường là *vá tạm* còn d3 là *chữa gốc* — ví dụ OOMKilled: tăng limit (d1) chỉ mua thêm thời gian, sửa memory leak (d3) mới là câu trả lời thật. Ta nên giữ nguyên ý này và **nói thẳng ra** thay vì để ngầm.
3. **Có những cặp incident gần giống nhau nhưng root cause khác hẳn** — CrashLoopBackOff vs OOMKilled vs LivenessProbeFailure (cả ba đều "container restart liên tục"); WebhookTimeout vs WebhookAdmissionRejection (webhook chết vs webhook từ chối); ServiceEndpointMissing vs ReadinessProbeFailure (endpoint rỗng vì selector sai vs vì pod chưa Ready). **Chính các cặp dễ nhầm này mới là chỗ có giá trị sư phạm cao nhất**, và là chỗ ta nên đầu tư thiết kế bài tập phân biệt.

---

## 5. Achievement và đường cong XP

### 5.1 45 achievement (README nói 40)

Bốn category: **Beginner 10 · Intermediate 10 · Advanced 10 · Secret 15**. Tổng XP nếu mở hết: **8.990**.

| Category | Ngưỡng mở | Ví dụ tiêu biểu | Dải XP |
|---|---|---|---|
| Beginner | level 0 | First Pod (1 pod), Command Line Hero (10 lệnh), YAML Reader (xem 5 YAML) | 25–75 |
| Intermediate | level 5 | Full House (100 pod đồng thời), Quick Fix (fix incident ≤30s), Star Hoarder (10 sao) | 100–250 |
| Advanced | level 15 | CKA Ready (xong 20 level), Perfectionist (3 sao cả 20 level), Chaos Master (sống 1800s) | 200–1000 |
| Secret | level 0 | Konami Code (tạo pod tên `konami`), Doom Runner, Coffee Break, Night Owl (chơi đêm) | 5–500 |

**Điều kiện kích hoạt là closure JavaScript, không phải data:**

```js
condition: (stats) => stats.totalPodsDeployed >= 1
condition: (stats) => stats.fastestIncidentResolve <= 30 && stats.fastestIncidentResolve > 0
condition: (stats) => stats.easterEggs?.['konami-code'] === true
```

Toàn bộ 45 điều kiện chỉ đọc từ **31 field thống kê phẳng**: `totalPodsDeployed`, `incidentsResolved`, `maxConcurrentPods`, `maxNodes`, `threeStarLevels`, `totalStars`, `chaptersCompleted`, `longestChaosSurvival`, `highestCombo`, `highestArchitectureScore`, `commandsExecuted`, `yamlViewed`, `uniqueResourceTypesDeployed`, `zeroDowntimeUpdates`, `cascadingFailuresResolved`, `completedWithoutHints`, `levelRetries`, `fastestIncidentResolve`, `levelTimes`, `easterEggs`, v.v.

> 🔴 **Đây là chỗ ta bắt buộc phải làm khác.** Điều kiện là closure nghĩa là: không serialize được, không lưu DB được, không dịch sang tiếng Việt được ở tầng dữ liệu, không cho giảng viên thêm achievement mà không sửa code, và không đánh giá được ở server. Với kiến trúc của ta (Postgres, tiến độ server-side, nội dung tiếng Việt), achievement phải là **predicate khai báo** trên đúng bộ 31 chỉ số kia — kiểu `{stat: "incidentsResolved", op: ">=", value: 10}`. Bộ 31 chỉ số thì đáng học gần như nguyên vẹn; cách biểu diễn điều kiện thì không.

Toàn bộ tiến độ lưu ở **`localStorage`** (`ScoringEngine.js` dòng 762/788) — một máy, một trình duyệt, xoá cache là mất sạch, và không có đường nào cho giảng viên nhìn thấy tiến độ học viên.

### 5.2 Đường cong XP 30 bậc

Từ `XP_LEVELS` trong `ScoringEngine.js`. Danh hiệu đi theo nấc thang nghề nghiệp thật: Novice I–III → Apprentice I–III → Operator I–III → Administrator I–III → Engineer I–III → Architect I–III → SRE I–III → Principal I–III → Staff I–III → **CKA Candidate (28) → CKA Certified (29) → CKA Master (30)**.

| Level | XP cần | Level | XP cần |
|---|---|---|---|
| 1 Novice | 0 | 16 Architect | 11.000 |
| 5 Apprentice II | 700 | 20 SRE II | 22.000 |
| 10 Administrator | 3.200 | 25 Staff | 47.500 |
| 15 Engineer III | 9.200 | 30 CKA Master | **100.000** |

Đường cong siêu tuyến tính, mỗi bậc đắt hơn bậc trước khoảng 15–20%.

**Kiểm tra kinh tế XP — và nó không cân.** Tính tổng nguồn XP từ nội dung giáo dục:

- Campaign, 3 sao cả 20 level: tổng của `(100 + 25×id + 150)` với id chạy 1..20 = `20×250 + 25×210` = **10.250 XP**
- Achievement, mở hết 45 cái: **8.990 XP**
- Cộng lại: **≈ 19.240 XP → chỉ tới level 19 ("SRE")**

Muốn chạm level 30 phải có **100.000 XP**, tức là **hơn 80% đường cong chỉ có thể lấp bằng cày Chaos và Challenge lặp đi lặp lại**. Nói cách khác: danh hiệu "CKA Master" **không đạt được bằng cách học hết nội dung** — chỉ đạt được bằng cách chơi lại nhiều lần. Với một sản phẩm giải trí thì chấp nhận được; với một nền tảng học thì đó là tín hiệu sai, vì nó thưởng cho thời gian ngồi máy chứ không thưởng cho năng lực. Bên ta nên chốt đường cong sao cho **hoàn thành hết nội dung = chạm trần**, phần cày thêm chỉ là trang trí.

---

## 6–8. Chưa làm — cắt theo chỉ đạo

Ba mục còn lại của đề bài ban đầu (mô hình simulation, đánh giá nên/không nên mượn Three.js, và điểm yếu upstream) **đã được điều phối viên yêu cầu bỏ**, vì quyết định dùng Three.js và tự viết toàn bộ code simulation đã chốt trước đó. Không viết ở đây để khỏi tạo cảm giác đó là kết luận đang mở.

Hai dữ kiện đo được trong lúc đọc engine vẫn nên ghi lại, vì chúng ảnh hưởng trực tiếp tới việc **chấm điểm học viên** — thứ upstream không cần mà ta thì cần:

1. **Simulation của upstream không tất định.** Có **15 lời gọi `Math.random()`** trong engine (10 ở `SimulationTick.js`, 4 ở `IncidentEngine.js`, 1 ở `GameEngine.js`) và **không có RNG có seed** ở bất kỳ đâu (quét `seed|mulberry|xorshift` trên toàn bộ `js/` — 0 kết quả liên quan). Ngay cả việc thoát khỏi CrashLoopBackOff cũng là xác suất: `if (Math.random() < dt / backoffTime)`. Hệ quả: **cùng một chuỗi thao tác của người chơi có thể ra kết quả khác nhau**. Với game thì không sao; với hệ thống chấm điểm và khiếu nại điểm thì không dùng được. Nếu ta mượn kiến trúc tick loop, RNG phải có seed lưu theo phiên ngay từ đầu — thêm sau là phải viết lại.
2. **Backoff mô phỏng đúng hình dạng thật.** `Math.min(300, Math.pow(2, restartCount) * 10)` — 10s, 20s, 40s… trần 300s, khớp trần thật của Kubernetes. Và pod phase giữ nguyên `Running` trong khi `CrashLoopBackOff` nằm ở **container state**, đúng ngữ nghĩa K8s (nhiều bản mô phỏng khác đặt nhầm CrashLoopBackOff thành pod phase). Chi tiết nhỏ nhưng là dấu hiệu tác giả hiểu miền.

---

## Nguồn tham khảo

Toàn bộ URL dưới đây đã kiểm trả `200` ngày 2026-09-08.

| URL | Dùng cho |
|---|---|
| https://github.com/rohitg00/k8sgames | repo gốc, README |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/LICENSE | §1 — license nguyên văn |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/README.md | §0, §2 — mô tả mode |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/data/IncidentDefs.js | §4 — 34 incident |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/data/CampaignLevels.js | §3 — 20 level |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/data/Achievements.js | §5 — 45 achievement |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/engine/ScoringEngine.js | §2, §5 — sao, XP, architecture score |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/engine/SimulationTick.js | §6 — tick loop |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/modes/ChaosMode.js | §2.2 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/modes/ChallengeMode.js | §2.4 |
| https://k8sgames.com | demo trực tiếp |
| https://k8sgames.com/draw | K8s Draw |
| https://www.apache.org/licenses/LICENSE-2.0 | đối chiếu bản license chuẩn |
