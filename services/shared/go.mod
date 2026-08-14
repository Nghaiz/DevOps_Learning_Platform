// Bootstrap dùng chung cho mọi Go service: đọc env, structured log, HTTP
// observability (/healthz + /metrics), vòng đời server.
//
// Tách ra vì cả orchestrator lẫn terminal-gateway đều cần y hệt, và bản sao thứ hai
// sẽ lệch ngay lần đầu ai đó sửa một bên (rules/code-conventions.md — No Duplicated Logic).
module github.com/Nghaiz/DevOps_Learning_Platform/services/shared

go 1.26.6

require github.com/prometheus/client_golang v1.24.1

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.70.1 // indirect
	github.com/prometheus/procfs v0.21.1 // indirect
	golang.org/x/sys v0.47.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
