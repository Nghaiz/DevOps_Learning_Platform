# Build từ ROOT của repo, không phải từ thư mục service:
#   docker build -f services/terminal-gateway/Dockerfile -t dlp/terminal-gateway .
# Lý do: go.work trỏ sang services/shared, nằm ngoài thư mục này.

FROM golang:1.26-alpine AS build
WORKDIR /src

COPY go.work go.work.sum* ./
COPY proto/gen/go/go.mod proto/gen/go/go.sum* ./proto/gen/go/
COPY services/shared/go.mod services/shared/go.sum* ./services/shared/
COPY services/orchestrator/go.mod services/orchestrator/go.sum* ./services/orchestrator/
COPY services/terminal-gateway/go.mod services/terminal-gateway/go.sum* ./services/terminal-gateway/
RUN go mod download all

COPY proto/gen/go ./proto/gen/go
COPY services/shared ./services/shared
COPY services/terminal-gateway ./services/terminal-gateway

ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/terminal-gateway \
      ./services/terminal-gateway/cmd/terminal-gateway

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /
COPY --from=build /out/terminal-gateway /terminal-gateway

USER 65532:65532
EXPOSE 8082
ENTRYPOINT ["/terminal-gateway"]
