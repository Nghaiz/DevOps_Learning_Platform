# Image chẩn đoán vòng đời session — chạy TRONG cụm, không lên registry công khai.
#
#   docker build -f services/orchestrator/cmd/lifecycle-probe/Dockerfile -t dlp-lifecycle-probe:dev .
#
# Build từ ROOT của repo (cùng lý do với Dockerfile của orchestrator và
# mtls-probe: go.work trỏ sang proto/gen/go và services/shared).
#
# CỐ Ý KHÔNG nằm trong ma trận CI — cùng lý lẽ với mtls-probe: đây là công cụ
# đo, không phải thành phần chạy thường trực, và ship nó lên registry là mời một
# binary tạo/xoá được session của người khác vào mọi môi trường.
FROM golang:1.26-alpine AS build
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
      -o /out/lifecycle-probe ./services/orchestrator/cmd/lifecycle-probe

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/lifecycle-probe /lifecycle-probe
USER 65532:65532
ENTRYPOINT ["/lifecycle-probe"]
