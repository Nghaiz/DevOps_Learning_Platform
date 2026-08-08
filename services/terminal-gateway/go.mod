module github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway

go 1.26.5

// go.work đủ cho `go build`, nhưng `go mod tidy` bỏ qua workspace và sẽ đi hỏi
// proxy tìm module chưa publish. replace giữ module này build được độc lập —
// và đó cũng là thứ Dockerfile dựa vào.
replace github.com/Nghaiz/DevOps_Learning_Platform/services/shared => ../shared

require github.com/Nghaiz/DevOps_Learning_Platform/services/shared v0.0.0

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/client_golang v1.24.1 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.70.1 // indirect
	github.com/prometheus/procfs v0.21.1 // indirect
	golang.org/x/sys v0.47.0 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
