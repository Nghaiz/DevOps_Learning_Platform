// Module chứa code sinh từ proto/ — dùng chung cho mọi Go service.
// go.mod này viết tay (buf.gen.yaml không bật `clean`, nên nó không bị xoá).
module github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go

go 1.26.6

require (
	google.golang.org/grpc v1.83.2
	google.golang.org/protobuf v1.36.12
)

require (
	golang.org/x/net v0.58.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260526163538-3dc84a4a5aaa // indirect
)
