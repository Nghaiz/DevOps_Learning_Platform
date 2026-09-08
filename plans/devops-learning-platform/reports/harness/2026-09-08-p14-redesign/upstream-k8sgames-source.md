# Mổ xẻ mã nguồn k8sgames.com

**Ngày:** 2026-09-08
**Mục đích:** hiểu cách k8sgames.com được xây, để P14 dựng lại game K8s của ta đẹp và xịn hơn.
**Phạm vi:** chỉ nghiên cứu. Không sửa file sản phẩm nào.

---

## 0. Xác minh repo

| Hạng mục | Giá trị |
|---|---|
| Repo | `https://github.com/rohitg00/k8sgames` |
| Tác giả | Rohit Ghumare |
| Commit đọc được | `af5dbc1` — `chore: edge cache headers + UA-deflect bots...` (2026-04-28) |
| Giấy phép | **Apache-2.0**, `LICENSE:178` — `Copyright 2026 Rohit Ghumare` |
| Cách lấy | `git clone --depth 1` vào scratchpad (ngoài repo dự án) |

**Bằng chứng đúng repo (bốn nguồn độc lập):**

1. `README.md:5` — `**[Play Now at k8sgames.com](https://k8sgames.com)**`
2. `index.html:11` — `<meta property="og:url" content="https://k8sgames.com">`
3. `index.html:62` — nút badge trên trang chủ trỏ `href="https://github.com/rohitg00/k8sgames"`, khớp badge "⭐" chủ dự án thấy.
4. `vercel.json:3` — rewrite `/draw` → `/draw.html`, khớp route `k8sgames.com/draw`.

---

## 1. Ràng buộc pháp lý (đọc trước khi code)

Apache-2.0 là giấy phép permissive, **cho phép** dùng lại mã nguồn kể cả trong sản phẩm đóng, nhưng kèm nghĩa vụ. Nếu ta chép bất kỳ đoạn mã nào:

- Phải giữ lại thông báo bản quyền + bản sao LICENSE (§4a, §4b).
- Phải ghi rõ file nào đã bị sửa (§4b — "carry prominent notices stating that You changed the Files").
- Phải giữ file `NOTICE` nếu có (repo này **không** có NOTICE, nên nghĩa vụ này không phát sinh).
- Có điều khoản cấp phép sáng chế (§3), kèm điều khoản chấm dứt nếu ta kiện sáng chế ngược lại.

**Khuyến nghị cho P14: KHÔNG chép một dòng nào.** Lý do không phải pháp lý mà là kỹ thuật —
stack của họ (vanilla ES6 + three.js thuần qua CDN, không build step) **không tương thích**
với stack của ta (Next.js + TypeScript + workspace pnpm). Chép sang sẽ phải viết lại toàn bộ.

Ta **tham khảo ý tưởng** (danh mục tài nguyên, danh mục sự cố, mô hình reconcile) — ý tưởng và
sự kiện thực tế về Kubernetes thì không ai độc quyền được.

Ranh giới an toàn: đọc để hiểu → tự thiết kế lại → tự viết. Không copy-paste, không dịch máy
từng hàm sang TypeScript (dịch nguyên văn vẫn là tác phẩm phái sinh).

---

## 2. Stack — nhỏ hơn nhiều so với quảng cáo

| Thành phần | Thực tế |
|---|---|
| Framework | **Không có.** Vanilla ES6 modules, không bundler, không build step |
| 3D | **three.js r152 thuần**, nạp qua importmap từ unpkg (`index.html:44-51`) |
| Camera controls | `OrbitControls` từ `three/addons/` (`ClusterRenderer.js:2`) |
| State management | **Không có thư viện.** Class tự viết + EventBus tự viết |
| Styling | **Tailwind CDN 3.4.1** (`index.html:24`) + `style.css` 1.611 dòng thủ công |
| Font | Google Fonts (Inter + JetBrains Mono) |
| Hosting | Vercel (`vercel.json`) |
| Test | **Không có** — không `package.json`, không `.github/`, không CI |

**Không có react-three-fiber, không babylon.** Khớp phép đo tại chỗ của điều phối viên:
`<canvas id="game-canvas" data-engine="three.js r152">`.

### Quy mô thật vs quảng cáo

`README.md:97` viết: *"~50K lines across 90+ files"*.

Đo thực tế trên bản clone:

```
js/**/*.js          16.984 dòng / 31 file
index.html           1.988 dòng
draw.html            1.046 dòng
style.css            1.611 dòng
------------------------------------
tổng mã nguồn       21.629 dòng / 34 file
```

README **phóng đại ~2,3× số dòng và ~2,6× số file**. Nêu ra đây không phải để bắt lỗi, mà vì
nó đổi chiến lược: đây là codebase ta có thể vượt về quy mô lẫn chất lượng trong tầm P14,
không phải một khối 50K dòng đáng sợ.

### Cây thư mục

```
js/engine/     GameEngine, ClusterState, SimulationTick, IncidentEngine, ScoringEngine
js/rendering/  ClusterRenderer, ResourceMeshes, ConnectionLines, ParticleTraffic
js/resources/  ResourceBase + 6 nhóm tài nguyên (Workload/Network/Storage/Config/RBAC/Cluster)
js/modes/      CampaignMode, ChaosMode, SandboxMode, ChallengeMode
js/ui/         CommandBar, InspectorPanel, HUD, IncidentPanel, MetricsDashboard, Minimap, ContextMenu, SettingsPanel
js/data/       CampaignLevels, IncidentDefs, Achievements
```

Phân lớp sạch sẽ, đáng học. Nhưng **không có lớp nào là dữ liệu thuần** — xem mục 4.

---

## 3. Kiến trúc scene 3D

### 3.1 Renderer (`js/rendering/ClusterRenderer.js`)

```js
// ClusterRenderer.js:52-77
this.scene.fog = new THREE.FogExp2(0x0d1117, 0.006);
this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
this.camera.position.set(18, 14, 18);

this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
this.renderer.toneMappingExposure = 1.2;
```

Điểm đáng học: **ACESFilmic tone mapping + exposure 1.2** là thứ tạo cảm giác "xịn" — màu không
bị cháy, highlight cuộn mềm. Cộng `FogExp2` cùng màu nền để vật thể xa tan vào nền thay vì cắt
cụt ở far plane. Hai dòng rẻ tiền cho hiệu quả thị giác lớn.

**Đèn — 5 nguồn (`ClusterRenderer.js:107-133`):**

| Đèn | Màu | Cường độ | Vai trò |
|---|---|---|---|
| Ambient | `0x8899bb` | 0.7 | nền lạnh |
| Hemisphere | `0x88aaff` / `0x222244` | 0.4 | trời/đất |
| Directional (chính) | `0xffffff` | 1.2 | đổ bóng, shadowmap 2048² |
| Rim | `0x326CE5` (xanh K8s) | 0.4 | viền sau, tách nền |
| Fill | `0x446688` | 0.3 | vá vùng tối |

Bố cục đèn 3 điểm cổ điển + rim xanh thương hiệu. **Công thức nên bê nguyên ý tưởng.**

### 3.2 Camera controls — mục ưu tiên cao (chuột "rất mượt")

Đây là toàn bộ bí mật, và nó ngắn (`ClusterRenderer.js:80-105`):

```js
this.controls = new OrbitControls(this.camera, this.canvas);
this.controls.enableDamping = true;
this.controls.dampingFactor = 0.08;
this.controls.rotateSpeed = 0.8;
this.controls.zoomSpeed  = 1.2;
this.controls.panSpeed   = 0.8;
this.controls.minDistance = 5;
this.controls.maxDistance = 80;
this.controls.maxPolarAngle = Math.PI / 2.1;   // ~85.7° — chặn chui xuống dưới sàn
this.controls.minPolarAngle = 0.1;             // ~5.7°  — chặn lật đúng đỉnh
this.controls.mouseButtons = {
    LEFT:   THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT:  THREE.MOUSE.PAN,
};
this.controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
};
```

**Không có gì tự viết. Toàn bộ "mượt" đến từ 4 thứ:**

1. `enableDamping = true` + `dampingFactor = 0.08` — quán tính. **Yếu tố quyết định.**
   0.08 nặng hơn mặc định three.js (0.05); cảm giác trôi dài, cao cấp.
   Bắt buộc gọi `controls.update()` mỗi frame thì damping mới chạy (`ClusterRenderer.js:618`).
2. `maxPolarAngle = Math.PI / 2.1` — chặn camera chui xuống dưới mặt sàn. Không có chặn này
   thì người dùng lật xuống dưới lưới và thấy scene rỗng → cảm giác "vỡ".
3. `minDistance/maxDistance = 5..80` — zoom bị kẹp, không bao giờ chui vào trong vật thể
   hay bay ra ngoài fog.
4. `setPixelRatio(min(dpr, 2))` — chặn trần DPR ở 2. Trên màn Retina/4K điều này giữ framerate,
   mà framerate cao chính là thứ người dùng cảm nhận thành "mượt".

**Kết luận:** không cần viết camera controller riêng. Chi tiết cách vượt họ ở mục 13.

### 3.3 Vẽ tài nguyên (`js/rendering/ResourceMeshes.js`)

**Không có model 3D nào.** Toàn bộ 25 loại tài nguyên là primitive dựng bằng code:

| Kỹ thuật | Dùng cho |
|---|---|
| `ExtrudeGeometry` + `THREE.Shape` | Pod (lục giác), ConfigMap, Secret (hình ổ khoá) |
| `roundedBoxGeometry()` tự viết (`:188-208`) | Deployment |
| `BoxGeometry` xếp chồng | ReplicaSet (các lớp mỏng) |
| `SphereGeometry` + `TorusGeometry` | Service (cầu + vòng quỹ đạo) |
| `OctahedronGeometry` + `EdgesGeometry` | Ingress |
| `CylinderGeometry` | PVC/PV (hình lon) |

Material dùng chung một factory (`ResourceMeshes.js:27-36`):

```js
new THREE.MeshStandardMaterial({
    color, metalness: 0.4, roughness: 0.35,
    emissive: new THREE.Color(statusColor),   // MÀU TRẠNG THÁI nằm ở emissive
    emissiveIntensity: 0.25
});
```

**Thủ thuật đáng học:** trạng thái (Running/Pending/Failed) không đổi `color` mà đổi `emissive`.
Nhờ vậy vật thể giữ nguyên bản sắc màu loại tài nguyên, nhưng *phát sáng* theo tình trạng sức
khoẻ. Pod đỏ rực khi CrashLoop mà vẫn nhận ra là Pod.

**Nhãn tên:** `createLabelSprite()` (`ResourceMeshes.js:54-127`) — vẽ chữ vào `<canvas>` 512×128,
bọc thành `THREE.CanvasTexture` → `THREE.Sprite`. Có cache texture theo chuỗi text
(`_labelTextureCache`, dòng 52) nên trùng tên thì dùng lại.

```js
depthTest: false,        // dòng 119 — nhãn LUÔN vẽ đè lên mọi thứ
sizeAttenuation: true,
```

`depthTest: false` chính là nguyên nhân kỹ thuật của lỗi điều phối viên đo được ("nhãn chồng
lên nhau khi hai object gần nhau"): nhãn không bị vật thể che, và **không có bất kỳ bước
declutter/tránh va chạm nhãn nào** trong toàn bộ codebase. Hai pod cạnh nhau → hai nhãn đè lên
nhau, không cái nào nhường.

### 3.4 Pick / select / highlight

**Raycast (`ClusterRenderer.js:314-339`):**

```js
_performPick(isClick) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pickableObjects, true);
    if (intersects.length > 0) {
        let target = intersects[0].object;
        while (target.parent && !target.userData.resourceId) {   // leo ngược lên Group
            target = target.parent;
        }
        ...
    }
}
```

Mẫu chuẩn: raycast xuống mesh con, rồi **leo ngược cây cha** tới khi gặp node mang
`userData.resourceId`. Mỗi mesh con cũng được gán sẵn `resourceId` lúc tạo
(`ClusterRenderer.js:439`) để rút ngắn vòng lặp.

**Phân biệt click và drag (`ClusterRenderer.js:251-265`, `285-304`):** đo quãng đường chuột;
vượt 4px thì coi là drag và huỷ click. Kéo tài nguyên thì `controls.enabled = false` tạm thời,
raycast xuống một `THREE.Plane` mặt đất để lấy toạ độ thả (`_raycastGround`).

**Highlight (`ClusterRenderer.js:378-425`):** duyệt `group.traverse()`, đổi `mat.emissive` +
`emissiveIntensity`, và scale 1.08× khi selected. Bỏ qua mesh có `userData.isLabel`.

```
hover    → emissive 0x58a6ff, intensity 0.3
selected → emissive 0xffa657, intensity 0.5, scale ×1.08
```

**Lỗi hiệu năng nghiêm trọng (`ClusterRenderer.js:610-628`):**

```js
_animate() {
    this.frameId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    if (!this._didDrag) {
        this._performPick(false);      // ← RAYCAST TOÀN SCENE, MỖI FRAME, 60 lần/giây
    }
    ...
}
```

Họ raycast để dò hover **trong vòng lặp render**, không phải trong sự kiện `mousemove`, và
không throttle. Với `recursive = true` trên toàn bộ `pickableObjects`, chi phí tăng tuyến tính
theo số mesh. Cụm lớn → tụt frame. Chỗ ta thắng dễ.

**Lỗi nhỏ (`ClusterRenderer.js:635`):**

```js
group.position.y = baseY + Math.sin(time * 2 + id.charCodeAt(0)) * 0.08;
```

Pha dao động lấy từ **ký tự đầu của id**. Mọi pod có id bắt đầu bằng cùng một chữ cái sẽ nhấp
nhô **đồng pha tuyệt đối** — trông như hiệu ứng hỏng thay vì sinh động.

---

## 4. Định dạng level — schema tốt, bộ chấm thì không

### 4.1 Schema (`js/data/CampaignLevels.js`)

Mảng JS thuần, 20 phần tử, mỗi phần tử:

```js
{
  id: 1,
  title: 'Your First Pod',
  chapter: 1,
  chapterName: 'Foundations',
  description: '...',                        // đoạn giảng bài khá dài, chất lượng tốt
  objectives: [
    { type: 'deploy', kind: 'Pod', count: 1, label: '...' },
    { type: 'deploy', kind: 'Namespace', count: 1, label: '...' }
  ],
  startingResources: [
    { kind: 'Node', name: 'node-1', spec: { cpu: '4', memory: '8Gi', status: 'Ready' } }
  ],
  availableResources: ['Pod', 'Namespace'],  // giới hạn palette theo level
  incidents: [
    { type: 'CrashLoopBackOff', triggerTime: 10, target: 'web-app', severity: 2 }
  ],
  hints: [ '...', '...', '...' ],
  starCriteria: { time: 120, efficiency: 0.8, noFailures: true },
  nextLevel: 2,
  tutorial: { steps: [ { target: 'command-bar', text: '...' } ] }
}
```

**Điểm mạnh thật sự:** trường `description` viết rất tốt về mặt sư phạm — giải thích *cơ chế*
(vòng reconcile, backoff mũ, thứ tự evict theo QoS) chứ không chỉ liệt kê lệnh. Nội dung giảng
bài của họ là thứ đáng học nhất trong repo, hơn cả phần 3D.

**`starCriteria`** cho 3 sao theo thời gian / hiệu suất / không lỗi — mô hình đơn giản, hiệu quả.

### 4.2 Bộ chấm objective — điểm yếu kiến trúc lớn nhất của họ

`js/modes/CampaignMode.js:191-433` là **một câu `switch` khổng lồ với ~35 nhánh `case`**,
mỗi nhánh hardcode cách chấm một loại objective:

```js
updateObjectives() {
  for (const obj of this.objectiveProgress) {
    if (obj.completed) continue;                    // ← LATCH: đã xong thì không xét lại
    switch (obj.type) {
      case 'deploy':  ...
      case 'scale':   ...
      case 'resolve': ...
      /* ... 32 case nữa: coverage, complete, update, rollback, connect, serviceType,
         route, tls, isolate, allow, investigate, verify, mount, envFrom, noConfigMap,
         bound, headless, stable, resources, probes, hpa, leastPrivilege, reschedule,
         pdb, architectureScore ... */
    }
  }
}
```

Hệ quả: **thêm một kiểu objective mới = sửa mã của game mode.** Level không phải dữ liệu — nó
là dữ liệu chỉ *một nửa*, nửa còn lại nằm cứng trong code. Không thể có trình tạo bài, không
thể để cộng đồng đóng góp bài, không thể nạp bài từ file ngoài.

### 4.3 Bốn lỗi chấm điểm cụ thể (đọc ra từ mã, không suy đoán)

**(a) `resolve` bỏ qua hoàn toàn `incidentType`** — `CampaignMode.js:213-218`:

```js
case 'resolve': {
  const stats = this.incidentEngine.getStats();
  const resolved = stats.totalResolved;        // ← ĐẾM TỔNG, không lọc theo loại
  obj.current = Math.min(resolved, obj.target);
  obj.completed = obj.current >= obj.target;
}
```

`getStats()` (`IncidentEngine.js:491-492`) trả `total = this.resolvedIncidents.length` — tổng số
sự cố đã xử lý, bất kể loại. Level 4 ghi mục tiêu *"Diagnose and resolve the CrashLoopBackOff"*
nhưng **xử lý bất kỳ sự cố nào cũng tính là xong**. Trường `incidentType` trong dữ liệu level
được đọc vào nhưng chẳng bao giờ dùng.

**(b) `scale` chấm theo `spec` chứ không theo `status`** — `CampaignMode.js:205-211`:

```js
const scaled = deployments.find((d) => (d.spec?.replicas || 0) >= obj.replicas);
```

Người học được tính điểm vì **khai báo mong muốn** 3 replica, kể cả khi 0 pod chạy được. Với
Kubernetes thì đây là dạy ngược: toàn bộ bài học là spec ≠ status, và hệ thống hội tụ từ cái
này sang cái kia. Bộ chấm của họ dừng ở spec.

**(c) Objective bị latch, không bao giờ bỏ tick** — `CampaignMode.js:196`:

```js
if (obj.completed) continue;
```

Deploy 3 pod → tick xanh → xoá sạch 3 pod → vẫn xanh, vẫn qua level. Mục tiêu `uptime >= 95%`
cũng vô nghĩa vì chỉ cần chạm 95% một giây là latch vĩnh viễn.

**(d) `allow` chấm quá lỏng** — `CampaignMode.js:321-325`: mục tiêu là "cho phép luồng traffic
cụ thể", nhưng phép kiểm chỉ là `policies.length > 0` — có bất kỳ NetworkPolicy nào là đạt,
nội dung rule không được xét.

Ngoài ra `case 'rollback'` đọc `state._rollbackCount` — biến private gắn tạm vào ClusterState từ
bên ngoài (`CampaignMode.js:272`), một kiểu rò rỉ đóng gói.

### 4.4 Vòng cập nhật

`setInterval(() => this.update(), 1000)` (`CampaignMode.js:127`) — quét lại **toàn bộ** cụm mỗi
giây cho mọi objective, thay vì phản ứng theo sự kiện. Chi phí O(objective × tài nguyên) mỗi
giây, và độ trễ phản hồi tối đa 1 giây.

### 4.5 Challenges

Khớp phép đo tại chỗ của điều phối viên: `js/modes/ChallengeMode.js` — danh sách phẳng 10 bài,
mỗi bài chỉ có tên + mô tả + hạn giờ. **Không tag, không độ khó, không mã bài, không lọc/tìm
kiếm, không trình tạo bài, không bảng xếp hạng.** Đây không phải hệ thống bài tập kiểu OJ — nó
là 10 màn chơi tính giờ được viết cứng.

---

## 5. Terminal kubectl (`js/ui/CommandBar.js`, 1.231 dòng)

### 5.1 Bind phím `/`

`CommandBar.js:119-128`:

```js
_onGlobalKeydown(e) {
  if (e.key === '/' && !this.visible && !e.ctrlKey && !e.metaKey) {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // không cướp phím khi đang gõ ô khác
    e.preventDefault();
    this.show();
  } else if (e.key === 'Escape' && this.visible) {
    this.hide();
  }
}
```

Sạch sẽ, đáng bắt chước. Có kiểm `activeElement` để không cướp phím `/` khi người dùng đang gõ
vào input khác.

### 5.2 Parser — tách chuỗi bằng khoảng trắng, hết

`CommandBar.js:282-284`:

```js
const parts = raw.split(/\s+/);
const cmd = parts[0]?.toLowerCase();
const result = this._dispatch(cmd, parts.slice(1));
```

Không có tokenizer kiểu shell. **Không xử lý dấu nháy** — `label pod x app="my app"` sẽ vỡ.
Không có pipe, không redirect, không `--dry-run`, không `-o jsonpath`.

`_dispatch` là `switch` 16 nhánh (`CommandBar.js:298-316`). Tập lệnh hỗ trợ:

```
get  describe  logs  scale  delete  apply  create  run
label  rollout  drain  cordon  uncordon  top  exec  explain
```

**Thiếu:** `edit`, `patch`, `port-forward`, `wait`, `annotate`, `expose`, `set image`,
`auth can-i`, `taint`, `diff`, `kustomize`, `config`, `api-resources`, `proxy`.

Có bảng `KIND_ALIASES` (`CommandBar.js:13-42`) khá đầy đủ, ánh xạ `po/pods/pod → Pod` v.v.
Bảng đáng tham khảo — nhưng là dữ liệu thực tế về K8s, ta tự dựng được.

### 5.3 Bốn lỗi/giới hạn cụ thể của parser

**(a) Ngữ pháp cờ không nhất quán và chỉ chấp nhận một dạng.**

| Lệnh | Dòng | Chỉ nhận | kubectl thật còn nhận |
|---|---|---|---|
| `scale` | `:535` | `--replicas=3` | `--replicas 3` |
| `run` | `:671` | `--image=nginx` | `--image nginx` |
| `create` | `:621` | `--namespace foo` (dạng cách) | `--namespace=foo`, `-n foo` |

`scale` dùng `args.find(a => a.startsWith('--replicas='))` — dạng có khoảng trắng thì báo lỗi
usage. `create` thì ngược lại, chỉ nhận dạng khoảng trắng. Người học gõ đúng cú pháp kubectl
thật vẫn có thể bị từ chối.

**(b) Tài liệu trong game mâu thuẫn với parser.**

Ô nhập có nhãn tĩnh `$ kubectl` dựng sẵn trong DOM (`CommandBar.js:91`), nên người dùng chỉ gõ
phần sau. Nhưng **5 gợi ý trong CampaignLevels bảo người học gõ cả chữ `kubectl`**:

```js
// CampaignLevels.js:18
'Type "kubectl run my-pod --image=nginx" — this creates a Pod running the nginx container image'
```

Gõ đúng theo hướng dẫn → `parts[0] === 'kubectl'` → rơi vào `default:` →
`error: unknown command "kubectl"`. Không có chỗ nào strip tiền tố `kubectl` (đã grep toàn file:
10 lần xuất hiện chuỗi `kubectl`, tất cả đều là văn bản hiển thị hoặc thông báo usage). README
thì lại dùng dạng đúng (`get pods`) — tức tài liệu tự mâu thuẫn.

**(c) `kubectl apply -f` KHÔNG đọc YAML.** `CommandBar.js:585-590`:

```js
const filename = args[fFlag + 1];
let kind = 'Pod';
if (filename.includes('deploy')) kind = 'Deployment';
else if (filename.includes('svc') || filename.includes('service')) kind = 'Service';
else if (filename.includes('node')) kind = 'Node';
const name = filename.replace(/\.(yaml|yml|json)$/, '').replace(/^.*\//, '');
```

Kind được **đoán từ chuỗi tên file**. Không có hệ thống file, không có trình soạn manifest,
không có nội dung YAML nào được phân tích. `kubectl apply -f whatever.yaml` tạo ra một Pod tên
`whatever`.

**Đây là lỗ hổng sư phạm lớn nhất của cả sản phẩm.** Kỹ năng số một khi học Kubernetes là
**viết được manifest YAML**. Trong game của họ, người học không bao giờ gõ một dòng YAML nào.
YAML chỉ tồn tại ở chế độ *đọc* trong Inspector.

**(d) `rollout status` luôn báo thành công.** `CommandBar.js:738-740`:

```js
if (action === 'status') {
  return { error: false, message: `deployment "${name}" successfully rolled out` };
}
```

Chuỗi cứng, không đọc trạng thái thật. Trong khi đó danh mục sự cố của họ **có** kịch bản
"rollout stuck". Lệnh chẩn đoán quan trọng nhất cho đúng tình huống đó luôn nói dối rằng mọi
thứ ổn.

`exec` cũng chỉ là stub trả chuỗi `(simulated) exec into ...` (`CommandBar.js:850`) — không có
shell, không filesystem, không container thật.

---

## 6. Inspector Panel (`js/ui/InspectorPanel.js`)

4 tab: **Overview / YAML / Events / Describe** (`InspectorPanel.js:42-46`), chuyển tab bằng
event delegation trên `#inspector-tabs`.

Dữ liệu lấy trực tiếp từ object `ResourceBase` trong `ClusterState` — không có lớp API trung
gian, không snapshot. Panel đọc thẳng vào state đang sống.

**Sinh YAML — tự viết, và trộn lẫn markup (`InspectorPanel.js:305-326`):**

```js
_toYAML(obj, indent) {
  ...
  return `\n${prefix}<span class="text-sky-400">${this._escapeHTML(key)}</span>` +
         `<span class="text-white/30">:</span>${this._toYAML(val, indent + 1)}`;
}
```

Bộ serialize YAML thủ công **nhúng thẳng thẻ `<span>` tô màu vào chuỗi**. Hệ quả:

- Không dùng được thư viện YAML nào → không đảm bảo đúng chuẩn (không xử lý chuỗi đa dòng, ký
  tự đặc biệt, anchor, khoá cần trích dẫn).
- YAML và HTML dính nhau → **không copy ra được** dạng sạch, không round-trip.
- Chỉ đọc. Không có nút "sửa rồi apply".

Có `_escapeHTML()` (`:468-472`) dùng `div.textContent` — cách escape đúng. Escaping được áp cho
khoá/giá trị trong `_toYAML`, nên rủi ro XSS ở đường này được chặn.

Tab Describe (`:374`) dựng chuỗi giả lập output `kubectl describe` bằng `lines.push(...)` — mô
phỏng định dạng khá sát.

---

## 7. Hệ thống mô phỏng (`js/engine/SimulationTick.js`, 981 dòng)

**Đây là phần mạnh nhất của họ và là thứ đáng học nhất về mặt kỹ thuật.**

### 7.1 Vòng tick

`SimulationTick.js:43-86` — một pipeline controller chạy tuần tự, thứ tự cố định:

```js
tick(deltaTime) {
  this.cluster.startBatch();              // gom sự kiện, tránh bắn 1000 event lẻ

  this._tickNodes(dt);
  this._tickPodScheduling(dt);
  this._tickPodLifecycle(dt);
  this._tickContainerResources(dt);
  this._tickHealthChecks(dt);
  this._tickOOMKiller(dt);
  this._tickDeployments(dt);
  this._tickStatefulSets(dt);
  this._tickDaemonSets(dt);
  this._tickJobs(dt);

  if (this.tickCount % 10 === 0) this._tickCronJobs(dt);   // cron: 10 tick
  if (this.tickCount % 15 === 0) this._tickHPA(dt);        // HPA: 15 tick
  if (this.tickCount % 5  === 0) this._tickProbes(dt);     // probe: 5 tick

  this._tickQuotaEnforcement(dt);
  this._recordMetrics();
  if (this.enableChaos) this._tickChaos(dt);

  this.cluster.flushBatch();
}
```

**Đáng học:**
- `startBatch()/flushBatch()` gom thay đổi rồi bắn sự kiện một lần — tránh bão event.
- Tần suất khác nhau cho controller khác nhau (HPA 15 tick, probe 5 tick) — đúng tinh thần
  `--horizontal-pod-autoscaler-sync-period`.
- `tickRate` chỉnh được (`setTickRate`) → tua nhanh/chậm.

**Điểm yếu:** danh sách controller **viết cứng trong một hàm**. Không có cơ chế đăng ký
controller. Muốn thêm CRD/operator → sửa file 981 dòng này. Không có work queue riêng cho từng
controller, không informer/watch — tức không dạy được mô hình controller thật.

### 7.2 Scheduler — mô phỏng khá nghiêm túc

`SimulationTick.js:160-211`, đúng mô hình **filter → score** của kube-scheduler:

```js
// FILTER
if (!node.isConditionTrue('Ready')) continue;
if (!node.matchesSelector(nodeSelector)) continue;
if (untolerated.some(t => t.effect === 'NoSchedule')) continue;   // taint/toleration
if (alloc.cpu.available    < requested.cpu)    continue;
if (alloc.memory.available < requested.memory) continue;

// SCORE
const cpuScore = alloc.cpu.available / alloc.cpu.capacity;
const memScore = alloc.memory.available / alloc.memory.capacity;
const podCountPenalty = alloc.podCount * 0.05;
let score = (cpuScore + memScore) / 2 - podCountPenalty;

// nodeAffinity preferred → cộng weight/100
```

**Thiếu so với K8s thật:** chỉ xử lý `NoSchedule` (bỏ `NoExecute`, `PreferNoSchedule`); chỉ có
`preferredDuringScheduling` (không có `requiredDuringScheduling`); **không có
podAffinity/podAntiAffinity**; **không có topologySpreadConstraints**; không có
PriorityClass/preemption. Nghĩa là không dạy được bài "trải pod đều across zone" — một trong
những bài quan trọng nhất khi vận hành thật.

### 7.3 Deployment reconcile — chỉ một ReplicaSet, nên không có rolling update thật

`SimulationTick.js:452-520`:

```js
const replicaSets = this.cluster.selectByLabels('ReplicaSet', selector)...;
let currentRS = replicaSets[0];              // ← LUÔN CHỈ LẤY CÁI ĐẦU
if (!currentRS) { /* tạo mới */ }
...
deploy.status.updatedReplicas = totalPods.length;   // ← dòng 491: LUÔN = tổng
```

Rolling update thật tạo **ReplicaSet thứ hai** và dịch dần replica từ RS cũ sang RS mới theo
`maxSurge`/`maxUnavailable`. Ở đây chỉ có một RS duy nhất, và `updatedReplicas` được gán bằng
tổng số pod nên **luôn luôn "đã cập nhật xong"**. Kết quả:

- Không có `maxSurge`/`maxUnavailable` dù `strategy: RollingUpdate` nằm trong spec.
- Không có revision history thật → `rollout undo` chỉ bắn event, `rollout history` bịa ra một
  revision giả (`CommandBar.js:752`).
- Objective `case 'update'` (kiểm `updatedReplicas > 0`) trở thành **luôn đúng ngay lập tức**.

Phần còn lại có đủ: pod lifecycle theo phase, OOM killer, liveness/readiness probe, StatefulSet,
DaemonSet, Job, CronJob (có parse cron), HPA, ResourceQuota, chaos.

### 7.4 Sự cố

`js/data/IncidentDefs.js` (722 dòng) — 29 loại sự cố dạng dữ liệu, có `severity`, `category`.
`IncidentEngine.js` (553 dòng) quản lý vòng đời sự cố + `investigationProgress` (người chơi phải
"điều tra" trước khi sửa được). Mô hình điều tra-rồi-sửa là ý tưởng hay, đáng lấy.

---

## 8. Hiệu ứng

- `ConnectionLines.js` (199 dòng) — đường nối quan hệ sở hữu (Deployment→RS→Pod) và định tuyến
  Service→Pod theo label selector.
- `ParticleTraffic.js` (373 dòng) — hạt chạy dọc đường nối, mô phỏng luồng traffic.
- **Không có shader tự viết** — không `ShaderMaterial`, không `.glsl`. Toàn bộ hiệu ứng đến từ
  material tiêu chuẩn + emissive + tone mapping.
- **Không có thư viện post-processing** — không bloom, không SSAO, không outline pass. Cảm giác
  "phát sáng" chỉ là `emissive` + `ACESFilmicToneMapping`.
- Animation: `Math.sin` thủ công trong vòng render, không tween/easing library.

---

## 9. Tổng hợp điểm yếu — chỗ ta có thể hơn

### A. Sư phạm (nghiêm trọng nhất)

| # | Điểm yếu | Bằng chứng | Ta làm gì |
|---|---|---|---|
| A1 | **Người học không bao giờ viết YAML** | `CommandBar.js:585-590` đoán kind từ tên file | Trình soạn manifest thật (Monaco), validate schema, `apply` parse thật |
| A2 | Chấm theo `spec`, không theo `status` | `CampaignMode.js:207` | Chấm theo trạng thái hội tụ thật |
| A3 | Objective latch, xoá hết vẫn qua | `CampaignMode.js:196` | Đánh giá liên tục, có thể mất tick |
| A4 | `resolve` không phân biệt loại sự cố | `CampaignMode.js:213-218` + `IncidentEngine.js:491` | Lọc theo `incidentType` |
| A5 | `rollout status` luôn báo thành công | `CommandBar.js:739` | Đọc trạng thái thật |
| A6 | Không có hệ bài tập kiểu OJ | `ChallengeMode.js` — 10 bài phẳng | Mã bài, tag, độ khó, tìm kiếm, testcase, submission, leaderboard |

### B. Kiến trúc

| # | Điểm yếu | Bằng chứng | Ta làm gì |
|---|---|---|---|
| B1 | Objective là `switch` 35 nhánh viết cứng | `CampaignMode.js:191-433` | Objective là **dữ liệu** — DSL khai báo + interpreter chung |
| B2 | Controller viết cứng trong 1 hàm | `SimulationTick.js:49-70` | Registry controller, cho phép thêm CRD |
| B3 | Không có ReplicaSet thứ hai | `SimulationTick.js:459` | Rolling update thật, revision history thật |
| B4 | Không TypeScript, không test, không CI | không có `package.json`/`.github` | TS strict + Vitest + CI (ta đã có sẵn) |
| B5 | Phụ thuộc CDN lúc chạy | `index.html:24,44-51` | Bundle nội bộ; cụm của ta vốn không có internet |
| B6 | Tailwind CDN (bản dev, JIT trên trình duyệt) | `index.html:24` | Tailwind build-time (ta đã có) |
| B7 | State private bị chọc từ ngoài | `SimulationTick.js:7-8`, `CampaignMode.js:272`, `draw.html:518` | Encapsulation thật |
| B8 | **Hai bộ serialize YAML độc lập** | `InspectorPanel.js:305` và `draw.html:857` | Một thư viện YAML duy nhất |

### C. Hiệu năng & 3D

| # | Điểm yếu | Bằng chứng | Ta làm gì |
|---|---|---|---|
| C1 | **Raycast toàn scene mỗi frame** | `ClusterRenderer.js:620-622` | Raycast theo sự kiện chuột, hoặc GPU picking |
| C2 | Không instancing, không LOD | `ResourceMeshes.js` tạo geometry mới mỗi resource | `InstancedMesh` cho pod; LOD theo khoảng cách |
| C3 | Nhãn chồng nhau, không declutter | `ResourceMeshes.js:119` `depthTest:false` | Thuật toán tránh va chạm nhãn; ẩn theo mật độ |
| C4 | Pod nhấp nhô đồng pha | `ClusterRenderer.js:635` `id.charCodeAt(0)` | Hash id đầy đủ làm seed pha |
| C5 | Focus camera giật, không transition | `ClusterRenderer.js:647` | Bay mượt có easing |
| C6 | Không post-processing | không có `EffectComposer` | Bloom chọn lọc cho emissive, outline pass cho selection |
| C7 | Không GLTF, chỉ primitive | `ResourceMeshes.js` | Model có bản sắc riêng, giữ primitive làm fallback nhẹ |

### D. UX & a11y

| # | Điểm yếu | Bằng chứng | Ta làm gì |
|---|---|---|---|
| D1 | Canvas nuốt pointer-event của nút menu | điều phối viên đo tại chỗ | Quản lý z-index/pointer-events đúng |
| D2 | Hướng dẫn mâu thuẫn parser (`kubectl` prefix) | `CampaignLevels.js:18` vs `CommandBar.js:283` | Chấp nhận cả hai dạng |
| D3 | Ngữ pháp cờ không nhất quán | `CommandBar.js:535` vs `:621` | Tokenizer + parser cờ dùng chung |
| D4 | `body ... overflow-hidden select-none`, game 3D toàn màn | `index.html:53` | Chế độ 2D/danh sách thay thế |
| D5 | Không có bản thay thế cho screen reader | không `aria-live`, nhãn là texture | Cây tài nguyên dạng DOM có ARIA, điều hướng bàn phím |
| D6 | Mobile: chỉ `ONE: ROTATE, TWO: DOLLY_PAN` | `ClusterRenderer.js:100-103` | Layout cảm ứng riêng, nút thay phím tắt |
| D7 | Không i18n — 100% tiếng Anh | toàn bộ chuỗi hardcode | Ta cần tiếng Việt ngay từ đầu |
| D8 | Không lưu tiến độ phía server | dùng localStorage | Ta đã có tài khoản + DB |
| D9 | Dialog gốc `confirm()`/`alert()` | `draw.html:644, 826, 947` | Dialog trong hệ thiết kế |

### E. Nội dung

- Không có bài về Docker/container image, CI/CD, Helm, operator.
- Không có bài đo được bằng cụm thật — toàn bộ là mô phỏng trong trình duyệt.
  **Đây là lợi thế lớn nhất của ta:** ta có sandbox Kubernetes thật (Sysbox + kind).
  Họ mô phỏng kubectl; ta chạy kubectl thật. Game 3D của ta có thể là *lớp trực quan* đặt trên
  cụm thật, không phải một mô phỏng song song.

---

## 10. Những gì nên học nguyên vẹn (ý tưởng, không phải mã)

1. **Công thức ánh sáng + tone mapping** — ACESFilmic + exposure 1.2 + FogExp2 cùng màu nền +
   rim light màu thương hiệu. Rẻ, hiệu quả thị giác cao.
2. **Trạng thái nằm ở `emissive`, không ở `color`** — giữ bản sắc màu loại tài nguyên trong khi
   vẫn báo được sức khoẻ.
3. **OrbitControls damping 0.08 + kẹp polar angle + kẹp distance** — toàn bộ bí mật "mượt".
4. **`startBatch()/flushBatch()`** quanh vòng tick để gom sự kiện.
5. **Tần suất reconcile khác nhau cho controller khác nhau** (HPA 15 tick, probe 5 tick).
6. **Mô hình "điều tra rồi mới sửa được"** cho sự cố (`investigationProgress`).
7. **Chất lượng văn bản giảng bài** trong `description` mỗi level — giải thích cơ chế, không
   liệt kê lệnh.
8. **`starCriteria`** 3 sao theo thời gian/hiệu suất/không lỗi.
9. **Một renderer, hai sản phẩm** — Draw tái dùng nguyên `ClusterRenderer` của game (mục 12).
10. **Liên kết lưu bằng cặp chỉ số** khi serialize để chia sẻ (`draw.html:930-933`).

---

## 11. Trạng thái báo cáo

| Mục yêu cầu | Trạng thái |
|---|---|
| 1. Tìm + xác minh repo | ✅ xong |
| 2. Đọc mã nguồn | ✅ clone `--depth 1` vào scratchpad |
| 3a. Stack | ✅ xong |
| 3b. Kiến trúc scene 3D | ✅ xong |
| 3c. Terminal / parser kubectl | ✅ xong |
| 3d. Định dạng level/challenge + chấm điểm | ✅ xong |
| 3e. Inspector panel | ✅ xong |
| 3f. Hệ thống mô phỏng | ✅ xong |
| 3g. Asset/hiệu ứng | ✅ xong |
| 4. Điểm yếu | ✅ xong |
| 5. Giấy phép | ✅ xong |
| K8s Draw (`/draw`) | ✅ xong — mục 12 |
| Camera controls (ưu tiên cao) | ✅ xong — mục 3.2 + công thức ở mục 13 |

Không mục nào còn dở.

---

## 12. K8s Draw (`draw.html`, 1.046 dòng)

`vercel.json:3` rewrite `/draw` → `/draw.html`. Một class duy nhất `K8sDraw` (`draw.html:337`).

**Điểm quan trọng: Draw tái sử dụng nguyên engine của game** (`draw.html:285-287`):

```js
import { ClusterRenderer } from './js/rendering/ClusterRenderer.js';
import { ClusterState }    from './js/engine/ClusterState.js';
import { GameEngine }      from './js/engine/GameEngine.js';
```

Nên camera/ánh sáng/mesh/pick **giống hệt** game chính — cùng OrbitControls damping 0.08, cùng
ACESFilmic. Draw chỉ tắt phần game logic (không tick, không sự cố, không chấm điểm). Đây là
quyết định kiến trúc tốt: một renderer, hai sản phẩm.

### 12.1 Kéo-thả

Dùng **HTML5 Drag and Drop API gốc**, không thư viện (`draw.html:417-435`):

```js
palette.addEventListener('dragstart', (e) => {
  e.dataTransfer.setData('text/plain', item.dataset.resource);
  e.dataTransfer.effectAllowed = 'copy';
});
canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
canvas.addEventListener('drop', (e) => {
  const kind = e.dataTransfer.getData('text/plain');
  if (kind && VALID_KINDS.has(kind)) this.placeResource(kind, e.clientX, e.clientY);
});
```

Ba đường vào, đáng học vì bao phủ đủ thiết bị:

| Đường | Dòng | Hành vi |
|---|---|---|
| Kéo-thả chuột | `:429` | thả đúng vị trí con trỏ |
| Click palette | `:437` | đặt giữa màn hình |
| `touchstart`/`touchend` | `:447,452` | đặt tại điểm chạm (mobile) |

**Màn hình → toạ độ thế giới** (`draw.html:469`): `this.renderer.screenToGround(x, y)` — raycast
xuống `THREE.Plane` mặt đất. Vị trí lưu riêng trong `placedPositions` (Map uid → {x,z}).

`VALID_KINDS` (`:312`) = `new Set(Object.keys(RESOURCE_CLASSES_META))` — validate kind trước khi
tạo, kể cả khi nạp từ URL. Chống được việc chèn kind tuỳ ý qua hash.

### 12.2 Vẽ liên kết — mô hình modal hai click

`draw.html:630-641` (nút bật chế độ) + `:496-529` (xử lý click):

```js
if (!this.connectionSource) {
  this.connectionSource = pickedId;                       // click 1: chọn nguồn
  this.renderer._applyMeshEffect(mesh, 'selected');
  status.textContent = 'Click target resource to connect...';
} else {
  if (pickedId !== this.connectionSource) {
    this.customConnections.push({ from: this.connectionSource, to: pickedId });   // click 2
    this.syncConnections();
  }
  this.connectionSource = null;
}
```

Bật chế độ bằng nút `#btn-connect` → click nguồn → click đích. Raycast dùng đúng mẫu "leo cây
cha tới `userData.resourceId`" như game chính. Xoá bằng chuột phải (`:531-538`).

**Hạn chế:** liên kết **không có kiểu, không nhãn, không hướng ngữ nghĩa** — mọi cạnh đều như
nhau, không phân biệt "sở hữu" với "định tuyến tới". Không kéo-thả để nối (phải bật chế độ
trước). **Không có undo/redo** (grep `undo|redo` trong `draw.html` = 0 kết quả).

### 12.3 Export YAML

`draw.html:823-855`:

```js
const docs = resources.map(r => {
  const apiVersion = RESOURCE_CLASSES_META[r.kind]?.api || 'v1';
  const obj = { apiVersion, kind: r.kind,
                metadata: { name, namespace }, spec: r.spec || {} };
  if (labels) obj.metadata.labels = r.metadata.labels;
  return this.toYAML(obj);
});
const yaml = docs.join('---\n');
const blob = new Blob([yaml], { type: 'text/yaml' });
// ... <a download="k8s-architecture.yaml"> rồi .click()
```

Multi-doc YAML nối bằng `---`, `apiVersion` tra từ bảng `RESOURCE_CLASSES_META`, bỏ `status`
(đúng — manifest không nên có status). Tải về bằng Blob + thẻ `<a download>`.

**Lỗi thiết kế lớn nhất của Draw: liên kết đã vẽ KHÔNG đi vào YAML.**
`exportYAML()` chỉ duyệt `getAllResources()`; grep `customConnections` trong đoạn 823-855 = **0
kết quả**. Người dùng vẽ mũi tên Service → Deployment, nhưng YAML xuất ra có Service với selector
mặc định, không liên quan gì tới mũi tên vừa vẽ. **Sơ đồ và YAML là hai thứ rời nhau.**

Đây chính là chỗ ta thắng: liên kết phải *sinh ra* `spec.selector`, `ownerReferences`,
`ingress.rules.backend` tương ứng — vẽ xong là ra manifest chạy được.

**Vi phạm SSOT:** đây là **bộ serialize YAML thứ HAI** trong codebase (`draw.html:857`), độc lập
hoàn toàn với `InspectorPanel.js:305`. Hai hàm cùng nhiệm vụ, khác cách viết, khác đầu ra (một
cái nhúng HTML, một cái text thuần). Sửa lỗi YAML phải sửa hai chỗ.

### 12.4 Chia sẻ qua URL

`draw.html:936-949` (mã hoá) và `:951-962` (giải mã):

```js
const json = JSON.stringify(state);
const encoded = btoa(new TextEncoder().encode(json)
                      .reduce((s, b) => s + String.fromCharCode(b), ''));
const url = `${window.location.origin}/draw#${encoded}`;
navigator.clipboard.writeText(url)...
// giải mã:
const bytes = Uint8Array.from(atob(hash), c => c.charCodeAt(0));
const state = JSON.parse(new TextDecoder().decode(bytes));
```

Thủ thuật đáng học: `connections` lưu bằng **cặp chỉ số** (`uidToIdx`, `:930-933`) chứ không lưu
uid dài — gọn hơn nhiều. Toàn bộ trạng thái nằm trong fragment (`#`), tức **không bao giờ gửi
lên server** — riêng tư theo thiết kế.

**Hạn chế:** **không nén** (không deflate/gzip trước base64). JSON thô + base64 phình ~33%, nên
sơ đồ lớn vượt giới hạn URL và chỉ báo `alert('Architecture too large to share via URL...')`
(`:947`). Dùng `CompressionStream('deflate')` là giải quyết được — ta nên làm.

### 12.5 Các điểm yếu khác của Draw

- **Dialog gốc của trình duyệt**: `confirm()` (`:644`), `alert()` (`:826`, `:947`) — chặn luồng,
  không style được, lạc tông với phần UI còn lại.
- **Chọc vào private của renderer**: `this.renderer._applyMeshEffect(...)` (`:518, 525, 632`) —
  cùng kiểu rò rỉ đóng gói như `state._rollbackCount` bên CampaignMode.
- Không nhóm/khung namespace, không layer, không khoá vị trí.
- `autoLayout()` (`:988`) xếp theo tầng (Node/Workload/Network/Storage/RBAC) — cứng, không có
  thuật toán force-directed hay tránh chồng chéo cạnh.

---

## 13. Bản tóm công thức "mượt" để ta sao chép ngay

Chủ dự án nhấn mạnh chuột xoay/zoom của họ rất mượt. Toàn bộ công thức, không thiếu gì:

```js
// 1) Controls — three.js OrbitControls THUẦN, không tự viết  (ClusterRenderer.js:80-105)
controls.enableDamping  = true;      // ← yếu tố quyết định
controls.dampingFactor  = 0.08;      // nặng hơn mặc định 0.05 → cảm giác trôi, cao cấp
controls.rotateSpeed    = 0.8;
controls.zoomSpeed      = 1.2;       // zoom nhanh hơn xoay một chút
controls.panSpeed       = 0.8;
controls.minDistance    = 5;
controls.maxDistance    = 80;
controls.maxPolarAngle  = Math.PI / 2.1;   // chặn chui xuống dưới sàn
controls.minPolarAngle  = 0.1;             // chặn lật đúng đỉnh
controls.mouseButtons = { LEFT: ROTATE, MIDDLE: DOLLY, RIGHT: PAN };
controls.touches      = { ONE: ROTATE, TWO: DOLLY_PAN };

// 2) BẮT BUỘC gọi mỗi frame, nếu không damping không chạy  (ClusterRenderer.js:618)
controls.update();

// 3) Trần DPR — giữ framerate trên màn 4K  (ClusterRenderer.js:72)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 4) Tone mapping — thứ tạo cảm giác "xịn"  (ClusterRenderer.js:75-76)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// 5) Fog cùng màu nền — vật thể xa tan vào nền  (ClusterRenderer.js:54)
scene.fog = new THREE.FogExp2(0x0d1117, 0.006);
```

**Để hơn họ, thêm 4 thứ họ không có:**

1. **Bay mượt tới object khi chọn.** Họ gán cứng `controls.target.copy(pos)`
   (`ClusterRenderer.js:647`) → giật. Dùng `camera-controls` (yomotsu) với `smoothTime` +
   `fitToSphere`, hoặc tự tween target bằng easing.
2. **Bỏ raycast mỗi frame.** Họ raycast toàn scene 60 lần/giây (`ClusterRenderer.js:620-622`).
   Chuyển sang raycast trong `pointermove` (throttle theo rAF) → giải phóng ngân sách frame.
3. **Outline pass cho selection** thay vì đổi `emissive` + scale 1.08×. Viền sắc nét đọc rõ hơn
   nhiều, nhất là khi object nhỏ.
4. **Declutter nhãn.** Họ để `depthTest:false` và không tránh va chạm → nhãn chồng nhau. Ẩn nhãn
   theo mật độ màn hình + đẩy nhẹ vị trí khi va chạm.

Với r3f (nếu ta chọn React Three Fiber cho Next.js), tương đương là `@react-three/drei`:
`<OrbitControls makeDefault enableDamping dampingFactor={0.08} .../>`, `<Bounds>` cho
fit-to-object, và `@react-three/postprocessing` cho bloom/outline.
