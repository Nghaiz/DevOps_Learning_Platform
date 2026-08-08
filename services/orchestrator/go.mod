module github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator

go 1.25.0

// go.work đủ cho `go build`, nhưng `go mod tidy` bỏ qua workspace và sẽ đi hỏi
// proxy tìm module chưa publish. replace giữ module này build được độc lập —
// và đó cũng là thứ Dockerfile dựa vào.
replace github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go => ../../proto/gen/go

replace github.com/Nghaiz/DevOps_Learning_Platform/services/shared => ../shared

require (
	github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go v0.0.0
	github.com/Nghaiz/DevOps_Learning_Platform/services/shared v0.0.0
	github.com/jackc/pgx/v5 v5.10.0
	github.com/redis/go-redis/v9 v9.22.0
	google.golang.org/grpc v1.82.1
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/prometheus/client_golang v1.24.1 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.70.1 // indirect
	github.com/prometheus/procfs v0.21.1 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/net v0.57.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.40.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260414002931-afd174a4e478 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
