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
