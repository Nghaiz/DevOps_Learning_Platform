// Command orchestrator chạy gRPC SessionService + HTTP observability.
//
// P0: contract đã khoá, RPC trả Unimplemented. Vòng đời pod thật ở P1.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/config"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/lifecycle"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/reaper"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/store"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

const (
	serviceName = "orchestrator"
	// Tên service gRPC đầy đủ, dùng cho health check theo-service.
	sessionServiceName = "orchestrator.v1.SessionService"
)

// version được ghi đè lúc build: -ldflags "-X main.version=$(git describe --tags)".
var version = "dev"

func main() {
	if err := run(); err != nil {
		// Logger có thể chưa dựng được (lỗi config), nên báo lỗi khởi động ra stderr thô.
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

	obs := httpx.NewObservability(serviceName, version)
	met := metrics.New(obs.Registry)

	// Warm-pool + lifecycle chỉ dựng được khi có Redis VÀ có đường tới K8s API.
	// Thiếu một trong hai thì server vẫn lên (health probe xanh, /metrics chạy)
	// nhưng ba RPC trả Unavailable với lý do rõ ràng — thay vì CrashLoop, thứ
	// che mất chính thông báo cần đọc.
	engine, err := buildSessionEngine(ctx, cfg, log, met)
	if err != nil {
		return err
	}
	// KHÔNG `defer engine.close()`: Redis phải đóng SAU khi warm-pool và reaper
	// đã dừng hẳn, và defer ở đây chạy trước cả bgWG.Wait() bên dưới lẫn sau nó
	// tuỳ vị trí — quá tinh tế để đúng do vô tình. Đóng tường minh ở cuối.

	grpcOpts := []grpc.ServerOption{
		grpc.UnaryInterceptor(grpcserver.NewAuthInterceptor(log, cfg.MTLSMode)),
		// Stream bị từ chối vì auth interceptor chỉ phủ unary — xem
		// NewStreamDenyInterceptor. Cả 5 RPC hiện tại đều unary nên dòng này
		// không đổi hành vi nào đang chạy; nó chặn hành vi TƯƠNG LAI.
		grpc.StreamInterceptor(grpcserver.NewStreamDenyInterceptor()),
	}
	if cfg.MTLSMode.Enabled() {
		// config.Load đã Validate() ba file, nên lỗi ở đây là lỗi NỘI DUNG file
		// (key không khớp cert, CA không phải PEM) chứ không phải file vắng mặt.
		// Trả lỗi thay vì log-rồi-chạy-tiếp: chạy tiếp nghĩa là cổng lên plaintext
		// trong khi env nói nó đang được bảo vệ.
		tlsCfg, err := tlsx.ServerConfig(cfg.MTLSFiles, cfg.MTLSMode)
		if err != nil {
			return fmt.Errorf("dựng TLS cho cổng gRPC (GRPC_MTLS_MODE=%s): %w", cfg.MTLSMode, err)
		}
		grpcOpts = append(grpcOpts, grpc.Creds(credentials.NewTLS(tlsCfg)))
		log.Info("cổng gRPC bật TLS",
			slog.String("mtlsMode", string(cfg.MTLSMode)),
			slog.Any("systemCNs", cfg.MTLSSystemCNs))
	}
	grpcSrv := grpc.NewServer(grpcOpts...)
	orchestratorv1.RegisterSessionServiceServer(grpcSrv,
		grpcserver.NewSessionService(log, engine.lifecycle, cfg.MTLSSystemCNs))

	// WaitGroup chứ không phải goroutine thả nổi: warm-pool có thể đang ở giữa
	// một lượt Provision (tạo pod → chờ Ready → công bố) lúc SIGTERM tới, và
	// reaper có thể đang giữa một vòng sweep. Đóng Redis dưới chân chúng nghĩa
	// là `publish()` lỗi ở giữa và pod vừa tạo bị bỏ lại — đúng chế độ rò khe
	// quota mà deleteAfterFailure sinh ra để chặn.
	var bgWG sync.WaitGroup
	runBackground := func(name string, fn func(context.Context) error) {
		bgWG.Add(1)
		go func() {
			defer bgWG.Done()
			if err := fn(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error("tiến trình nền dừng bất thường",
					slog.String("name", name), slog.String("err", err.Error()))
			}
		}()
	}
	if engine.pool != nil {
		runBackground("warm-pool", engine.pool.Run)
	}
	if engine.reaper != nil {
		runBackground("reaper", engine.reaper.Run)
	}

	// gRPC health service: probe của K8s cho cổng gRPC dùng cái này, không dùng /healthz.
	// Đăng ký CẢ service rỗng "" (mặc định của grpc_health_probe) lẫn tên service đầy
	// đủ, để probe cấu hình kiểu `grpc: {service: orchestrator.v1.SessionService}`
	// không nhận NotFound.
	healthSrv := health.NewServer()
	healthv1.RegisterHealthServer(grpcSrv, healthSrv)
	healthSrv.SetServingStatus("", healthv1.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus(sessionServiceName, healthv1.HealthCheckResponse_SERVING)

	// Reflection phơi toàn bộ API surface cho `grpcurl list`. Comment "tắt ở prod"
	// không phải cơ chế — mặc định TẮT, bật bằng env khi cần debug.
	if cfg.GRPCReflection {
		log.Warn("gRPC reflection ĐANG BẬT — chỉ dùng khi debug, không để ở prod")
		reflection.Register(grpcSrv)
	}

	listener, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen gRPC %s: %w", cfg.GRPCAddr, err)
	}

	grpcErr := make(chan error, 1)
	go func() {
		log.Info("gRPC server đang lắng nghe", slog.String("addr", cfg.GRPCAddr))
		grpcErr <- grpcSrv.Serve(listener)
	}()

	httpSrv := httpx.NewServer(cfg.HTTPAddr, obs.Mux)

	httpErr := make(chan error, 1)
	go func() {
		httpErr <- httpx.ListenAndServe(ctx, log, httpSrv, cfg.ShutdownGrace)
	}()

	// httpDone theo dõi việc httpErr đã được đọc chưa. Đọc lại một channel buffered
	// đã cạn sẽ treo vĩnh viễn — chính là deadlock lúc shutdown.
	var runErr error
	httpDone := false

	select {
	case err := <-grpcErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			runErr = fmt.Errorf("gRPC server: %w", err)
		}
	case err := <-httpErr:
		httpDone = true
		if err != nil {
			runErr = fmt.Errorf("http server: %w", err)
		}
	case <-ctx.Done():
		log.Info("nhận tín hiệu dừng, đang shutdown")
	}

	// Lật health sang NOT_SERVING TRƯỚC khi đóng listener. Endpoints controller cần
	// vài trăm ms tới vài giây để rút pod khỏi Service; trong khoảng đó pod vẫn nhận
	// kết nối mới. Báo not-serving sớm để LB ngừng gửi, thay vì trả RST/502.
	healthSrv.SetServingStatus("", healthv1.HealthCheckResponse_NOT_SERVING)
	healthSrv.SetServingStatus(sessionServiceName, healthv1.HealthCheckResponse_NOT_SERVING)

	// stop() huỷ ctx, đó là tín hiệu để httpx.ListenAndServe shutdown mềm.
	stop()

	// GracefulStop chặn VÔ THỜI HẠN nếu còn RPC đang chạy (P1 sẽ có call K8s API
	// treo được). Quá grace thì Stop() cắt cứng — thà mất một RPC còn hơn bị SIGKILL
	// và mất luôn cơ hội trả pod về pool.
	forceStop := time.AfterFunc(cfg.ShutdownGrace, func() {
		log.Warn("gRPC shutdown mềm hết hạn, dừng cưỡng bức",
			slog.Duration("grace", cfg.ShutdownGrace))
		grpcSrv.Stop()
	})
	grpcSrv.GracefulStop()
	forceStop.Stop()

	if !httpDone {
		if err := <-httpErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("http shutdown: %w", err)
		}
	}

	// Chờ warm-pool VÀ reaper dứt hẳn TRƯỚC khi đóng Redis. Cả hai có thể đang
	// giữa một lượt thao tác pod; đóng client dưới chân chúng làm lượt ghi lỗi ở
	// giữa và pod vừa tạo bị bỏ lại trên cluster. ctx đã huỷ ở stop() nên cả hai
	// vòng lặp thoát ở lượt select kế tiếp.
	bgWG.Wait()
	engine.close()

	if runErr != nil {
		return runErr
	}

	log.Info("đã dừng sạch")
	return nil
}

// buildSessionEngine dựng Redis + client K8s + warm-pool + lifecycle.
//
// Trả (nil, nil, no-op, nil) khi REDIS_URL chưa đặt: server vẫn phục vụ
// /healthz và /metrics, còn ba RPC session trả Unavailable kèm lý do. Đó là chế
// độ hỏng ỒN ÀO NHƯNG SỐNG — CrashLoop ở đây khiến pod restart liên tục và
// thông báo cần đọc bị cuộn mất trong log của các lần restart trước.
//
// Ngược lại, khi REDIS_URL CÓ đặt thì mọi lỗi đều là lỗi cứng: đã khai ý định
// nối datastore thì nối không được là sự cố, không phải chế độ chạy.
// sessionEngine gom mọi thành phần cần Redis/K8s lại.
//
// Struct thay vì tuple nhiều giá trị: hàm dựng đã mọc từ 3 lên 5 thứ phải trả
// về, và một tuple dài là chỗ để hoán vị nhầm hai giá trị cùng kiểu func().
type sessionEngine struct {
	// lifecycle nil khi REDIS_URL trống — grpcserver xử lý nil bằng Unavailable.
	lifecycle grpcserver.Lifecycle
	pool      *pool.Manager
	reaper    *reaper.Reaper
	// close đóng mọi kết nối. Luôn khác nil, kể cả ở chế độ degrade.
	close func()
}

func buildSessionEngine(
	ctx context.Context,
	cfg *config.Config,
	log *slog.Logger,
	met *metrics.Metrics,
) (sessionEngine, error) {
	degraded := sessionEngine{close: func() {}}

	if cfg.RedisURL == "" {
		log.Warn("REDIS_URL trống — warm-pool, reaper và 3 RPC session TẮT; server chỉ phục vụ health/metrics")
		return degraded, nil
	}

	rdb, err := store.NewRedis(ctx, cfg.RedisURL)
	if err != nil {
		return degraded, fmt.Errorf("nối Redis: %w", err)
	}
	closers := []func(){func() { _ = rdb.Close() }}
	closeAll := func() {
		for i := len(closers) - 1; i >= 0; i-- {
			closers[i]()
		}
	}

	clientset, err := k8s.NewClientset()
	if err != nil {
		closeAll()
		return degraded, fmt.Errorf("dựng client Kubernetes: %w", err)
	}
	pods := k8s.NewPodClient(clientset, cfg.SandboxNamespace)

	mgr := pool.NewManager(rdb, pods, k8s.PodConfig{
		Namespace:        cfg.SandboxNamespace,
		Image:            cfg.SandboxImage,
		RuntimeClassName: cfg.SandboxRuntimeClass,
		RegistryMirror:   cfg.SandboxRegistryMirror,
	}, cfg.PoolTarget, log, met)

	// Postgres là TUỲ CHỌN ở giai đoạn này: chỉ audit (B8) dùng nó, và không
	// đường session nào ĐỌC nó. Thiếu DATABASE_URL ⇒ audit tắt kèm cảnh báo,
	// chứ không chặn cả engine — ép một biến chưa ai đọc chỉ tạo thói quen bỏ
	// qua thông báo lỗi.
	var auditDB lifecycle.AuditDB
	if cfg.DatabaseURL == "" {
		log.Warn("DATABASE_URL trống — audit sessions_audit TẮT. Session vẫn chạy; nhật ký vòng đời thì không.")
	} else {
		pgPool, pgErr := store.NewPostgres(ctx, cfg.DatabaseURL)
		if pgErr != nil {
			closeAll()
			return degraded, fmt.Errorf("nối Postgres cho audit: %w", pgErr)
		}
		auditDB = pgPool
		closers = append(closers, pgPool.Close)
	}

	svc, err := lifecycle.NewService(rdb, mgr, pods, auditDB, lifecycle.Config{
		Namespace:     cfg.SandboxNamespace,
		SessionTTL:    cfg.SessionTTL,
		HardCap:       cfg.HardCap,
		ExtendDefault: cfg.ExtendDefault,
	}, log, met)
	if err != nil {
		closeAll()
		// Cấu hình mâu thuẫn là lỗi CỨNG lúc khởi động, không phải chế độ chạy:
		// để nó qua thì mọi probe xanh trong khi 100% CreateSession thất bại.
		return degraded, err
	}

	// Số DB phải là ĐÚNG DB client đang dùng: kênh keyspace mang số DB trong
	// tên (`__keyevent@N__:expired`), và SUBSCRIBE vào kênh sai vẫn THÀNH CÔNG —
	// chỉ là không bao giờ có event nào tới. Lấy từ chính options của client
	// thay vì đọc lại URL, để hai nơi không thể lệch.
	// `cfg.SandboxImage` đi vào CẢ pool.Manager (để DỰNG pod) lẫn reaper (để biết
	// pod ấm nào đã LỆCH image — tầng 4). Một nguồn, hai người đọc: không phải
	// hằng số thứ hai, vì cả hai nhận cùng một giá trị từ cùng một config.Load.
	rp := reaper.New(rdb, pods, svc, cfg.SandboxImage, rdb.Options().DB, cfg.ReapInterval, log, met)

	log.Info("engine session bật",
		slog.Int("pool_target", cfg.PoolTarget),
		slog.String("namespace", cfg.SandboxNamespace),
		slog.String("image", cfg.SandboxImage),
		slog.String("runtime_class", cfg.SandboxRuntimeClass),
		slog.Duration("session_ttl", cfg.SessionTTL),
		slog.Duration("hard_cap", cfg.HardCap),
		slog.Duration("extend_default", cfg.ExtendDefault),
		slog.Duration("reap_interval", cfg.ReapInterval),
		slog.Bool("audit_bat", auditDB != nil),
		slog.String("mtls_mode", string(cfg.MTLSMode)))

	return sessionEngine{lifecycle: svc, pool: mgr, reaper: rp, close: closeAll}, nil
}
