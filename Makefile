# Makefile cho Linux/macOS và CI. Trên Windows (không có GNU make) dùng bản
# tương đương qua pnpm: `pnpm proto`, `pnpm proto:check`, `pnpm lint`, ...

.PHONY: help proto proto-lint proto-check proto-breaking install lint test test-ci build env-check repo-check install-hooks go-lint go-vet go-test go-build run-orchestrator run-gateway up down smoke clean

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

test-ci: ## Test TS với env của CI (tái tạo runner khi "xanh ở local, đỏ ở CI")
	@# --force: bỏ qua cache turbo. Không có nó thì lần chạy này trả CACHED của
	@# lần chạy với env khác và chứng minh được đúng con số không.
	@#
	@# LOẠI BỎ mọi credential GẮN VỚI TRẠNG THÁI ĐÃ LƯU ở máy bạn. Runner dựng DB
	@# mới tinh mỗi lần nên credential nào của nó cũng tự nhất quán; máy bạn thì
	@# không, và đè lên là hỏng theo kiểu đánh lạc hướng:
	@#   DATABASE_URL / REDIS_URL / POSTGRES_* / REDIS_*
	@#       → Postgres đã initdb bằng mật khẩu trong .env ⇒ mọi test đụng DB đỏ 28P01.
	@#   BETTER_AUTH_SECRET
	@#       → Better Auth mã hoá private key JWKS trong bảng `jwks` bằng secret
	@#         HIỆN TẠI. Đổi secret mà giữ nguyên hàng jwks cũ ⇒ "Failed to decrypt
	@#         private key" ở 5 test luật 6/7. (Đã dính thật lúc dựng target này.)
	@# Thứ cần tái tạo là DANH SÁCH BIẾN mà turbo (envMode STRICT) cho đi qua —
	@# không phải giá trị credential.
	node scripts/with-env.mjs .github/ci.env \
	  --except '^(DATABASE_URL|REDIS_URL|POSTGRES_|REDIS_|BETTER_AUTH_SECRET)' \
	  -- pnpm turbo run test --force

build: ## Build/typecheck TS
	pnpm turbo run build

env-check: ## Cổng drift env — code ↔ .env.example ↔ Helm ↔ CI
	node scripts/env-check.mjs

repo-check: ## Đối chiếu cấu hình repo GitHub với docs/env/04 (cần gh đã đăng nhập)
	node scripts/check-repo-settings.mjs

install-hooks: ## Cài git hook local (chặn push thẳng lên main)
	@# core.hooksPath thay vì copy vào .git/hooks: hook nằm trong git, sửa một
	@# chỗ là mọi bản clone nhận được — copy thì bản sao trôi đi trong im lặng.
	git config core.hooksPath scripts/git-hooks
	@chmod +x scripts/git-hooks/* 2>/dev/null || true
	@echo "Đã cài. Gỡ bằng: git config --unset core.hooksPath"

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

go-lint: ## golangci-lint mọi Go module (ép GOOS=linux — xem dưới)
	@# GOOS=linux, kể cả khi chạy trên Windows/macOS: golangci-lint chỉ đọc file
	@# thoả build tag của GOOS HIỆN TẠI, nên `client_unix.go` (//go:build unix)
	@# hoàn toàn vô hình với dev trên Windows — local báo "0 issues" trong khi CI
	@# (ubuntu) tìm ra 7 lỗi trong đúng file đó (run 31308495133). Dịch vụ nào
	@# cũng deploy lên Linux, nên GOOS=linux là thứ SỰ THẬT cần kiểm, và ép ở
	@# đây làm local == CI thay vì để mỗi người tự nhớ.
	@for dir in $(GO_MODULE_DIRS); do \
	  echo "--- lint $$dir (GOOS=linux)"; (cd "$$dir" && GOOS=linux golangci-lint run ./...) || exit 1; \
	done

## ---------- Dev infra ----------

up: ## Postgres + Redis
	docker compose up -d

down: ## Dừng Postgres + Redis (GIỮ named volume — data không mất)
	docker compose down

# Go KHÔNG tự nạp .env — `envx` chỉ đọc os.Getenv, và trong k8s biến đến từ
# Secret/Deployment chứ không từ file. Nạp bằng scripts/with-env.mjs thay vì thêm
# godotenv vào code: giữ đúng sự thật "prod không đọc file .env", không thêm
# dependency chỉ để tiện lúc dev.
#
# with-env.mjs, KHÔNG PHẢI `set -a; . ./.env`: sourcing đưa nội dung file cho
# shell THỰC THI, nên `FOO=$(lệnh)` trong file env sẽ chạy thật. Nó cũng hiểu sai
# giá trị có dấu cách hoặc dấu '#' — mà mật khẩu có ký tự đặc biệt là chuyện thật.
#
# Bản trước của target `smoke` gọi thẳng `go run ./cmd/dbsmoke` mà không nạp gì —
# RequireDataStores() không thấy DATABASE_URL nên nó LUÔN fail, kể cả khi
# services/orchestrator/.env đã có đủ.

run-orchestrator: ## Chạy orchestrator local (nạp services/orchestrator/.env)
	cd services/orchestrator && node ../../scripts/with-env.mjs .env -- go run ./cmd/orchestrator

run-gateway: ## Chạy terminal-gateway local (nạp services/terminal-gateway/.env)
	cd services/terminal-gateway && node ../../scripts/with-env.mjs .env -- go run ./cmd/terminal-gateway

smoke: ## Smoke hạ tầng dữ liệu qua CẢ hai client (TS + Go)
	pnpm --filter @devops-platform/web db:smoke
	cd services/orchestrator && node ../../scripts/with-env.mjs .env -- go run ./cmd/dbsmoke

clean: ## Xoá artifact build (KHÔNG đụng vào docker volume)
	rm -rf node_modules .turbo **/.turbo **/dist **/node_modules
