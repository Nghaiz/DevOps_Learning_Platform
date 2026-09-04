// Package config đọc cấu hình orchestrator từ biến môi trường.
package config

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/api/resource"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// Config là toàn bộ cấu hình runtime của orchestrator.
type Config struct {
	GRPCAddr string
	HTTPAddr string
	LogLevel string

	// GRPCReflection mặc định false. Reflection phơi toàn bộ API surface cho
	// `grpcurl list` — tiện lúc dev, là do thám miễn phí ở prod.
	GRPCReflection bool

	// RedisURL rỗng ⇒ warm-pool và 3 RPC session TẮT (server vẫn phục vụ
	// /healthz + /metrics, RPC trả Unavailable kèm lý do). Chọn degrade thay vì
	// CrashLoop có chủ ý: pod restart liên tục làm chính thông báo cần đọc bị
	// cuộn mất trong log của các lần restart trước.
	//
	// DatabaseURL CHƯA được ép ở giai đoạn này: audit Postgres là B8, và chưa
	// code nào trong đường session đọc nó. Ép một biến không ai dùng chỉ tạo
	// thói quen bỏ qua thông báo lỗi. B8 sẽ siết.
	DatabaseURL string
	RedisURL    string

	SessionTTL       time.Duration
	ShutdownGrace    time.Duration
	SandboxNamespace string

	// HardCap là trần TUYỆT ĐỐI của một session, tính từ created_at và KHÔNG
	// gia hạn được (D11). Nó chặn `ttl_seconds` do client gửi ở CreateSession,
	// và B5 sẽ dùng đúng con số này cho ExtendSession — hai đồng hồ, một trần.
	HardCap time.Duration

	// PoolTarget là số pod ấm giữ sẵn trong `pool:free`.
	//
	// ⛔ CÔNG THỨC PHẢI NHỚ (D16): trần session đồng thời = quota_hiệu_lực −
	// PoolTarget. Trên lab quota hiệu lực đo được là 4 pod, nên PoolTarget=3
	// phục vụ đúng MỘT user rồi replenish chết vĩnh viễn vì quota. Mặc định 1.
	PoolTarget int

	// SandboxImage là image của pod sandbox.
	//
	// Mặc định `pause` vì 1.E chưa đẩy images/sandbox-base lên ghcr: pool, VAP,
	// quota và số đo claim < 1s đều kiểm được mà không cần image thật. Đổi bằng
	// env khi 1.E merge — KHÔNG phải sửa code.
	SandboxImage string

	// ExtendDefault là khoảng đẩy thêm khi gateway gửi `extend_seconds = 0`
	// (D11: 300s).
	//
	// ⚠ CON SỐ NÀY THỰC TẾ QUYẾT ĐỊNH HẠN CỦA SESSION, không phải SESSION_TTL:
	// công thức B5 là `expires_at = min(now + extend, created_at + HARD_CAP)`,
	// nên ngay từ lần gia hạn ĐẦU TIÊN hạn sẽ bám theo biến này. SESSION_TTL chỉ
	// là hạn cho tới heartbeat đầu.
	ExtendDefault time.Duration

	// ReapInterval là nhịp sweep định kỳ của reaper (B7).
	//
	// Sweep là ĐƯỜNG CHÍNH, không phải đường dự phòng: keyspace notification là
	// best-effort và mất event khi reaper offline là mất pod vĩnh viễn.
	ReapInterval time.Duration

	// MTLSMode là ba nấc xác thực client trên cổng gRPC (1.C-4, đóng R25/B0′).
	//
	// Bản trước là một cờ bool và nó KHÔNG bật được: từ `false` sang `true` là
	// một bước nhảy mà giữa chừng mọi RPC trả `Unauthenticated` — nên `config.Load`
	// phải từ chối khởi động khi bật, và cờ nằm đó không ai dám động. Ba nấc tồn
	// tại để có một trạng thái GIỮA quan sát được: `permissive` cấp TLS cho server
	// và cert cho mọi client, nhưng chưa bắt buộc; chỉ khi ĐO được cả hai consumer
	// đang trình cert mới sang `require`.
	//
	// Khi `off`, nhánh `system_component` của ReapSession bị TỪ CHỐI (fail-closed).
	MTLSMode tlsx.Mode

	// MTLSFiles là cert/key/CA của cổng gRPC. Rỗng khi MTLSMode=off.
	MTLSFiles tlsx.Files

	// MTLSSystemCNs là allowlist CommonName được dùng nhánh `system_component`.
	//
	// ⛔ VÌ SAO KHÔNG PHẢI "CÓ CERT LÀ ĐỦ". Interceptor chỉ kiểm chuỗi cert verify
	// được, mà CA của ta ký cert cho CẢ apps/web LẪN gateway — nên "có cert hợp lệ"
	// gộp hai consumer có quyền khác nhau vào một. Cụ thể: apps/web sẽ reap được
	// session của BẤT KỲ ai qua nhánh system_component, trong khi việc của nó chỉ
	// là reap phiên của chính người đang đăng nhập (nhánh user_id). mTLS không ghim
	// CN thì chặn được kẻ ngoài nhưng không phân quyền được giữa hai người trong.
	MTLSSystemCNs []string

	// SandboxRuntimeClass PHẢI khớp `sandbox.runtimeClassName` trong Helm
	// values. Lệch một chữ là ValidatingAdmissionPolicy từ chối MỌI pod, và
	// triệu chứng là "warm-pool không bao giờ đầy" chứ không phải một lỗi trỏ
	// về đây.
	SandboxRuntimeClass string

	// SandboxRegistryMirror là URL mirror docker.io trong cụm (P3/3.I). Truyền
	// xuống pod sandbox qua env `DLP_REGISTRY_MIRROR`. RỖNG = KHÔNG cấu hình
	// mirror (hành vi hôm nay). KHÔNG có default và KHÔNG fail-fast khi rỗng:
	// khác `SANDBOX_IMAGE` — rỗng ở đây là một trạng thái HỢP LỆ (cụm chưa bật
	// mirror), còn image rỗng thì pod không dựng được. Ép một biến tuỳ chọn là
	// chặn mọi cụm chưa cần mirror.
	SandboxRegistryMirror string

	// SandboxProfiles ánh xạ TÊN profile → resources/env TƯỜNG MINH cho pod
	// (P7 7.C — ví dụ "k8s" cho lab Kubernetes-trong-pod, cần nhiều RAM hơn
	// LimitRange mặc định). Đọc từ JSON trong env `SANDBOX_PROFILES`.
	//
	// RỖNG/không đặt ⇒ map rỗng ⇒ CHỈ profile mặc định ("") tồn tại — mọi
	// CreateSessionRequest.profile khác rỗng bị lifecycle từ chối InvalidArgument
	// (cùng nguyên tắc fail-closed với SandboxTier: server không tự suy ra một
	// profile chưa được khai).
	SandboxProfiles map[string]*k8s.SandboxProfile

	// CapacitySoftLimit là ngưỡng "còn N chỗ" FE dùng (P13 D5, GetCapacity RPC).
	//
	// ⛔ KHÔNG CÓ DEFAULT — cùng lý lẽ với SandboxImage ở trên: một mặc định đoán
	// bừa (0, hoặc một hằng số ngẫu nhiên) sẽ hiện sai sức chứa cho MỌI cluster
	// tới khi ai đó phát hiện ra, và triệu chứng ("còn N chỗ" sai) không tự lộ ra
	// như một lỗi — trang vẫn render, chỉ con số sai. Đây KHÔNG phải trần cứng
	// của quota (đại lượng đó do apiserver gác qua `sandbox.quota` trong Helm) —
	// nó là ngưỡng "pool còn lành" thấp hơn trần vật lý (xem
	// values-selfhost.yaml § sandbox.quota: 23 phiên là chỗ vật lý, 20 là chỗ
	// còn giữ được trải nghiệm — CAPACITY_SOFT_LIMIT là 20, không phải 23).
	CapacitySoftLimit int
}

// rawSandboxProfile là hình dạng JSON thô của MỘT profile trong
// `SANDBOX_PROFILES` — bốn quantity dạng chuỗi (khớp cú pháp Kubernetes, ví dụ
// "250m"/"768Mi") cộng env tuỳ chọn. Tách khỏi k8s.SandboxProfile (dùng
// resource.Quantity đã phân giải) vì JSON tới từ bên ngoài — parse xong mới có
// quyền tin.
type rawSandboxProfile struct {
	RequestsCPU    string            `json:"requestsCpu"`
	RequestsMemory string            `json:"requestsMemory"`
	LimitsCPU      string            `json:"limitsCpu"`
	LimitsMemory   string            `json:"limitsMemory"`
	Env            map[string]string `json:"env"`
}

// parseSandboxProfiles phân giải + validate `SANDBOX_PROFILES` NGAY LÚC khởi
// động — fail-fast, cùng tinh thần với mọi biến bắt buộc khác trong file này.
//
// ⛔ VÌ SAO FAIL-FAST Ở ĐÂY CHỨ KHÔNG ĐỂ LỖI RƠI RA LÚC CreateSession: một
// profile khai nửa vời (thiếu limitsMemory, hoặc "768M" gõ nhầm "768Mi") mà
// không ai gọi tới nó cho tới lúc có sinh viên đầu tiên chọn nó — pod lên xanh,
// mọi probe xanh, và CreateSession đầu tiên dùng profile đó mới lộ ra một lỗi
// cấu hình, ngay trước mặt người dùng. Parse hết MỌI profile lúc Load() thì lỗi
// nổ ra lúc `helm upgrade`, không phải lúc người học đầu tiên bấm Start.
func parseSandboxProfiles(raw string) (map[string]*k8s.SandboxProfile, error) {
	out := map[string]*k8s.SandboxProfile{}
	if raw == "" {
		return out, nil
	}

	var rawProfiles map[string]rawSandboxProfile
	if err := json.Unmarshal([]byte(raw), &rawProfiles); err != nil {
		return nil, fmt.Errorf("env SANDBOX_PROFILES: JSON không hợp lệ: %w", err)
	}

	for name, p := range rawProfiles {
		if name == "" {
			// "" đã có nghĩa cố định: profile MẶC ĐỊNH, không mang resources
			// tường minh (xem session.proto). Một entry tên rỗng trong
			// SANDBOX_PROFILES là mâu thuẫn với chính định nghĩa đó — chặn
			// ngay thay vì để nó âm thầm không bao giờ khớp được (client
			// không thể GỬI profile="" mà LẠI muốn nhận entry này, vì "" luôn
			// đi vào nhánh mặc định trước khi map được tra).
			return nil, fmt.Errorf("env SANDBOX_PROFILES: tên profile rỗng không hợp lệ — %q đã có nghĩa cố định là profile mặc định", "")
		}
		requestsCPU, err := resource.ParseQuantity(p.RequestsCPU)
		if err != nil {
			return nil, fmt.Errorf("env SANDBOX_PROFILES: profile %q requestsCpu=%q: %w", name, p.RequestsCPU, err)
		}
		requestsMemory, err := resource.ParseQuantity(p.RequestsMemory)
		if err != nil {
			return nil, fmt.Errorf("env SANDBOX_PROFILES: profile %q requestsMemory=%q: %w", name, p.RequestsMemory, err)
		}
		limitsCPU, err := resource.ParseQuantity(p.LimitsCPU)
		if err != nil {
			return nil, fmt.Errorf("env SANDBOX_PROFILES: profile %q limitsCpu=%q: %w", name, p.LimitsCPU, err)
		}
		limitsMemory, err := resource.ParseQuantity(p.LimitsMemory)
		if err != nil {
			return nil, fmt.Errorf("env SANDBOX_PROFILES: profile %q limitsMemory=%q: %w", name, p.LimitsMemory, err)
		}
		out[name] = &k8s.SandboxProfile{
			RequestsCPU:    requestsCPU,
			RequestsMemory: requestsMemory,
			LimitsCPU:      limitsCPU,
			LimitsMemory:   limitsMemory,
			Env:            p.Env,
		}
	}
	return out, nil
}

// Load đọc env và áp default.
func Load() (*Config, error) {
	sessionTTL, err := envx.Duration("SESSION_TTL", time.Hour)
	if err != nil {
		return nil, err
	}
	shutdownGrace, err := envx.Duration("SHUTDOWN_GRACE", 15*time.Second)
	if err != nil {
		return nil, err
	}
	grpcReflection, err := envx.Bool("GRPC_REFLECTION", false)
	if err != nil {
		return nil, err
	}
	hardCap, err := envx.Duration("HARD_CAP", 2*time.Hour)
	if err != nil {
		return nil, err
	}
	poolTarget, err := envx.Int("POOL_TARGET", 1)
	if err != nil {
		return nil, err
	}
	extendDefault, err := envx.Duration("EXTEND_DEFAULT", 300*time.Second)
	if err != nil {
		return nil, err
	}
	reapInterval, err := envx.Duration("REAP_INTERVAL", 60*time.Second)
	if err != nil {
		return nil, err
	}
	if reapInterval <= 0 {
		// 0 không phải "tắt reaper" — nó là pod sống mãi và ăn hết quota trong
		// im lặng. Tắt reaper phải là một quyết định có tên, không phải một số 0.
		return nil, fmt.Errorf("env REAP_INTERVAL: phải > 0 (nhận %s)", reapInterval)
	}
	mtlsMode, err := tlsx.ParseMode(envx.String("GRPC_MTLS_MODE", string(tlsx.ModeOff)))
	if err != nil {
		return nil, fmt.Errorf("env GRPC_MTLS_MODE: %w", err)
	}
	mtlsFiles := tlsx.Files{
		CertFile: envx.String("GRPC_TLS_CERT_FILE", ""),
		KeyFile:  envx.String("GRPC_TLS_KEY_FILE", ""),
		CAFile:   envx.String("GRPC_TLS_CA_FILE", ""),
	}
	var systemCNs []string
	if mtlsMode.Enabled() {
		// ⛔ FAIL-FAST GIỮ NGUYÊN TINH THẦN BẢN CŨ, ĐỔI ĐIỀU KIỆN.
		//
		// Bản cũ từ chối khởi động khi BẬT cờ, vì lúc đó không có đường nào để
		// cert tồn tại. Nay có, nên điều kiện đúng là: bật mà THIẾU cert. Cả hai
		// bản chống cùng một chế độ hỏng — pod lên xanh, health probe xanh, và
		// mọi RPC trả Unauthenticated vì server không có creds. Thà chết lúc
		// khởi động với thông báo nói đúng file nào thiếu.
		if err := mtlsFiles.Validate(); err != nil {
			return nil, fmt.Errorf("env GRPC_MTLS_MODE=%s nhưng cert chưa sẵn sàng: %w "+
				"(kiểm GRPC_TLS_CERT_FILE / GRPC_TLS_KEY_FILE / GRPC_TLS_CA_FILE và Secret mTLS đã mount chưa)",
				mtlsMode, err)
		}
		systemCNs = splitCNs(envx.String("GRPC_MTLS_SYSTEM_CNS", ""))
		if len(systemCNs) == 0 {
			// Rỗng KHÔNG được hiểu là "cho phép mọi CN" — đó là cách ghim CN tự
			// vô hiệu hoá trong im lặng khi ai đó xoá biến khỏi values. Rỗng
			// nghĩa là chưa ai quyết định, và một quyết định chưa có thì không
			// được suy ra hộ.
			return nil, fmt.Errorf("env GRPC_MTLS_SYSTEM_CNS: bắt buộc khi GRPC_MTLS_MODE=%s "+
				"(danh sách CommonName được dùng nhánh actor.system_component; rỗng KHÔNG có nghĩa là cho phép tất cả)",
				mtlsMode)
		}
	}
	if poolTarget < 1 {
		// 0 KHÔNG phải "tắt warm-pool" — nó là mọi session đi cold path, tức
		// bỏ hẳn mục tiêu claim < 1s. Muốn tắt thì phải là một quyết định có
		// tên, không phải một số 0 lọt vào env.
		return nil, fmt.Errorf("env POOL_TARGET: phải >= 1 (nhận %d)", poolTarget)
	}
	// Quan hệ giữa SESSION_TTL, HARD_CAP và trần kỹ thuật 24h của claim được
	// kiểm ở lifecycle.NewService, KHÔNG ở đây: trần đó là hằng của package
	// pool (`pool.MaxTTLSeconds`), nơi `EXPIRE` thật sự bị chặn, và nhân bản nó
	// sang package này là cách nó trôi đi. Một chỗ kiểm, một chỗ sửa.

	// KHÔNG có default cho SANDBOX_IMAGE — cùng lý lẽ với RequireDataStores bên
	// dưới ("không có default an toàn cho địa chỉ dữ liệu"). Trước 1.E-1 chỗ này
	// mặc định `registry.k8s.io/pause:3.10`, và đó là một fallback IM LẶNG đúng
	// nghĩa: `pause` chạy được, pod lên `Running`/`Ready`, vào `pool:free`, sinh
	// viên claim THÀNH CÔNG — rồi `tmux new-session` của G4 mới chết vì trong
	// image đó không có shell nào cả. Triệu chứng nằm cách nguyên nhân ba
	// thành phần. Chart luôn set biến này (rỗng thì template tự ghép từ
	// image.registry+image.tag), nên fail-fast ở đây không chặn đường nào đang chạy.
	sandboxImage := envx.String("SANDBOX_IMAGE", "")
	if sandboxImage == "" {
		return nil, fmt.Errorf("env SANDBOX_IMAGE: bắt buộc nhưng chưa đặt " +
			"(không có default — `pause` chạy được nhưng không có shell, nên pod sẽ " +
			"Ready rồi mới hỏng lúc gateway exec vào)")
	}

	sandboxProfiles, err := parseSandboxProfiles(envx.String("SANDBOX_PROFILES", ""))
	if err != nil {
		return nil, err
	}

	// KHÔNG có default — cùng lý lẽ với SANDBOX_IMAGE ở trên. Đọc raw trước để
	// phân biệt "chưa đặt" (envx.Int không phân biệt được: cả unset lẫn set="0"
	// đều là số nguyên hợp lệ) khỏi "đặt nhưng sai định dạng" khỏi "đặt và hợp
	// lệ nhưng <= 0" — ba thông báo lỗi khác nhau, cho người vận hành sửa đúng chỗ.
	capacitySoftLimitRaw := envx.String("CAPACITY_SOFT_LIMIT", "")
	if capacitySoftLimitRaw == "" {
		return nil, fmt.Errorf("env CAPACITY_SOFT_LIMIT: bắt buộc nhưng chưa đặt " +
			"(không có default — đây là ngưỡng \"còn N chỗ\" FE hiện cho người dùng; " +
			"một mặc định đoán bừa sẽ hiện sai sức chứa cho mọi cluster)")
	}
	capacitySoftLimit, err := strconv.Atoi(capacitySoftLimitRaw)
	if err != nil {
		return nil, fmt.Errorf("env CAPACITY_SOFT_LIMIT: %q không phải số nguyên: %w", capacitySoftLimitRaw, err)
	}
	if capacitySoftLimit <= 0 {
		return nil, fmt.Errorf("env CAPACITY_SOFT_LIMIT: phải > 0 (nhận %d)", capacitySoftLimit)
	}

	return &Config{
		GRPCAddr:         envx.String("GRPC_ADDR", ":9090"),
		HTTPAddr:         envx.String("HTTP_ADDR", ":8081"),
		LogLevel:         envx.String("LOG_LEVEL", "info"),
		GRPCReflection:   grpcReflection,
		DatabaseURL:      envx.String("DATABASE_URL", ""),
		RedisURL:         envx.String("REDIS_URL", ""),
		SessionTTL:       sessionTTL,
		ShutdownGrace:    shutdownGrace,
		SandboxNamespace: envx.String("SANDBOX_NAMESPACE", "dlp-sandbox"),

		HardCap:               hardCap,
		PoolTarget:            poolTarget,
		ExtendDefault:         extendDefault,
		ReapInterval:          reapInterval,
		MTLSMode:              mtlsMode,
		MTLSFiles:             mtlsFiles,
		MTLSSystemCNs:         systemCNs,
		SandboxImage:          sandboxImage,
		SandboxRuntimeClass:   envx.String("SANDBOX_RUNTIME_CLASS", "sysbox-runc"),
		SandboxRegistryMirror: envx.String("SANDBOX_REGISTRY_MIRROR", ""),
		SandboxProfiles:       sandboxProfiles,
		CapacitySoftLimit:     capacitySoftLimit,
	}, nil
}

// splitCNs tách danh sách CommonName ngăn bằng dấu phẩy, bỏ khoảng trắng thừa
// và mục rỗng.
//
// Bỏ mục rỗng là bắt buộc chứ không phải lịch sự: `"platform-gateway,"` (dấu
// phẩy thừa cuối) sẽ sinh một CN rỗng, và một cert không có CN cũng khớp nó —
// tức dấu phẩy thừa mở đúng cái cửa mà allowlist sinh ra để đóng.
func splitCNs(raw string) []string {
	out := make([]string, 0, 2)
	for _, part := range strings.Split(raw, ",") {
		if cn := strings.TrimSpace(part); cn != "" {
			out = append(out, cn)
		}
	}
	return out
}

// RequireDataStores kiểm CẢ DATABASE_URL LẪN REDIS_URL.
//
// Dùng cho đường thật sự chạm cả hai — hôm nay chỉ có cmd/dbsmoke. Server KHÔNG
// gọi hàm này: nó chưa đọc Postgres (audit là B8), nên ép DATABASE_URL ở đó là
// bắt người vận hành cấp một biến không ai dùng.
//
// Không có default an toàn cho địa chỉ dữ liệu: đoán bừa localhost trong cluster
// là nối nhầm chỗ, im lặng.
func (c *Config) RequireDataStores() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("env DATABASE_URL: bắt buộc nhưng chưa đặt")
	}
	if c.RedisURL == "" {
		return fmt.Errorf("env REDIS_URL: bắt buộc nhưng chưa đặt")
	}
	return nil
}
