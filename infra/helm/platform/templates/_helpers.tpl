{{/*
Tên chart — dùng cho label app.kubernetes.io/name.
*/}}
{{- define "platform.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{/*
Tiền tố tên resource + DNS Service. Đơn giản hoá thành .Release.Name (không nối
thêm tên chart): chart này chỉ deploy 1 release/namespace, nối thêm tên chart sẽ
ra "platform-platform" khi cài đúng như lệnh verify trong phase-0.md
(`helm upgrade --install platform infra/helm/platform ...`) — không có lợi gì mà
tên resource + DNS dài hơn không cần thiết.
*/}}
{{- define "platform.fullname" -}}
{{- .Release.Name -}}
{{- end -}}

{{/*
Tên Secret chứa credential của web. Mặc định là Secret do chart tạo
(templates/web-secret.yaml); `web.env.existingSecret` trỏ sang một Secret tạo
ngoài băng (sealed-secrets / External Secrets / kubectl create) — đường đi đúng
cho prod, vì lúc đó giá trị secret KHÔNG bao giờ đi qua `--set` (nằm lại trong
shell history, trong `helm get values`, và trong log CI).
*/}}
{{- define "platform.webSecretName" -}}
{{- .Values.web.env.existingSecret | default (printf "%s-web" (include "platform.fullname" .)) -}}
{{- end -}}

{{/*
Tên Secret chứa credential + URL của Postgres/Redis in-cluster. Cùng khuôn với
platform.webSecretName: `datastore.existingSecret` trỏ sang Secret tạo ngoài
băng cho prod, mặc định là Secret do chart tạo (templates/datastore-secret.yaml).
*/}}
{{- define "platform.datastoreSecretName" -}}
{{- .Values.datastore.existingSecret | default (printf "%s-datastore" (include "platform.fullname" .)) -}}
{{- end -}}

{{/*
Label chung cho MỌI resource của chart này.
*/}}
{{- define "platform.labels" -}}
app.kubernetes.io/name: {{ include "platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/*
Label đầy đủ + component riêng cho 1 service (web/orchestrator/gateway). Gọi:
  {{ include "platform.componentLabels" (dict "context" . "component" "web") }}
*/}}
{{- define "platform.componentLabels" -}}
{{ include "platform.labels" .context }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
Selector — Deployment.spec.selector KHÔNG được đổi qua các lần release (immutable
field), nên tách khỏi platform.labels: label đầy đủ có thể thêm version/chart về
sau, đổi giá trị đó làm selector vỡ nếu dùng chung. Chỉ giữ 3 khoá ổn định nhất.
Gọi giống platform.componentLabels ở trên.
*/}}
{{- define "platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "platform.name" .context }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
─── Helper cho platform-networkpolicy.yaml (P3/3.B) ──────────────────────────
Ba helper dưới đây sống ở ĐÂY chứ không cạnh chỗ dùng vì `define` không được
lồng trong khối `if`, mà cả platform-networkpolicy.yaml nằm trong
`if .Values.networkPolicy.platform.enabled`.

Selector "mọi pod CỦA RELEASE NÀY" — cố ý KHÔNG dùng podSelector rỗng ở các
policy allow. Rỗng sẽ cấp quyền cho cả pod lạ rơi vào namespace, tức tự tay vô
hiệu hoá AC-B2 (đối chứng âm: pod lạ KHÔNG được chạm datastore). Chỉ khối
default-deny mới dùng podSelector rỗng, và ở đó rỗng là đúng.
*/}}
{{- define "platform.netpolRelease" -}}
matchLabels:
  app.kubernetes.io/name: {{ include "platform.name" .context }}
  app.kubernetes.io/instance: {{ .context.Release.Name }}
{{- end -}}

{{/*
Selector MỘT component, dạng LabelSelector đầy đủ (có `matchLabels:`). Gọi:
  {{ include "platform.netpolComponent" (dict "context" . "component" "web") }}

⛔ TỒN TẠI ĐỂ CHẶN MỘT LỖI IM LẶNG, KHÔNG PHẢI ĐỂ GÕ ÍT HƠN.
`platform.selectorLabels` phát ra các dòng nhãn TRẦN, còn `podSelector` của
NetworkPolicy là một LabelSelector — nhãn phải nằm DƯỚI `matchLabels:`. Đặt
nhãn trần thẳng vào `podSelector:` vẫn qua được `helm lint` và vẫn được
apiserver NHẬN, vì field lạ trên kiểu có sẵn bị **prune trong im lặng** — kết
quả là `podSelector: {}`, tức policy CHỌN MỌI POD trong namespace thay vì đúng
một component. Một rule allow bị prune như thế thành rule cấp quyền cho tất cả;
một rule deny thì phủ luôn cả những pod không định phủ.
`kubectl get netpol -o yaml` in ra vẫn trông bình thường. Dùng helper này ở MỌI
`podSelector`, đừng gọi thẳng `platform.selectorLabels` trong NetworkPolicy.
*/}}
{{- define "platform.netpolComponent" -}}
matchLabels:
  {{- include "platform.selectorLabels" (dict "context" .context "component" .component) | nindent 2 }}
{{- end -}}

{{/*
Selector theo DANH SÁCH component — matchExpressions vì NetworkPolicy không có
phép OR nào khác. Gọi:
  {{ include "platform.netpolComponents" (dict "context" . "components" (list "web" "gateway")) }}
*/}}
{{/*
Nhãn VAI TRÒ của một namespace chứa pod sandbox. Phát ra ĐÚNG một cặp key: value,
dùng ở hai nơi phải khớp nhau tuyệt đối:
  · sandbox-namespace.yaml            — đóng nhãn lên namespace
  · registry-mirror-networkpolicy.yaml — namespaceSelector của ingress vào mirror

⛔ VÌ SAO KHÔNG CHỌN NAMESPACE THEO TÊN NỮA.
Bản trước viết thẳng `kubernetes.io/metadata.name: {{ .Values.sandbox.namespace }}`,
tức quyền vào mirror được cấp cho một CHUỖI TÊN chứ cho một vai trò. Hệ quả: mọi
namespace sandbox khác — namespace e2e, một lượt đo, một môi trường thứ hai trên
cùng cụm — bị cắt khỏi mirror, và triệu chứng KHÔNG nói ra điều đó. Pod lên
Running, netpol hợp lệ, `kubectl get netpol` trông bình thường; thứ duy nhất nhìn
thấy là `dockerd` trong pod báo `i/o timeout` tới IP mirror rồi rơi về
registry-1.docker.io, mà sandbox không có internet nên treo tiếp tới hết giờ.
Cái giá đó đã phải trả ít nhất hai lần: `docs/k8s-in-pod.md` §"Namespace đo"
khai một NetworkPolicy TẠM (`p7-measure-temp-allow-ingress`) chỉ để namespace đo
`dlp-p7` tới được mirror, kèm nghĩa vụ nhớ xoá nó sau; và namespace e2e
`dlp-e2e-p16` dính đúng chế độ đó ở P16 (lab.flow hết giờ vì setup dựng k3s con
không kéo nổi `rancher/k3s`).

Đây KHÔNG phải nới lỏng biên tin cậy. Trước: phải SỞ HỮU cái tên `dlp-sandbox`.
Sau: phải MANG được nhãn này. Cả hai đều là thao tác mức cluster-admin lúc tạo
namespace — pod sandbox không có RBAC nào trên đối tượng Namespace, nên không tự
cấp cho mình được. Đổi lại, hợp đồng thôi phụ thuộc vào một chuỗi tên duy nhất.

⛔ LÀ HẰNG SỐ TEMPLATE, KHÔNG PHẢI KHOÁ TRONG values.yaml — CỐ Ý.
Một `namespaceSelector.matchLabels` RỖNG KHÔNG khớp-không-gì; nó khớp MỌI
namespace. Nên nếu cặp nhãn này đến từ values, thì đúng một lần
`helm upgrade --reuse-values` (cờ đó không nạp key mới của values.yaml — xem
platform.mtlsFsGroup, repo này đã dính một lần) là đủ để render ra selector rỗng
và mở mirror cho toàn cụm, trong im lặng, với helm báo xanh. Hằng số trong
template không có key nào để đánh rơi.
*/}}
{{- define "platform.sandboxRoleLabel" -}}
platform.dlp/role: sandbox
{{- end -}}

{{- define "platform.netpolComponents" -}}
matchLabels:
  app.kubernetes.io/name: {{ include "platform.name" .context }}
  app.kubernetes.io/instance: {{ .context.Release.Name }}
matchExpressions:
  - key: app.kubernetes.io/component
    operator: In
    values:
      {{- range .components }}
      - {{ . }}
      {{- end }}
{{- end -}}

{{/*
Khối `to:` egress tới datastore. Hai hình thái tuỳ `datastore.enabled`:
  · true  → Postgres/Redis là pod trong cụm  ⇒ podSelector
  · false → dịch vụ quản lý ngoài cụm        ⇒ ipBlock từ
            networkPolicy.platform.datastoreExternalEgress

⛔ MỘT HELPER CHỨ KHÔNG PHẢI BA KHỐI CHÉP TAY — cùng lý lẽ với platform.mtlsEnv.
Ba nơi cần nó (web, orchestrator, migrate) phải đổi hình thái CÙNG LÚC khi
datastore chuyển vào/ra khỏi cụm; ba khối chép tay là ba cơ hội để một cái bị
quên, và cái bị quên sẽ render ra một rule KHÔNG BAO GIỜ KHỚP (podSelector trỏ
tới pod không tồn tại) — hợp lệ với apiserver, im lặng với người đọc.
*/}}
{{- /*
⛔ QUYẾT ĐỊNH THEO TỪNG STORE, KHÔNG THEO MỖI `datastore.enabled`.
Bản đầu chỉ rẽ nhánh trên `datastore.enabled`, và review đã chứng minh nó hỏng ở
một cấu hình hoàn toàn hợp lý: RDS ngoài cụm + Redis trong cụm, tức
`datastore.enabled=true` nhưng `datastore.postgres.enabled=false`. Lúc đó nhánh
"trong cụm" render một rule trỏ `podSelector: component=postgres` — mà KHÔNG CÓ
pod postgres nào tồn tại ⇒ rule KHÔNG BAO GIỜ khớp, hợp lệ với apiserver, im
lặng với người đọc, và web mất Better Auth. `migrate-job.yaml` đã tính đúng vị
từ này từ trước (`and datastore.enabled datastore.<store>.enabled`); ở đây dùng
lại đúng vị từ đó thay vì phát minh một cái lỏng hơn.
*/}}
{{- /*
⛔ PHÁT RA "true" HOẶC CHUỖI RỖNG — KHÔNG PHÁT RA "false".
`include` luôn trả về STRING, và trong template Go mọi chuỗi khác rỗng đều
TRUTHY — kể cả chuỗi "false". Bản đầu của helper này phát ra `false` và mọi
`{{ if include … }}` / `{{ if not (include …) }}` gọi nó đều đọc ra TRUE, nên ba
cổng chặn và hai policy ingress đều rẽ nhầm nhánh trong im lặng. Bộ thử vế-ngược
là thứ bắt được (cổng "postgres ngoài cụm" render được thay vì chết).
Chuỗi rỗng là giá trị falsey DUY NHẤT an toàn để trả về từ `include`.
*/}}
{{- define "platform.netpolStoreInCluster" -}}
{{- $ctx := .context -}}
{{- if eq .store "postgres" -}}
{{- if and $ctx.Values.datastore.enabled $ctx.Values.datastore.postgres.enabled }}true{{ end -}}
{{- else -}}
{{- if and $ctx.Values.datastore.enabled $ctx.Values.datastore.redis.enabled }}true{{ end -}}
{{- end -}}
{{- end -}}

{{- define "platform.netpolStorePort" -}}
{{- if eq .store "postgres" }}5432{{ else }}6379{{ end -}}
{{- end -}}

{{- define "platform.netpolDatastoreEgress" -}}
{{- $ctx := .context -}}
{{- range $store := .stores }}
{{- $port := include "platform.netpolStorePort" (dict "store" $store) -}}
{{- if include "platform.netpolStoreInCluster" (dict "context" $ctx "store" $store) }}
- to:
    - podSelector:
        {{- include "platform.netpolComponent" (dict "context" $ctx "component" $store) | nindent 8 }}
  ports:
    - protocol: TCP
      port: {{ $port }}
{{- else }}
{{- /* Ngoài cụm: chỉ lấy các endpoint khai đúng CỔNG của store này, để một
       entry Redis không vô tình mở đường tới cổng Postgres và ngược lại. */}}
{{- range $ctx.Values.networkPolicy.platform.datastoreExternalEgress }}
{{- if eq (toString .port) $port }}
- to:
    - ipBlock:
        cidr: {{ .cidr }}
  ports:
    - protocol: TCP
      port: {{ .port }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}
{{- end -}}


{{/*
Cổng CONTAINER (không phải Service port) của gateway/orchestrator — xem chú thích
đầu platform-networkpolicy.yaml. Đặt thành helper để NetworkPolicy và mọi nơi
khác dùng CÙNG một hằng số, và để CI có một tên cụ thể để đối chiếu với
`containerPort` trong deployment.
*/}}
{{- define "platform.gatewayPublicContainerPort" -}}8082{{- end -}}
{{- define "platform.gatewayAdminContainerPort" -}}8083{{- end -}}
{{- define "platform.orchestratorHttpContainerPort" -}}8081{{- end -}}
{{- define "platform.orchestratorGrpcContainerPort" -}}9090{{- end -}}

{{/*
platform.gatewayAdminOnService — vị từ DUY NHẤT trả lời "cổng admin 8083 của
gateway có lên Service không". Chuỗi rỗng = KHÔNG.

BỐN nơi phải đồng ý với nhau, nên phải là MỘT biểu thức:
  · gateway-service.yaml         port `admin` trên Service
  · platform-networkpolicy.yaml  khối 3 (egress của web) + khối 12b (ingress gateway)
  · web-deployment.yaml          `GATEWAY_METRICS_URL` tự suy ra
Bốn `if` viết rời là bốn cơ hội để MỘT NỬA của một cạnh biến mất trong im lặng —
và nửa mất đi thì không có gì đỏ: pod Running, helm xanh, chỉ `admin.health` báo
`reached:false` mà không chỉ ra nửa nào thiếu. Repo này đã dính đúng chế độ đó một
lần ở P13 (URL orchestrator trỏ đúng trong khi netpol khối 9 đóng).

`gateway.service.exposeAdminPort` — BA giá trị, không phải boolean:
  · 'auto' (mặc định) → lên Service KHI VÀ CHỈ KHI networkPolicy.platform.enabled
  · true              → lên Service; FAIL nếu netpol tắt
  · false             → không bao giờ lên Service

⛔ VÌ SAO NETPOL LÀ ĐIỀU KIỆN. `/metrics` KHÔNG có authz (`httpx.NewObservability`
gắn `promhttp` trần). Hai cấu hình cho hai hệ quả khác hẳn nhau:
  · netpol BẬT → khối 8 đã chọn trúng pod gateway kèm `policyTypes: Ingress`, nên
    ingress của pod đó ĐÃ bị thu về đúng danh sách rule (đúng cả khi denyEnabled
    còn false — xem đầu file netpol). NetworkPolicy chặn ở POD chứ không ở Service,
    nên thêm port lên Service KHÔNG mở thêm đường vào nào: nó chỉ ĐẶT TÊN cho một
    đường mà khối 12/12b mới là thứ quyết định ai đi được.
  · netpol TẮT → không gì thu hẹp ingress của gateway; port trên Service LÀ một tên
    DNS ổn định tới `/metrics` không xác thực cho mọi pod trong namespace.
    (`dlp_build_info` lộ version chính xác để tra CVE; `dlp_gateway_ws_active` và
    `go_goroutines` cho đếm số phiên đang chạy.)
Nên "an toàn hay không" KHÔNG phải thuộc tính của cái port — nó là thuộc tính của
CẶP (port, netpol). Buộc render theo netpol là viết cặp đó ra thành mã, thay vì
viết một chú thích rồi mong người sau đọc.

⛔ VÌ SAO MẶC ĐỊNH LÀ 'auto' CHỨ KHÔNG PHẢI một cờ opt-in bật bằng `--set`:
`infra/host/12-helm-deploy.sh` lọc values live bằng DANH SÁCH CHO PHÉP — chỉ mang
sang các subtree `ingress`/`networkPolicy`/`platform` cộng vài leaf `web.env.*`.
Khối `gateway:` thì git có khai, nên luật của script là "git thắng": một
`--set gateway.service.exposeAdminPort=true` sống đúng MỘT lượt deploy rồi bị bỏ
trong im lặng ở lượt sau, và trang quản trị tối trở lại mà không ai đổi gì.
`auto` không thêm khoá nào để bị bỏ — nó bám vào `networkPolicy`, subtree ĐÃ nằm
trong danh sách cho phép.
*/}}
{{- define "platform.gatewayAdminOnService" -}}
{{- $mode := .Values.gateway.service.exposeAdminPort -}}
{{- $netpol := (((.Values.networkPolicy).platform).enabled) -}}
{{- if kindIs "bool" $mode -}}
  {{- if $mode -}}
    {{- if not $netpol -}}
      {{- fail "[gateway:E-ADMIN-PORT-NO-NETPOL] `gateway.service.exposeAdminPort: true` nhưng `networkPolicy.platform.enabled` KHÔNG bật. Đưa cổng admin (8083) lên Service khi không có NetworkPolicy nghĩa là tạo một tên DNS ổn định tới `/metrics` KHÔNG CÓ AUTHZ cho MỌI pod trong namespace — `dlp_build_info` lộ version chính xác (tra CVE), `dlp_gateway_ws_active`/`go_goroutines` cho phép đếm số phiên đang chạy. Hỏng theo hướng NỚI LỎNG: helm xanh, pod xanh, không có gì đỏ để nhìn. Ba đường đi tiếp: (1) bật netpol nền tảng trong CÙNG lượt deploy — cần networkPolicy.platform.{enabled,apiServerEndpoints,nodeCidrs}; (2) để nguyên mặc định auto, chart tự mở cổng đúng lúc netpol bật và không mở khi netpol tắt; (3) đặt false rồi đọc metric gateway qua Prometheus (PodMonitor theo IP pod, khối 12) — `admin.health` khi đó báo nguồn gateway reached:false kèm lý do, đó là hành vi đúng chứ không phải hỏng." -}}
    {{- end -}}
    {{- if .Values.gateway.enabled -}}true{{- end -}}
  {{- end -}}
{{- else if eq (toString $mode) "auto" -}}
  {{- if and .Values.gateway.enabled $netpol -}}true{{- end -}}
{{- else -}}
  {{- fail (printf "[gateway:E-ADMIN-PORT-BAD-MODE] `gateway.service.exposeAdminPort` = %q không hợp lệ. Nhận đúng ba giá trị: auto (mặc định — theo networkPolicy.platform.enabled), true, false. Một giá trị lạ ở đây sẽ bị đọc thành \"không mở\" và trang quản trị tối vĩnh viễn mà không có gì báo, nên nó phải chết lúc render." (toString $mode)) -}}
{{- end -}}
{{- end -}}

{{/*
Tên Secret chứa CA + 3 cert mTLS gRPC (1.C-4).
*/}}
{{- define "platform.mtlsSecretName" -}}
{{- printf "%s-mtls" (include "platform.fullname" .) -}}
{{- end -}}

{{/*
Khối env mTLS cho MỘT service. Gọi:
  {{ include "platform.mtlsEnv" (dict "context" . "cert" "gateway") }}

`cert` là tiền tố key trong Secret: "server" (orchestrator), "gateway", "web".

⛔ MỘT HELPER CHỨ KHÔNG PHẢI BA KHỐI CHÉP TAY. Ba service phải nhìn thấy CÙNG
một `GRPC_MTLS_MODE` — đó là toàn bộ lý do trình tự permissive→require an toàn.
Ba khối chép tay là ba cơ hội để một cái bị quên lúc siết, và hậu quả của việc
quên (client chưa cert gặp server đã require) chính là chế độ hỏng mà ba nấc
sinh ra để tránh.
*/}}
{{- define "platform.mtlsEnv" -}}
- name: GRPC_MTLS_MODE
  value: {{ .context.Values.platform.grpcMtlsMode | quote }}
{{- if ne .context.Values.platform.grpcMtlsMode "off" }}
- name: GRPC_TLS_CERT_FILE
  value: /etc/dlp/mtls/{{ .cert }}.crt
- name: GRPC_TLS_KEY_FILE
  value: /etc/dlp/mtls/{{ .cert }}.key
- name: GRPC_TLS_CA_FILE
  value: /etc/dlp/mtls/ca.crt
{{- end }}
{{- end -}}

{{/*
volumeMount cho Secret mTLS. Rỗng khi mode=off.
*/}}
{{- define "platform.mtlsVolumeMount" -}}
{{- if ne .Values.platform.grpcMtlsMode "off" }}
- name: mtls
  mountPath: /etc/dlp/mtls
  readOnly: true
{{- end }}
{{- end -}}

{{/*
volume cho Secret mTLS. Gọi:
  {{ include "platform.mtlsVolume" (dict "context" . "cert" "gateway") }}

⛔ `items:` LÀ RANH GIỚI PHÂN QUYỀN, KHÔNG PHẢI TỐI ƯU.
Bản đầu mount NGUYÊN Secret vào cả ba pod, và điều đó **vô hiệu hoá chính phép
ghim CN** mà chương này dựng lên: pod `web` đứng trước internet, nên bất kỳ
đường đọc file tuỳ ý nào ở đó (path traversal, SSRF file://, RCE) cũng lấy được
`gateway.key` → dựng client cert CN=`platform-gateway` → qua allowlist →
`ReapSession` với `system_component` reap được session của bất kỳ ai. Ghim CN
chỉ có nghĩa khi khoá của gateway KHÔNG nằm trên đĩa của web. Đo được trên cụm
2026-08-12: `kubectl exec deploy/platform-web -- ls /etc/dlp/mtls/` liệt kê cả
`gateway.key`.

⛔ `defaultMode: 0440` + `fsGroup`, KHÔNG PHẢI 0400.
Cả ba image chạy non-root (Go uid 65532, web uid 1001). Không có `fsGroup` thì
kubelet để file `root:root`, và `0400` nghĩa là **không tiến trình nào trong pod
đọc được** — đo được trên cụm: cả hai pod Go CrashLoopBackOff với
`open /etc/dlp/mtls/server.crt: permission denied`, còn web thì lên `Ready` rồi
trả 500 ở mọi RPC (probe là httpGet nên k8s không thấy gì sai). `fsGroup` cho
kubelet chgrp volume về group đó và thêm nó vào supplementary group của
container; `0440` để nhóm đọc được mà vẫn không world-readable.
*/}}
{{- define "platform.mtlsVolume" -}}
{{- if ne .context.Values.platform.grpcMtlsMode "off" }}
- name: mtls
  secret:
    secretName: {{ include "platform.mtlsSecretName" .context }}
    defaultMode: 0440
    items:
      - key: ca.crt
        path: ca.crt
      - key: {{ .cert }}.crt
        path: {{ .cert }}.crt
      - key: {{ .cert }}.key
        path: {{ .cert }}.key
{{- end }}
{{- end -}}

{{/*
securityContext mức POD cho mTLS — `fsGroup` là thứ làm volume đọc được.
Xem giải thích ở platform.mtlsVolume.
*/}}
{{- define "platform.mtlsPodSecurityContext" -}}
{{- if ne .Values.platform.grpcMtlsMode "off" }}
{{- /*
  ⛔ `required` Ở ĐÂY LÀ BẮT BUỘC, KHÔNG PHẢI PHÒNG THỦ THỪA — và nó tồn tại vì
  một lượt deploy đã hỏng đúng như thế. `helm upgrade --reuse-values` dùng lại
  values ĐÃ TÍNH của release trước và **KHÔNG nạp key mới** thêm vào
  `values.yaml`. Nên `mtlsFsGroup` (key mới ở chặng này) là nil, template phát ra
  `fsGroup:` rỗng, Kubernetes đọc thành null và bỏ qua — pod lên với
  `securityContext: {}` và cert lại `root:root` không đọc nổi. Toàn bộ chuỗi đó
  IM LẶNG: `helm upgrade` xanh, manifest hợp lệ, chỉ pod CrashLoop với một
  thông báo nói về quyền file.
  Đường dùng đúng là `--reset-then-reuse-values` (nạp lại default của chart rồi
  mới đắp values người dùng lên).
*/}}
securityContext:
  fsGroup: {{ required "platform.mtlsFsGroup bắt buộc khi grpcMtlsMode≠off — nếu bạn vừa chạy `helm upgrade --reuse-values` thì đó là nguyên nhân: cờ đó KHÔNG nạp key mới của values.yaml. Dùng --reset-then-reuse-values." .Values.platform.mtlsFsGroup }}
{{- end }}
{{- end -}}
