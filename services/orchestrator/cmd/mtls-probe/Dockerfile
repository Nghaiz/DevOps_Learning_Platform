# Image chẩn đoán mTLS — chạy TRONG cụm, không lên registry công khai.
#
#   docker build -f services/orchestrator/cmd/mtls-probe/Dockerfile -t dlp-mtls-probe:dev .
#
# Build từ ROOT của repo (cùng lý do với Dockerfile của orchestrator: go.work
# trỏ sang proto/gen/go và services/shared).
#
# CỐ Ý KHÔNG nằm trong ma trận CI: đây là công cụ đo, không phải thành phần
# chạy thường trực. Ship nó lên registry là mời một binary biết nói chuyện với
# cổng gRPC vào mọi môi trường — đúng thứ luật 10 không muốn có sẵn.
FROM golang:1.26.6-alpine AS build
WORKDIR /src

COPY go.work go.work.sum* ./
COPY proto/gen/go/go.mod proto/gen/go/go.sum* ./proto/gen/go/
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/orchestrator/go.mod services/orchestrator/go.sum* ./services/orchestrator/
COPY services/terminal-gateway/go.mod services/terminal-gateway/go.sum* ./services/terminal-gateway/

COPY proto/gen/go ./proto/gen/go
COPY services/shared ./services/shared
COPY services/orchestrator ./services/orchestrator
COPY services/terminal-gateway ./services/terminal-gateway

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
      -o /out/mtls-probe ./services/orchestrator/cmd/mtls-probe

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/mtls-probe /mtls-probe
USER 65532:65532
ENTRYPOINT ["/mtls-probe"]
