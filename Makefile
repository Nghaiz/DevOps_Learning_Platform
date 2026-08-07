# Makefile cho Linux/macOS và CI. Trên Windows (không có GNU make) dùng bản
# tương đương qua pnpm: `pnpm proto`, `pnpm proto:check`, `pnpm lint`, ...

.PHONY: help proto proto-lint proto-check install lint test build go-lint go-vet go-test go-build up down smoke clean

help: ## Liệt kê target
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ---------- Contract (SSOT: proto/) ----------

proto: ## Regenerate type Go + TS từ proto/
	buf generate

proto-lint: ## Lint file .proto
	buf lint

proto-check: proto ## Drift gate — fail nếu generated khác committed
	@git diff --exit-code -- proto packages/shared-types/gen \
	  || (echo ""; echo "ERROR: code sinh ra khác bản đã commit. Chạy 'make proto' rồi commit kết quả."; exit 1)

## ---------- TypeScript ----------

install: ## Cài dependency workspace
	pnpm install --frozen-lockfile

lint: ## Lint TS
	pnpm turbo run lint

test: ## Test TS
	pnpm turbo run test

build: ## Build/typecheck TS
	pnpm turbo run build

## ---------- Go ----------

# `go build ./...` KHÔNG chạy được từ root: root không phải module, và trong chế độ
# workspace, Go từ chối pattern nằm ngoài mọi module ("directory prefix . does not
# contain modules listed in go.work"). Nên lặp qua từng module.
#
# Danh sách lấy thẳng từ go.work — thêm module mới vào go.work là đủ, không phải
# sửa Makefile (rules/code-conventions.md — Data-Driven Over Hardcoded).
GO_MODULE_DIRS := $(shell go list -m -f '{{.Dir}}' 2>/dev/null)

go-build: ## Build mọi Go module
	@for dir in $(GO_MODULE_DIRS); do \
	  echo "--- build $$dir"; (cd "$$dir" && go build ./...) || exit 1; \
	done

go-test: ## Test mọi Go module
	@for dir in $(GO_MODULE_DIRS); do \
	  echo "--- test $$dir"; (cd "$$dir" && go test ./...) || exit 1; \
	done

go-vet: ## go vet mọi Go module
	@for dir in $(GO_MODULE_DIRS); do \
	  echo "--- vet $$dir"; (cd "$$dir" && go vet ./...) || exit 1; \
	done

go-lint: ## golangci-lint mọi Go module
	@for dir in $(GO_MODULE_DIRS); do \
	  echo "--- lint $$dir"; (cd "$$dir" && golangci-lint run ./...) || exit 1; \
	done

## ---------- Dev infra ----------

up: ## Postgres + Redis
	docker compose up -d

down: ## Dừng Postgres + Redis (GIỮ named volume — data không mất)
	docker compose down

smoke: ## Smoke hạ tầng dữ liệu qua CẢ hai client (TS + Go)
	pnpm --filter @devops-platform/web db:smoke
	cd services/orchestrator && go run ./cmd/dbsmoke

clean: ## Xoá artifact build (KHÔNG đụng vào docker volume)
	rm -rf node_modules .turbo **/.turbo **/dist **/node_modules
