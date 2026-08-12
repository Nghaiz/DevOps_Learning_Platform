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
volume cho Secret mTLS. `defaultMode` 0400 chứ không phải mặc định 0644: private
key đọc được bởi mọi user trong container là đúng thứ `chmod 400` tồn tại để
chặn, và ở đây không có ai khác cần đọc nó.
*/}}
{{- define "platform.mtlsVolume" -}}
{{- if ne .Values.platform.grpcMtlsMode "off" }}
- name: mtls
  secret:
    secretName: {{ include "platform.mtlsSecretName" . }}
    defaultMode: 0400
{{- end }}
{{- end -}}
