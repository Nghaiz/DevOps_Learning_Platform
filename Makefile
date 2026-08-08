# Makefile cho Linux/macOS và CI. Trên Windows (không có GNU make) dùng bản
# tương đương qua pnpm: `pnpm proto`, `pnpm proto:check`, `pnpm lint`, ...

.PHONY: help proto proto-lint proto-check proto-breaking install lint test build go-lint go-vet go-test go-build up down smoke clean

help: ## Liệt kê target
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ---------- Contract (SSOT: proto/) ----------

proto: ## Regenerate type Go + TS từ proto/
	buf generate

proto-lint: ## Lint file .proto
	buf lint

proto-check: proto ## Drift gate — fail nếu generated khác committed
	@# `git status --porcelain`, KHÔNG phải `git diff`: git diff không thấy file
	@# untracked, nên thêm một .proto mới sinh ra file mới mà chưa commit sẽ lọt
	@# qua cổng — đúng cái nó sinh ra để chặn.
	@out="$$(git status --porcelain -- proto packages/shared-types/gen)"; \
	if [ -n "$$out" ]; then \
	  echo ""; echo "ERROR: code sinh ra khác bản đã commit:"; echo "$$out"; \
	  echo ""; echo "--- diff (100 dòng đầu — để CI khai đúng CÁI GÌ drift, không phải chỉ file nào):"; \
	  git diff -- proto packages/shared-types/gen | head -100; \
	  git diff --stat -- proto packages/shared-types/gen; \
	  echo ""; echo "Chạy 'make proto' rồi commit kết quả."; exit 1; \
	fi

# Baseline cho breaking-check. Mặc định là nhánh main — đúng cho máy dev và cho
# PR. CI khi push THẲNG lên main phải đè bằng BUF_BREAKING_AGAINST='.git#ref=HEAD~1'
# (so với main lúc đang Ở TRÊN main là tự so với chính mình = luôn xanh = cổng giả).
BUF_BREAKING_AGAINST ?= .git#branch=main

proto-breaking: ## Cổng chống breaking change của contract (so với baseline)
	@# buf.yaml khai `breaking: use: FILE` từ đầu P0 nhưng KHÔNG lệnh nào chạy nó
	@# — contract SSOT mà không có breaking-check là contract chỉ có trên giấy.
	@# P1 là phase mở rộng proto (thêm field pool/tier), nên cổng phải sống TRƯỚC
	@# lúc đó chứ không phải sau.
	buf breaking --against '$(BUF_BREAKING_AGAINST)'

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
