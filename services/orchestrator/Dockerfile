# Build từ ROOT của repo, không phải từ thư mục service:
#   docker build -f services/orchestrator/Dockerfile -t dlp/orchestrator .
# Lý do: go.work trỏ sang proto/gen/go và services/shared, cả hai nằm ngoài
# thư mục này nên build context phải là root.

FROM golang:1.27.1-alpine AS build
WORKDIR /src

# Copy manifest trước để layer tải dependency được cache lại giữa các lần build.
COPY go.work go.work.sum* ./
COPY proto/gen/go/go.mod proto/gen/go/go.sum* ./proto/gen/go/
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/orchestrator/go.mod services/orchestrator/go.sum* ./services/orchestrator/
COPY services/terminal-gateway/go.mod services/terminal-gateway/go.sum* ./services/terminal-gateway/
RUN go mod download all

COPY proto/gen/go ./proto/gen/go
COPY services/shared ./services/shared
COPY services/orchestrator ./services/orchestrator

ARG VERSION=dev
# CGO_ENABLED=0 + static: distroless/static không có libc để link động.
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/orchestrator \
      ./services/orchestrator/cmd/orchestrator

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/orchestrator /orchestrator

# nonroot (uid 65532) là mặc định của tag :nonroot; khai báo tường minh để
# thay đổi base image không âm thầm đưa container về chạy bằng root.
USER 65532:65532
EXPOSE 8081 9090
ENTRYPOINT ["/orchestrator"]
