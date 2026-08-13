// Command terminal-gateway cầu nối WebSocket ⇄ pod exec.
//
// 1.C-1: chín bước kiểm trước upgrade của docs/ws-terminal-protocol.md §3 đã
// chạy thật (Origin, subprotocol, cookie, JWT/JWKS, per-session authz hai vế,
// trạng thái, trần WS). Cầu exec vào pod là chặng 1.C-2.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/config"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/execroute"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/extend"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

const serviceName = "terminal-gateway"

// version được ghi đè lúc build: -ldflags "-X main.version=$(git describe --tags)".
var version = "dev"

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", serviceName, err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("nạp config: %w", err)
	}

	log, err := logging.New(os.Stdout, cfg.LogLevel, serviceName, version)
	if err != nil {
		return fmt.Errorf("dựng logger: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return fmt.Errorf("phân giải REDIS_URL: %w", err)
	}
	rdb := redis.NewClient(redisOpts)
	defer func() { _ = rdb.Close() }()

	// KHÔNG ping Redis lúc khởi động. Gateway phải lên được `Ready` để kubelet
	// thôi restart nó ngay cả khi Redis đang rollout — mất Redis là mất khả năng
	// mở phiên MỚI (handshake trả 500 ở bước f, có log rõ), không phải mất cả
	// tiến trình. Fail-fast đúng chỗ là ở config: thiếu hẳn REDIS_URL thì service
	// không có chế độ chạy hợp lệ nào, còn Redis tạm chết thì có.
	store := sessionstore.New(rdb)
	verifier := authz.NewVerifier(authz.NewJWKSCache(cfg.JWKSURL), cfg.TokenIssuer)

	// Hai mux, hai port. Admin (/healthz + /metrics) không ra internet; public chỉ
	// mang WS. Xem config.AdminAddr.
	obs := httpx.NewObservability(serviceName, version)
	met := metrics.New(obs.Registry)
	adminSrv := httpx.NewServer(cfg.AdminAddr, obs.Mux)

	// Đường tới orchestrator (D13/R13/R25, đóng ở 1.C-4).
	//
	// `NewClient` (không phải `Dial`) nên lời gọi này KHÔNG chặn: nối thật xảy ra
	// ở RPC đầu tiên. Gateway vì thế lên `Ready` được ngay cả khi orchestrator
	// đang rollout — cùng lý lẽ với việc không ping Redis lúc khởi động.
	//
	// ⚠ HỆ QUẢ CỦA `NewClient`: cert SAI cũng không lộ ở đây. Bắt tay TLS xảy ra
	// ở RPC đầu tiên, nên một CA lệch sẽ hiện ra dưới dạng heartbeat
	// `ExtendSession` hỏng chứ không phải lỗi lúc khởi động. Đó là lý do
	// `config.Load` phải kiểm ba file ĐỌC ĐƯỢC trước — nó là phép kiểm sớm duy
	// nhất còn lại.
	dialOpts, err := orchestratorDialOptions(cfg, log)
	if err != nil {
		return err
	}
	grpcConn, err := grpc.NewClient(cfg.OrchestratorGRPCAddr, dialOpts...)
	if err != nil {
		return fmt.Errorf("dựng client gRPC tới orchestrator: %w", err)
	}
	defer func() { _ = grpcConn.Close() }()

	extender := extend.New(orchestratorv1.NewSessionServiceClient(grpcConn), store, log, met)

	// Config RIÊNG cho đường stream — `Timeout` phải là 0, xem podexec.NewExecConfig.
	restCfg, clientset, err := podexec.NewExecConfig()
	if err != nil {
		return fmt.Errorf("dựng client Kubernetes cho exec: %w", err)
	}
	bridge := podexec.New(
		podexec.NewExecutorFactory(restCfg, clientset, cfg.ExecCommand),
		store.Alive,
		extender,
		log,
		met,
	)

	publicMux := http.NewServeMux()
	wsroute.Register(publicMux, wsroute.Deps{
		Log:             log,
		Verifier:        verifier,
		Sessions:        store,
		Bridge:          bridge,
		Metrics:         met,
		AllowedOrigins:  cfg.AllowedOrigins,
		MaxWSPerSession: cfg.MaxWSPerSession,
	})

	// Exec one-shot — nút "Check" của trụ cột Lessons (P2 / 2.C).
	//
	// Dùng CHUNG `restCfg`/`clientset` với đường terminal: một client, một ngân
	// sách QPS, một bộ cert. `Timeout: 0` của restCfg là đúng cho cả hai — trần
	// thời gian của lượt chấm do `cfg.ExecTimeout` áp qua context, tức nó cắt
	// đúng một lượt chạy chứ không cắt cả kết nối dùng chung.
	execroute.Register(publicMux, execroute.Deps{
		Log:      log,
		Verifier: verifier,
		Sessions: store,
		Runner: podexec.NewOneShotRunner(
			podexec.NewOneShotFactory(restCfg, clientset, cfg.ExecShell),
			cfg.ExecMaxOutput,
		),
		Metrics:        met,
		AllowedOrigins: cfg.AllowedOrigins,
		Timeout:        cfg.ExecTimeout,
	})
	// NewStreamingServer, không phải NewServer: phiên terminal sống hàng giờ và im
	// lặng hàng phút, ReadTimeout/WriteTimeout 30s sẽ cắt ngang từ P1.
	publicSrv := httpx.NewStreamingServer(cfg.PublicAddr, publicMux)

	adminErr := make(chan error, 1)
	go func() { adminErr <- httpx.ListenAndServe(ctx, log, adminSrv, cfg.ShutdownGrace) }()

	publicErr := make(chan error, 1)
	go func() { publicErr <- httpx.ListenAndServe(ctx, log, publicSrv, cfg.ShutdownGrace) }()

	// adminDone/publicDone chặn việc đọc lại một channel buffered đã cạn — đọc lại
	// sẽ treo vĩnh viễn.
	var runErr error
	adminDone, publicDone := false, false

	select {
	case err := <-adminErr:
		adminDone = true
		if err != nil {
			runErr = fmt.Errorf("admin server: %w", err)
		}
	case err := <-publicErr:
		publicDone = true
		if err != nil {
			runErr = fmt.Errorf("public server: %w", err)
		}
	case <-ctx.Done():
		log.Info("nhận tín hiệu dừng, đang shutdown")
	}

	stop()

	if !adminDone {
		if err := <-adminErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("admin shutdown: %w", err)
		}
	}
	if !publicDone {
		if err := <-publicErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("public shutdown: %w", err)
		}
	}
	if runErr != nil {
		return runErr
	}

	log.Info("đã dừng sạch")
	return nil
}

// orchestratorDialOptions dựng credentials cho kênh gRPC tới orchestrator.
//
// Tách thành hàm riêng chứ không viết inline ở call site: đây là seam mà 1.C-3
// đã hứa ("client gRPC của gateway đặt sau một seam nhận grpc.DialOption"), và
// nó là chỗ DUY NHẤT quyết định kênh này có mã hoá hay không — nên nó cũng là
// chỗ duy nhất phải đọc khi hỏi câu đó.
//
// Phía client, `permissive` và `require` cho ra CÙNG một cấu hình: cả hai trình
// client cert. Khác biệt nằm trọn ở server. Không có nhánh riêng cho hai nấc ở
// đây là ĐÚNG, không phải thiếu sót.
func orchestratorDialOptions(cfg *config.Config, log *slog.Logger) ([]grpc.DialOption, error) {
	if !cfg.MTLSMode.Enabled() {
		log.Warn("kết nối orchestrator KHÔNG mã hoá, không xác thực peer — GRPC_MTLS_MODE=off, xem R13/R25",
			slog.String("addr", cfg.OrchestratorGRPCAddr))
		return []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}, nil
	}
	tlsCfg, err := tlsx.ClientConfig(cfg.MTLSFiles, cfg.MTLSServerName)
	if err != nil {
		return nil, fmt.Errorf("dựng TLS cho kênh tới orchestrator (GRPC_MTLS_MODE=%s): %w", cfg.MTLSMode, err)
	}
	log.Info("kênh tới orchestrator dùng mTLS",
		slog.String("addr", cfg.OrchestratorGRPCAddr),
		slog.String("serverName", cfg.MTLSServerName),
		slog.String("mtlsMode", string(cfg.MTLSMode)))
	return []grpc.DialOption{grpc.WithTransportCredentials(credentials.NewTLS(tlsCfg))}, nil
}
