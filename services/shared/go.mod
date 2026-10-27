// Bootstrap dùng chung cho mọi Go service: đọc env, structured log, HTTP
// observability (/healthz + /metrics), vòng đời server.
//
// Tách ra vì cả orchestrator lẫn terminal-gateway đều cần y hệt, và bản sao thứ hai
// sẽ lệch ngay lần đầu ai đó sửa một bên (rules/code-conventions.md — No Duplicated Logic).
module github.com/Nghaiz/DevOps_Learning_Platform/services/shared

go 1.27.3

require github.com/prometheus/client_golang v1.25.0

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/client_model v0.6.3 // indirect
	github.com/prometheus/common v0.72.0 // indirect
	github.com/prometheus/procfs v0.22.0 // indirect
	golang.org/x/sys v0.49.0 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
)
