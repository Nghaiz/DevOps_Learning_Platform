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
