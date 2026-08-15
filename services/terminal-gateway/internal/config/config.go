// Package config đọc cấu hình terminal-gateway từ biến môi trường.
package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// Config là toàn bộ cấu hình runtime của terminal-gateway.
type Config struct {
	// PublicAddr phục vụ /ws/session/{id} — port NÀY ra tới trình duyệt.
	PublicAddr string

	// AdminAddr phục vụ /healthz + /metrics, KHÔNG ra internet.
	//
	// Tách khỏi PublicAddr vì /metrics không có authz: dlp_build_info lộ chính xác
	// version (tra CVE) và go_goroutines/process_* cho phép người ngoài đếm số
	// session đang chạy. Gateway bắt buộc phải mở port công khai cho WS, nên gộp
	// chung mux là biếu không thông tin đó.
	AdminAddr string

	LogLevel      string
	ShutdownGrace time.Duration

	// OrchestratorGRPCAddr chưa dùng ở P0 (gateway chưa nối pod), nhưng seam đã
	// khoá từ đây để P1 không phải sửa hình dạng config.
	OrchestratorGRPCAddr string

	// MTLSMode dùng CHUNG một biến với orchestrator và apps/web (1.C-4).
	//
	// Phía CLIENT, `permissive` và `require` giống hệt nhau: cả hai đều trình
	// client cert. Khác biệt chỉ có ở phía server. Đó chính là điều làm một-biến
	// -cho-cả-cụm an toàn: đặt `permissive` là mọi client đã cắm cert trong khi
	// server còn khoan dung, nên bước sang `require` không đổi hành vi client nào.
	MTLSMode tlsx.Mode

	// MTLSFiles là cert/key/CA client. Rỗng khi MTLSMode=off.
	MTLSFiles tlsx.Files

	// MTLSServerName phải khớp một SAN trong cert của orchestrator.
	//
	// Tách khỏi OrchestratorGRPCAddr thay vì cắt phần host của nó: hai giá trị
	// TRÙNG nhau hôm nay nhưng không buộc phải trùng — ngày có Service mesh hay
	// port-forward thì địa chỉ dial đổi mà tên trên cert thì không. Suy hộ từ
	// địa chỉ là dựng một ràng buộc ngầm sẽ hỏng đúng lúc khó chẩn đoán nhất.
	MTLSServerName string

	// JWKSURL là endpoint JWKS của Better Auth (`/api/auth/jwks` trên apps/web).
	// Gateway verify sandbox token bằng khoá CÔNG KHAI lấy từ đây — không có
	// khoá riêng nào của gateway, và vì thế không có khoá nào phải xoay vòng
	// bằng tay (phase-1 D13/D15).
	//
	// Tên có tiền tố GATEWAY_ trong khi các biến khác thì không: nó được pin
	// như vậy trong contract (docs/ws-terminal-protocol.md §2 và bộ verify
	// command của phase-1) vì nó là biến DUY NHẤT phải khớp giữa hai service.
	// Đổi tên ở đây là đổi contract, không phải đổi style.
	JWKSURL string

	// TokenIssuer là giá trị `iss` mà sandbox token BẮT BUỘC mang — chính là
	// `BETTER_AUTH_URL` của apps/web.
	//
	// ⚠ KHÔNG suy ra được từ JWKSURL, và đó là lý do nó phải là biến riêng:
	// JWKSURL trong cluster là DNS nội bộ (`http://<release>-web:3000/...`)
	// còn `iss` là URL CÔNG KHAI mà trình duyệt thấy (`https://app.example.com`).
	// Hai chuỗi khác nhau về bản chất; cắt đuôi "/api/auth/jwks" của cái này để
	// lấy cái kia là đúng kiểu suy luận chạy được ở dev rồi 401 toàn bộ ở prod.
	//
	// *Khoảng trống của PLAN:* G11 liệt kê 4 biến mới của P1 và không có biến
	// này, trong khi contract §2 lại bắt kiểm `iss`. Không có nó thì hoặc bỏ
	// check (mất một vế của luật 6) hoặc hardcode (drift). Ghi lại ở đây thay
	// vì im lặng thêm một biến.
	TokenIssuer string

	// AllowedOrigins là allowlist cho header `Origin` của handshake WS — thứ
	// DUY NHẤT đóng CSWSH, vì handshake WebSocket KHÔNG chịu CORS.
	//
	// Rỗng nghĩa là "không Origin nào được chấp nhận", KHÔNG phải "cho qua tất".
	// Fail-open ở một allowlist bảo mật là cách nó biến mất trong im lặng khi ai
	// đó quên set biến trên một môi trường mới.
	//
	// Lưu ý contract §3a: request VẮNG HẲN header `Origin` vẫn được cho qua —
	// đó là quyết định (wscat/websocat/probe vận hành/test e2e không gửi Origin,
	// còn trình duyệt thì LUÔN gửi, nên CSWSH vẫn đóng kín). Allowlist này chỉ
	// gác nhánh "có Origin".
	AllowedOrigins []string

	// MaxWSPerSession là trần WS ĐỒNG THỜI trên một session (D17 = 1).
	//
	// Không phải con số tuỳ tiện: `tmux new-session -A -s dlp` cho hai client
	// attach vào CÙNG một session và tmux ép MỘT kích thước cửa sổ theo client
	// hoạt động gần nhất — tab thứ hai không "thêm terminal", nó CO tab thứ
	// nhất xuống rồi lật qua lại mỗi keystroke (đo thật trên tmux 3.4).
	//
	// Trần này chặn ĐỒNG THỜI, không chặn NỐI LẠI: WS đóng → DECR về 0.
	MaxWSPerSession int

	// WSLease là lease của khe `session:{id}:ws` (3.H), gia hạn ở 1/3 lease
	// suốt vòng đời phiên.
	//
	// ⛔ ĐÂY LÀ THỜI GIAN MỘT NGƯỜI DÙNG BỊ KHOÁ NGOÀI phiên của chính mình khi
	// gateway chết ĐỘT NGỘT (SIGKILL, OOM, mất node) — những ca mà drain êm
	// không đỡ được vì `defer` không chạy. Trước 3.H giá trị này là cả phần đời
	// còn lại của session, tức hàng chục phút.
	//
	// Đánh đổi khi chỉnh: ngắn hơn ⇒ tự lành nhanh hơn, nhưng nhịp gia hạn dày
	// hơn và biên chịu lỗi Redis mỏng đi. Dài hơn ⇒ ngược lại. 90s cho biên 2
	// nhịp lỡ (gia hạn mỗi 30s) và một cửa sổ khoá ngoài mà người dùng đọc ra là
	// "thử lại sau một lát", không phải "hỏng rồi".
	WSLease time.Duration

	// ExecCommand là lệnh chạy trong pod khi gateway attach (G4).
	//
	// ⛔ HẰNG SỐ PHÍA SERVER, và đó là ranh giới bảo mật chứ không phải tiện
	// nghi cấu hình: contract §3c cấm `init` mang field `shell`/`command`, vì
	// cho client chọn lệnh là cho client chọn thứ chạy trong pod — kể cả pod của
	// chính họ, đó là bề mặt không cần mở.
	//
	// Mặc định `tmux new-session -A -s dlp` (D3): không có tmux thì mỗi lần
	// attach `pods/exec` sinh một tiến trình MỚI — đó không phải reconnect, và
	// với nền tảng học làm lab dài thì mất bài giữa chừng là UX hỏng. `-A` làm
	// lời gọi thứ hai ATTACH vào session cũ thay vì tạo cái mới.
	ExecCommand []string

	// ExecShell là lệnh chạy script CHẤM ĐIỂM one-shot (P2 / 2.C), tách hẳn khỏi
	// ExecCommand.
	//
	// ⛔ KHÔNG dùng lại ExecCommand: mặc định của nó là `tmux new-session -A -s
	// dlp`, và attach vào tmux của người học rồi bơm script chấm vào đó sẽ (1)
	// gõ lệnh chấm ngay giữa màn hình họ đang làm bài, (2) trả về exit code của
	// tmux chứ không của script. Hai đường, hai lệnh.
	//
	// Script đi qua STDIN chứ không qua argv — xem podexec/oneshot.go. `sh` đọc
	// stdin cho đúng ngữ nghĩa Killercoda: exit code của script = exit code của
	// lệnh cuối, và 0 nghĩa là pass.
	ExecShell []string

	// ExecTimeout là trần cho MỘT lượt chấm. Vượt → 502, KHÔNG phải "fail":
	// một script treo không phải một bài làm sai, và trả "fail" cho nó sẽ bắt
	// người học đi sửa bài trong khi thứ hỏng là cụm.
	//
	// 30s: verify script thật nặng nhất trong kho vendor là `kubectl get` trên
	// cụm kubeadm (vài giây). Rộng gấp nhiều lần mà vẫn ngắn hơn hạn kiên nhẫn
	// của người đang bấm một cái nút.
	ExecTimeout time.Duration

	// ExecMaxOutput là trần byte output trả về mỗi lượt chấm (ô AC "output
	// verify bị cắt cỡ"). Đây là trần CHỐNG DoS, không phải trần hiển thị: FE chỉ
	// dùng output làm hint vài dòng, còn một script `cat /dev/urandom` không
	// được phép bơm hết RAM gateway rồi hết băng thông BFF.
	ExecMaxOutput int

	// RedisURL là Redis mà orchestrator ghi `session:{id}`. Gateway ĐỌC hash đó
	// cho authz per-session (D2: đọc được, ghi trạng thái session thì không).
	//
	// KHÔNG có default: đoán bừa localhost trong cluster là nối nhầm chỗ, im
	// lặng — và "im lặng" ở đây nghĩa là mọi handshake trả 500 sau khi đã qua
	// hết phần verify token, tức triệu chứng nằm cách nguyên nhân rất xa. Cùng
	// lý lẽ với RequireDataStores của orchestrator.
	RedisURL string
}

// Load đọc env.
//
// REDIS_URL là biến BẮT BUỘC kể từ P1 (G3): không có Redis thì không có
// per-session authz, và gateway không có chế độ chạy nào hợp lệ mà thiếu nó.
func Load() (*Config, error) {
	shutdownGrace, err := envx.Duration("SHUTDOWN_GRACE", 15*time.Second)
	if err != nil {
		return nil, err
	}

	wsLease, err := envx.Duration("GATEWAY_WS_LEASE", 90*time.Second)
	if err != nil {
		return nil, err
	}

	maxWS, err := envx.Int("GATEWAY_MAX_WS_PER_SESSION", 1)
	if err != nil {
		return nil, err
	}
	if maxWS < 1 {
		return nil, fmt.Errorf("env GATEWAY_MAX_WS_PER_SESSION: %d phải ≥ 1 "+
			"(0 thì không ai mở được terminal, và đó là một cách tắt nền tảng "+
			"mà không lỗi nào nói vì sao)", maxWS)
	}

	redisURL, err := envx.Require("REDIS_URL")
	if err != nil {
		return nil, fmt.Errorf("%w — gateway đọc hash session:{id} cho authz "+
			"per-session (phase-1 D2/G3); thiếu nó thì mọi handshake chết ở bước f", err)
	}

	// Tách theo KHOẢNG TRẮNG, không phải dấu phẩy: đây là argv, và
	// `strings.Fields` là cách duy nhất giữ nó đọc giống hệt lúc gõ tay.
	execCommand := strings.Fields(envx.String("GATEWAY_EXEC_COMMAND", "tmux new-session -A -s dlp"))
	if len(execCommand) == 0 {
		// Rỗng ⇒ apiserver nhận `command: []` và chạy ENTRYPOINT/CMD của image,
		// tức `sleep infinity` (1.E) — pod attach "thành công" rồi treo im lặng
		// mà không có shell nào. Fail-fast thay vì để nó lộ ra như "terminal
		// không phản hồi".
		return nil, fmt.Errorf("env GATEWAY_EXEC_COMMAND: rỗng — không có lệnh " +
			"thì exec chạy CMD của image (`sleep infinity`) và terminal treo câm")
	}

	// Mặc định `bash`, KHÔNG `sh`: nội dung Killercoda là script bash (`[[ ]]`,
	// `set -o pipefail`), còn `sh` trong image sandbox là dash. Đo trên cụm
	// 2026-08-13: dash chết ở `set: Illegal option -o pipefail` (exit 2) — mà
	// exit 2 lại được dịch thành `passed:false`, tức "bài sai", nên lỗi này giả
	// dạng thành một lượt chấm bình thường. Xem `infra/helm/platform/values.yaml`
	// § gateway.env.execShell.
	execShell := strings.Fields(envx.String("GATEWAY_EXEC_SHELL", "bash"))
	if len(execShell) == 0 {
		// Rỗng ⇒ apiserver chạy CMD của image (`sleep infinity`), script chấm
		// không bao giờ được đọc, và lượt chấm treo tới hết ExecTimeout rồi trả
		// 502. Cùng bẫy với GATEWAY_EXEC_COMMAND rỗng, cùng cách chặn.
		return nil, fmt.Errorf("env GATEWAY_EXEC_SHELL: rỗng — không có lệnh thì " +
			"script chấm không được đọc và mọi lượt Check treo tới khi hết hạn")
	}

	execTimeout, err := envx.Duration("GATEWAY_EXEC_TIMEOUT", 30*time.Second)
	if err != nil {
		return nil, err
	}
	if execTimeout <= 0 {
		// context.WithTimeout với giá trị ≤ 0 hết hạn NGAY, nên mọi lượt chấm
		// trả 502 trước khi chạm pod — một cách tắt nút "Check" mà không lỗi nào
		// nói vì sao. Cùng lý lẽ với GATEWAY_MAX_WS_PER_SESSION < 1.
		return nil, fmt.Errorf("env GATEWAY_EXEC_TIMEOUT: %s phải > 0 "+
			"(≤ 0 thì mọi lượt chấm hết hạn ngay lập tức)", execTimeout)
	}

	execMaxOutput, err := envx.Int("GATEWAY_EXEC_MAX_OUTPUT", 8*1024)
	if err != nil {
		return nil, err
	}
	if execMaxOutput < 1 {
		// 0 làm mọi output rỗng và `truncated` luôn true — FE sẽ hiện "đã cắt
		// bớt" cho một script không in gì, và hint của mọi bài biến mất trong
		// im lặng.
		return nil, fmt.Errorf("env GATEWAY_EXEC_MAX_OUTPUT: %d phải ≥ 1 "+
			"(0 thì mọi output rỗng và luôn báo đã cắt cỡ)", execMaxOutput)
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
	mtlsServerName := envx.String("GRPC_TLS_SERVER_NAME", "")
	if mtlsMode.Enabled() {
		// Fail-fast cùng lý lẽ với orchestrator: thiếu cert mà mode bật nghĩa là
		// gateway lên xanh rồi MỌI heartbeat ExtendSession hỏng ở bắt tay TLS —
		// và triệu chứng đó (session hết hạn giữa chừng dù người dùng đang gõ)
		// trỏ về đồng hồ session, không trỏ về một file cert vắng mặt.
		if err := mtlsFiles.Validate(); err != nil {
			return nil, fmt.Errorf("env GRPC_MTLS_MODE=%s nhưng cert chưa sẵn sàng: %w", mtlsMode, err)
		}
		if mtlsServerName == "" {
			return nil, fmt.Errorf("env GRPC_TLS_SERVER_NAME: bắt buộc khi GRPC_MTLS_MODE=%s "+
				"(phải khớp một SAN trong cert của orchestrator)", mtlsMode)
		}
	}

	return &Config{
		PublicAddr:           envx.String("PUBLIC_ADDR", ":8082"),
		MTLSMode:             mtlsMode,
		MTLSFiles:            mtlsFiles,
		MTLSServerName:       mtlsServerName,
		AdminAddr:            envx.String("ADMIN_ADDR", "127.0.0.1:8083"),
		LogLevel:             envx.String("LOG_LEVEL", "info"),
		ShutdownGrace:        shutdownGrace,
		OrchestratorGRPCAddr: envx.String("ORCHESTRATOR_GRPC_ADDR", "localhost:9090"),
		// Default trỏ web chạy local — đúng cho `make run-gateway`. Trong k8s,
		// Helm đè bằng DNS in-cluster của Service web.
		JWKSURL: envx.String("GATEWAY_JWKS_URL", "http://localhost:3000/api/auth/jwks"),
		// Default khớp BETTER_AUTH_URL mặc định của apps/web ở dev. Trong k8s,
		// Helm suy ra từ ĐÚNG `web.env.betterAuthUrl` — một giá trị, hai nơi
		// đọc, không có hằng số thứ hai để trôi.
		TokenIssuer:     envx.String("GATEWAY_TOKEN_ISSUER", "http://localhost:3000"),
		AllowedOrigins:  splitList(envx.String("GATEWAY_ALLOWED_ORIGINS", "http://localhost:3000")),
		MaxWSPerSession: maxWS,
		WSLease:         wsLease,
		RedisURL:        redisURL,
		ExecCommand:     execCommand,
		ExecShell:       execShell,
		ExecTimeout:     execTimeout,
		ExecMaxOutput:   execMaxOutput,
	}, nil
}

// splitList tách danh sách ngăn cách bằng dấu phẩy, bỏ khoảng trắng thừa và
// mục rỗng. `"a, b,"` → `["a","b"]`.
//
// Mục rỗng bị loại chứ không giữ lại: một chuỗi rỗng lọt vào allowlist Origin sẽ
// khớp với... không gì cả trên nhánh "có Origin" (header rỗng không phải header
// vắng), nên nó vô hại — nhưng nó làm log cấu hình khó đọc và che mất lỗi gõ
// nhầm dấu phẩy.
func splitList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
