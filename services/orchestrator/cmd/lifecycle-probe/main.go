// Command lifecycle-probe đo các AC §Chức năng của P1 bằng gRPC THẬT, TỪ TRONG CỤM.
//
// ⛔ VÌ SAO PHẢI LÀ MỘT BINARY TRONG REPO, KHÔNG PHẢI MẤY DÒNG grpcurl.
// Cùng ba lý do đã buộc `mtls-probe` phải tồn tại, cộng một lý do riêng:
//
//   - Cổng gRPC đang ở nấc `require` (1.C-4). Không cert hợp lệ thì không có
//     request nào tới được handler, mà cert nằm trong Secret của cụm.
//   - Cụm này side-load image, không pull được (mạng VM ~52 KiB/s), nên "cài
//     grpcurl vào một pod" không phải một bước, nó là một chặng.
//   - Mỗi AC ở đây là một QUAN HỆ giữa hai lời gọi, không phải một lời gọi đơn:
//     "hai `CreateSession` cùng idempotency_key trả CÙNG id", "gia hạn với
//     revision CŨ bị từ chối SAU KHI revision đã tăng", "hạn ĐỨNG YÊN ở lượt
//     thứ hai". Một chuỗi grpcurl rời rạc không giữ được trạng thái giữa hai
//     lời gọi, nên phép so sánh rơi về mắt người đọc — đúng chỗ mà lỗi lọt.
//
// ⛔ MỖI CA ĐỀU CÓ ĐỐI CHỨNG DƯƠNG. Một bộ acceptance chỉ toàn ca ĐỎ không phân
// biệt được "chặn đúng chỗ" với "chặn tất cả" — bài học của 1.C-1 và 1.C-4. Nên
// ca `get` không chỉ hỏi "user lạ có bị từ chối không" mà còn hỏi "chủ thật có
// đọc được không"; ca `extend` không chỉ hỏi "revision cũ có bị chặn không" mà
// còn hỏi "revision đúng có đi qua không".
//
// Probe in ra GIÁ TRỊ QUAN SÁT ĐƯỢC bên cạnh mỗi kết luận PASS/FAIL. Một dòng
// "PASS" trần là thứ không ai kiểm lại được; con số thì kiểm lại được.
//
// Dùng:
//
//	lifecycle-probe -addr platform-orchestrator:9090 -server-name platform-orchestrator \
//	                -ca /etc/dlp/mtls/ca.crt -cert /etc/dlp/mtls/web.crt -key /etc/dlp/mtls/web.key \
//	                -case all
//
// Thoát khác 0 khi có ca đỏ.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

func main() {
	addr := flag.String("addr", "platform-orchestrator:9090", "địa chỉ gRPC")
	serverName := flag.String("server-name", "platform-orchestrator", "tên khớp SAN cert server")
	caFile := flag.String("ca", "/etc/dlp/mtls/ca.crt", "CA bundle")
	certFile := flag.String("cert", "/etc/dlp/mtls/web.crt", "client cert")
	keyFile := flag.String("key", "/etc/dlp/mtls/web.key", "client key")
	caseName := flag.String("case", "all", "all|idem|get|claim|extend|hardcap|reap|create|pool|check")
	userA := flag.String("user", "probe-user-a", "chủ sở hữu session")
	userB := flag.String("user2", "probe-user-b", "người KHÁC, dùng cho ca IDOR")
	tag := flag.String("tag", "", "hậu tố cho idempotency_key; rỗng ⇒ lấy theo đồng hồ")
	hardCap := flag.Duration("hard-cap", 2*time.Hour, "HARD_CAP của orchestrator, để đối chiếu mốc trần")
	// ⛔ CỬA SỔ QUAN SÁT, KHÔNG PHẢI MỘT `sleep` TRANG TRÍ. AC của ReapSession đòi
	// "pod VẪN SỐNG" sau một lần reap bị từ chối, và vế đó nằm ở apiserver chứ
	// không ở Redis — probe không có quyền k8s nên người quan sát là kubectl bên
	// ngoài. Không có khoảng dừng này thì probe reap thật ngay sau lời từ chối và
	// cửa sổ quan sát rộng vài mili-giây: kubectl luôn tới muộn, và ta chỉ khẳng
	// định được vế Redis rồi ghi nó ra như thể đã đo cả hai.
	hold := flag.Duration("hold", 0, "ca reap: dừng bao lâu sau lời từ chối, để kubectl kịp quan sát pod")
	// ⛔ `-keep` CHỈ dành cho ca `create`, và nó cố ý để lại rác. Các ca dựng cảnh
	// cho reaper (xoá `session:{id}` của một phiên ĐANG CHẠY, xoá pod dưới chân
	// một session còn sống) cần một session sống sót sau khi probe thoát — probe
	// tự dọn thì không còn gì cho reaper dọn, và ta sẽ đo một cái bẫy rỗng.
	// Người gọi chịu trách nhiệm dọn; trần quota lab chỉ có 4 pod.
	keep := flag.Bool("keep", false, "ca create: KHÔNG reap khi thoát (để dựng cảnh cho reaper)")
	n := flag.Int("n", 5, "ca pool: số CreateSession đồng thời")
	// ⛔ TTL NGẮN LÀ THỨ DUY NHẤT LÀM AC-C2 ĐO ĐƯỢC TRONG MỘT LƯỢT CHẠY.
	// `SESSION_TTL` của cụm là 1h, nên "chờ session hết hạn rồi xem reaper có dọn
	// không" là một phép đo dài một tiếng — và mọi ô AC treo theo đồng hồ tường ở
	// dự án này đều đã bị VM ngủ giết ít nhất một lần. Server đã nhận `ttl_seconds`
	// từ đầu (`session.proto:70`, `lifecycle/service.go:resolveTTL`): >0 dùng
	// nguyên giá trị, chỉ chặn dưới 1s và trần HARD_CAP. Probe chỉ thiếu đường
	// truyền nó xuống.
	ttl := flag.Int("ttl", 0, "ca create/pool: ttl_seconds gửi kèm CreateSession; 0 = mặc định của server")
	sessionID := flag.String("session", "", "ca check: id của session ĐÃ TỒN TẠI cần kiểm")
	flag.Parse()

	if *caseName == "check" && *sessionID == "" {
		fmt.Fprintln(os.Stderr, "-case check cần -session <id> (id do một lượt `-case create -keep` trước đó in ra)")
		os.Exit(2)
	}

	// ⛔ CHẶN `-ttl` Ở CÁC CA KHÁC. Ca `hardcap` khẳng định mốc trần suy ra từ TTL
	// MẶC ĐỊNH của server; ép một TTL ngắn vào đó làm nó đỏ vì phép đo sai chứ
	// không vì hệ sai, và người đọc bản ghi sẽ đi tìm lỗi trong orchestrator.
	if *ttl != 0 && *caseName != "create" && *caseName != "pool" {
		fmt.Fprintf(os.Stderr, "-ttl chỉ dùng với -case create hoặc -case pool (đang: %s)\n", *caseName)
		os.Exit(2)
	}
	if *ttl < 0 {
		fmt.Fprintf(os.Stderr, "-ttl âm (%d): server trả InvalidArgument, không cần gửi đi để biết\n", *ttl)
		os.Exit(2)
	}

	if *tag == "" {
		*tag = fmt.Sprintf("t%d", time.Now().UnixNano())
	}

	cfg, err := tlsx.ClientConfig(
		tlsx.Files{CertFile: *certFile, KeyFile: *keyFile, CAFile: *caFile}, *serverName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "dựng TLS: %v\n", err)
		os.Exit(2)
	}
	conn, err := grpc.NewClient(*addr, grpc.WithTransportCredentials(credentials.NewTLS(cfg)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "dựng client: %v\n", err)
		os.Exit(2)
	}
	defer func() { _ = conn.Close() }()

	p := &probe{
		client:    orchestratorv1.NewSessionServiceClient(conn),
		userA:     *userA,
		userB:     *userB,
		tag:       *tag,
		hardCap:   *hardCap,
		hold:      *hold,
		keep:      *keep,
		n:         *n,
		ttl:       int32(*ttl),
		sessionID: *sessionID,
	}

	cases := map[string]func(context.Context){
		"idem":    p.caseIdempotency,
		"get":     p.caseGet,
		"claim":   p.caseClaim,
		"extend":  p.caseExtend,
		"hardcap": p.caseHardCap,
		"reap":    p.caseReap,
		"create":  p.caseCreate,
		"pool":    p.casePoolSaturate,
		"check":   p.caseCheck,
	}
	// `create` KHÔNG nằm trong `all`: với `-keep` nó cố ý để lại một session sống
	// để dựng cảnh cho reaper, nên chạy chung sẽ ăn mất một khe trên trần 4 pod
	// và làm ca sau đỏ vì hết chỗ — phép đo hỏng vì phép đo trước.
	order := []string{"idem", "get", "claim", "extend", "hardcap", "reap"}
	// Danh sách để BÁO LỖI, khác `order` là danh sách để CHẠY. Trộn hai thứ này
	// làm thông báo "ca không tồn tại" liệt kê thiếu đúng những ca chạy riêng
	// (`create`, `pool`, `check`) — tức công cụ tự nói rằng ca có thật là không có.
	available := append(append([]string{}, order...), "create", "pool", "check")

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	toRun := order
	if *caseName != "all" {
		if _, ok := cases[*caseName]; !ok {
			fmt.Fprintf(os.Stderr, "ca không tồn tại: %s (có: %s)\n", *caseName, strings.Join(available, ", "))
			os.Exit(2)
		}
		toRun = []string{*caseName}
	}

	for _, name := range toRun {
		p.current = name
		fmt.Printf("\n===== CASE %s =====\n", name)
		cases[name](ctx)
	}

	fmt.Printf("\n===== TỔNG =====\nchecks=%d fails=%d\n", p.checks, len(p.fails))
	for _, f := range p.fails {
		fmt.Printf("FAIL %s\n", f)
	}
	if len(p.fails) > 0 {
		os.Exit(1)
	}
	fmt.Println("KẾT QUẢ: PASS")
}

type probe struct {
	client    orchestratorv1.SessionServiceClient
	userA     string
	userB     string
	tag       string
	hardCap   time.Duration
	hold      time.Duration
	keep      bool
	n         int
	ttl       int32
	sessionID string

	current string
	checks  int
	fails   []string
}

// check ghi nhận một khẳng định. In cả vế quan sát được, không chỉ PASS/FAIL —
// người đọc report phải kiểm lại được kết luận từ số, không phải tin chữ.
func (p *probe) check(name string, ok bool, observed string) {
	p.checks++
	verdict := "PASS"
	if !ok {
		verdict = "FAIL"
		p.fails = append(p.fails, p.current+"/"+name+" — "+observed)
	}
	fmt.Printf("  [%s] %-46s %s\n", verdict, name, observed)
}

func (p *probe) kv(k, v string) { fmt.Printf("  . %-46s %s\n", k, v) }

func codeOf(err error) codes.Code { return status.Convert(err).Code() }

func (p *probe) create(ctx context.Context, user, idemKey string) (*orchestratorv1.Session, error) {
	resp, err := p.client.CreateSession(ctx, &orchestratorv1.CreateSessionRequest{
		UserId:         user,
		Tier:           orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX,
		IdempotencyKey: idemKey,
		TtlSeconds:     p.ttl, // 0 ⇒ server dùng SESSION_TTL; xem cờ -ttl
	})
	if err != nil {
		return nil, err
	}
	return resp.GetSession(), nil
}

// caseCheck kiểm một session ĐÃ TỒN TẠI (do lượt chạy trước tạo bằng `-keep`)
// còn dùng được không. Đây là vế còn thiếu của AC-C3: mọi ca khác tự tạo session
// của riêng nó, nên không ca nào trả lời được câu "session đang sống TỪ TRƯỚC có
// qua nổi một lần restart orchestrator không".
//
// ⛔ KIỂM CẢ ĐỌC LẪN GHI. Một ca chỉ gọi `GetSession` sẽ xanh ngay cả khi
// orchestrator mới khởi động lại đã mất đường ghi Redis — nó đọc được hash cũ và
// báo "session vẫn dùng được" về một hệ thống không nhận thêm được lệnh nào.
// `ExtendSession` là lời ghi rẻ nhất chứng minh đường ghi còn sống, và revision
// tăng đúng 1 là bằng chứng lời ghi ấy tới đúng session này.
func (p *probe) caseCheck(ctx context.Context) {
	got, err := p.client.GetSession(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: p.sessionID, UserId: p.userA,
	})
	p.check("ĐỌC được session đã tồn tại", err == nil, fmt.Sprintf("code=%s", codeOf(err)))
	if err != nil {
		return
	}
	sess := got.GetSession()
	p.kv("SESSIONID", sess.GetId())
	p.kv("PODNAME", sess.GetPodName())
	p.kv("STATUS", sess.GetStatus().String())
	p.kv("EXPIRESAT", sess.GetExpiresAt().AsTime().UTC().Format(time.RFC3339))

	alive := sess.GetStatus() == orchestratorv1.SessionStatus_SESSION_STATUS_CLAIMED ||
		sess.GetStatus() == orchestratorv1.SessionStatus_SESSION_STATUS_RUNNING
	p.check("status còn sống (CLAIMED|RUNNING)", alive, sess.GetStatus().String())

	r0 := sess.GetRevision()
	ext, extErr := p.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA, ExpectedRevision: r0,
	})
	r1 := ext.GetSession().GetRevision()
	p.check("GHI được (ExtendSession)", extErr == nil, fmt.Sprintf("code=%s", codeOf(extErr)))
	p.check("revision tăng đúng 1", r1 == r0+1, fmt.Sprintf("%d → %d", r0, r1))
}

// cleanup trả pod về cụm. KHÔNG tính là check: trần quota của lab là 4 pod
// (D16), nên một probe quên dọn sẽ làm ca CHẠY SAU đỏ vì hết chỗ — tức là một
// phép đo hỏng vì phép đo trước, không phải vì hệ thống.
func (p *probe) cleanup(ctx context.Context, sess *orchestratorv1.Session, user string) {
	if sess == nil {
		return
	}
	_, err := p.client.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
		SessionId: sess.GetId(),
		Reason:    "lifecycle-probe cleanup",
		Actor:     &orchestratorv1.ReapSessionRequest_UserId{UserId: user},
	})
	if err != nil {
		fmt.Printf("  ! dọn session %s: %v\n", sess.GetId(), err)
		return
	}
	fmt.Printf("  ~ đã dọn session %s (pod %s)\n", sess.GetId(), sess.GetPodName())
}

// ---------------------------------------------------------------- AC: idempotency

// caseIdempotency — AC "CreateSession 2 lần cùng idempotency_key → cùng session.id,
// số pod tăng đúng 1".
//
// Vế "số pod tăng đúng 1" đo Ở NGOÀI bằng kubectl: probe in ra podName của cả
// hai lượt, và hai tên GIỐNG NHAU là điều kiện cần. Đếm pod trong namespace là
// việc của wrapper — probe không có quyền k8s và không nên có.
func (p *probe) caseIdempotency(ctx context.Context) {
	key := "idem-" + p.tag
	first, err := p.create(ctx, p.userA, key)
	if err != nil {
		p.check("lượt 1 tạo được", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, first, p.userA)
	p.kv("lượt 1", fmt.Sprintf("id=%s pod=%s", first.GetId(), first.GetPodName()))

	second, err := p.create(ctx, p.userA, key)
	if err != nil {
		p.check("lượt 2 tạo được", false, fmt.Sprintf("err=%v", err))
		return
	}
	p.kv("lượt 2", fmt.Sprintf("id=%s pod=%s", second.GetId(), second.GetPodName()))

	p.check("cùng session.id", first.GetId() == second.GetId(),
		fmt.Sprintf("%s vs %s", first.GetId(), second.GetId()))
	p.check("cùng pod (không tạo pod thứ hai)", first.GetPodName() == second.GetPodName(),
		fmt.Sprintf("%s vs %s", first.GetPodName(), second.GetPodName()))

	// Đối chứng dương: key KHÁC phải ra session KHÁC. Không có vế này thì một
	// hiện thực trả về session cũ cho MỌI lời gọi cũng qua được ca trên.
	other, err := p.create(ctx, p.userA, "idem-khac-"+p.tag)
	if err != nil {
		p.check("đối chứng: key khác tạo được session mới", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, other, p.userA)
	p.check("đối chứng: key khác ⇒ session khác", other.GetId() != first.GetId(),
		fmt.Sprintf("id=%s pod=%s", other.GetId(), other.GetPodName()))
}

// ---------------------------------------------------------------- dựng cảnh cho reaper

// caseCreate tạo một session thật và (với `-keep`) ĐỂ NGUYÊN nó.
//
// Đây không phải một AC — nó là bước dựng cảnh cho hai AC của reaper mà không
// cách nào dựng từ ngoài: "xoá `session:{id}` của một phiên ĐANG CHẠY" và "xoá
// pod dưới chân một session còn sống". Cả hai đòi một session do đúng đường
// `CreateSession` sinh ra (có hash đủ field, có `session:{id}:pod`, tên nằm
// trong `pool:claimed`) — nặn tay trong Redis sẽ dựng một cái bẫy rỗng, và bản
// vá trước của AC này đã hỏng đúng vì thế: nó tạo pod KHÔNG hash, tức đo nhánh
// "pod mồ côi" chứ không đo nhánh mà AC mô tả.
func (p *probe) caseCreate(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "create-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	p.check("tạo được session", true, fmt.Sprintf("status=%s", sess.GetStatus()))
	// Ba dòng này là giao diện với script bên ngoài — giữ nguyên định dạng.
	p.kv("SESSIONID", sess.GetId())
	p.kv("PODNAME", sess.GetPodName())
	// ⛔ MỐC HẾT HẠN LẤY TỪ SERVER, KHÔNG ĐỂ SCRIPT TỰ CỘNG `now + ttl`.
	// Đồng hồ VM lệch đồng hồ Windows ~59s (đo 3 lượt, 1.G-6), và một script chạy
	// từ máy khác sẽ cộng ra một mốc lệch đúng chừng đó. Ở đây `expires_at` do
	// chính orchestrator ghi, cùng đồng hồ với Redis đang đếm TTL — nên script
	// chờ đúng thứ nó cần chờ thay vì chờ một con số hợp lý mà sai.
	p.kv("EXPIRESAT", sess.GetExpiresAt().AsTime().UTC().Format(time.RFC3339))

	if p.hold > 0 {
		fmt.Printf("  > HOLD-BAT-DAU %s (%s)\n", time.Now().UTC().Format(time.RFC3339), p.hold)
		time.Sleep(p.hold)
		fmt.Printf("  > HOLD-KET-THUC %s\n", time.Now().UTC().Format(time.RFC3339))
	}
	if p.keep {
		fmt.Println("  ! -keep: KHÔNG reap. Người gọi phải tự dọn — trần quota lab là 4 pod.")
		return
	}
	p.cleanup(ctx, sess, p.userA)
}

// ---------------------------------------------------------------- AC: warm-pool + quota

// casePoolSaturate đẩy cụm tới TRẦN QUOTA bằng N `CreateSession` ĐỒNG THỜI.
//
// Đồng thời chứ không tuần tự là điểm mấu chốt: chạy tuần tự thì warm-pool kịp
// ấm lại giữa hai lượt và mọi claim đều đi nhánh warm — tức là ta sẽ không bao
// giờ chạm cold-path lẫn trần quota, và AC "session thứ N rơi cold path" trở
// thành một câu không phép đo nào chạm tới.
//
// ⛔ VẾ ĐƯỢC KHẲNG ĐỊNH Ở ĐÂY LÀ *HÌNH DẠNG CỦA LỖI*, KHÔNG PHẢI SỐ LƯỢT THÀNH
// CÔNG. Bao nhiêu lượt qua được phụ thuộc nhịp replenish tại đúng mili-giây đó,
// nên assert một con số là dựng một test lệ thuộc thời gian — nó sẽ đỏ ngẫu
// nhiên và người sau sẽ nới nó cho tới khi nó không kiểm gì. Tính chất BỀN là:
// chạm trần quota phải trả `ResourceExhausted` — một mã phân biệt được — chứ
// KHÔNG phải `Internal`/`Unknown`. Trần là một sự thật về hạ tầng mà client xử
// lý được ("thử lại sau"); `Internal` nghĩa là "server hỏng", và gộp hai thứ đó
// làm một là cách một nền tảng hết chỗ trông y hệt một nền tảng có bug.
func (p *probe) casePoolSaturate(ctx context.Context) {
	type outcome struct {
		idx  int
		sess *orchestratorv1.Session
		err  error
	}
	res := make([]outcome, p.n)
	var wg sync.WaitGroup
	for i := range p.n {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s, err := p.create(ctx, fmt.Sprintf("%s-u%d", p.userA, i), fmt.Sprintf("pool-%s-%d", p.tag, i))
			res[i] = outcome{idx: i, sess: s, err: err}
		}(i)
	}
	wg.Wait()

	ok, badCode := 0, 0
	for _, r := range res {
		if r.err == nil {
			ok++
			p.kv(fmt.Sprintf("lượt %d", r.idx), fmt.Sprintf("OK   id=%s pod=%s", r.sess.GetId(), r.sess.GetPodName()))
			continue
		}
		c := codeOf(r.err)
		p.kv(fmt.Sprintf("lượt %d", r.idx), fmt.Sprintf("LỖI  code=%s  %s", c, status.Convert(r.err).Message()))
		if c != codes.ResourceExhausted {
			badCode++
		}
	}

	p.check("có ít nhất một lượt thành công", ok > 0, fmt.Sprintf("%d/%d thành công", ok, p.n))
	p.check("mọi lượt hỏng đều là ResourceExhausted (không Internal/Unknown)",
		badCode == 0, fmt.Sprintf("%d lượt hỏng sai mã", badCode))

	if p.hold > 0 {
		fmt.Printf("  > HOLD-BAT-DAU %s (%s)\n", time.Now().UTC().Format(time.RFC3339), p.hold)
		time.Sleep(p.hold)
		fmt.Printf("  > HOLD-KET-THUC %s\n", time.Now().UTC().Format(time.RFC3339))
	}

	// Dọn NGAY cả khi có ca đỏ: trần quota lab là 4 pod, để lại session là mọi
	// phép đo sau đỏ vì hết chỗ chứ không vì hệ thống.
	for _, r := range res {
		if r.err == nil {
			p.cleanup(ctx, r.sess, fmt.Sprintf("%s-u%d", p.userA, r.idx))
		}
	}
}

// ---------------------------------------------------------------- AC: GetSession

// caseGet — AC "GetSession với user_id sai → NotFound (không phải PermissionDenied)".
//
// PermissionDenied XÁC NHẬN session tồn tại, biến RPC thành oracle dò id.
func (p *probe) caseGet(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "get-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, sess, p.userA)
	p.kv("session", fmt.Sprintf("id=%s pod=%s", sess.GetId(), sess.GetPodName()))

	_, err = p.client.GetSession(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: sess.GetId(), UserId: p.userB,
	})
	p.check("user lạ → NotFound (KHÔNG PermissionDenied)", codeOf(err) == codes.NotFound,
		fmt.Sprintf("code=%s", codeOf(err)))

	// Đối chứng dương: chủ thật phải đọc được. Thiếu vế này thì một hiện thực
	// trả NotFound cho TẤT CẢ vẫn qua ca trên.
	got, err := p.client.GetSession(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA,
	})
	p.check("đối chứng: chủ thật đọc được", err == nil && got.GetSession().GetId() == sess.GetId(),
		fmt.Sprintf("code=%s id=%s", codeOf(err), got.GetSession().GetId()))
}

// ---------------------------------------------------------------- AC: ClaimSession

// caseClaim — ClaimSession là đường ĐỌC LẠI idempotent, không phải bước tạo thứ
// hai (quyết định của B5–B9). Gọi nó phải trả đúng pod cũ, không sinh pod mới.
func (p *probe) caseClaim(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "claim-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, sess, p.userA)
	p.kv("session", fmt.Sprintf("id=%s pod=%s", sess.GetId(), sess.GetPodName()))

	resp, err := p.client.ClaimSession(ctx, &orchestratorv1.ClaimSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA,
	})
	p.check("ClaimSession trả đúng pod cũ",
		err == nil && resp.GetSession().GetPodName() == sess.GetPodName(),
		fmt.Sprintf("code=%s pod=%s", codeOf(err), resp.GetSession().GetPodName()))

	_, err = p.client.ClaimSession(ctx, &orchestratorv1.ClaimSessionRequest{
		SessionId: sess.GetId(), UserId: p.userB,
	})
	p.check("Claim của user lạ → NotFound", codeOf(err) == codes.NotFound,
		fmt.Sprintf("code=%s", codeOf(err)))
}

// ---------------------------------------------------------------- AC: ExtendSession

// caseExtend — AC "ExtendSession với expected_revision cũ → FailedPrecondition;
// mỗi lần ghi revision tăng đúng 1".
func (p *probe) caseExtend(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "extend-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, sess, p.userA)

	r0 := sess.GetRevision()
	p.kv("revision lúc tạo", fmt.Sprintf("%d", r0))

	// Đối chứng dương TRƯỚC: revision đúng phải đi qua.
	ok1, err := p.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA, ExpectedRevision: r0,
	})
	r1 := ok1.GetSession().GetRevision()
	p.check("đối chứng: revision ĐÚNG đi qua", err == nil, fmt.Sprintf("code=%s", codeOf(err)))
	p.check("revision tăng đúng 1", r1 == r0+1, fmt.Sprintf("%d → %d", r0, r1))

	// Vế chính: revision CŨ (r0) nay đã lỗi thời.
	_, err = p.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA, ExpectedRevision: r0,
	})
	p.check("revision cũ → FailedPrecondition", codeOf(err) == codes.FailedPrecondition,
		fmt.Sprintf("code=%s", codeOf(err)))

	// Và lượt bị từ chối KHÔNG được ghi gì: revision phải đứng nguyên ở r1.
	// Thiếu vế này thì một hiện thực "kiểm sau khi ghi" vẫn qua ca trên.
	after, err := p.client.GetSession(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA,
	})
	p.check("lượt bị từ chối không ghi gì", err == nil && after.GetSession().GetRevision() == r1,
		fmt.Sprintf("revision=%d, cần %d", after.GetSession().GetRevision(), r1))
}

// ---------------------------------------------------------------- AC: hard cap

// caseHardCap — AC "Gia hạn liên tục quá HARD_CAP → expires_at đứng yên,
// hard_cap_reached=true".
//
// Không chờ 2 giờ treo tường: `extend_seconds` là THAM SỐ của lời gọi, nên xin
// một khoảng lớn hơn trần là chạm trần ngay trong một lượt. Mốc trần tính từ
// `created_at`, nên phép kiểm là một đẳng thức tuyệt đối chứ không phải "xấp xỉ".
func (p *probe) caseHardCap(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "hardcap-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	defer p.cleanup(ctx, sess, p.userA)

	createdAt := sess.GetCreatedAt().AsTime()
	capAt := createdAt.Add(p.hardCap)
	p.kv("created_at", createdAt.UTC().Format(time.RFC3339))
	p.kv("trần cứng kỳ vọng", capAt.UTC().Format(time.RFC3339))

	huge := int32(p.hardCap.Seconds()) * 10
	first, err := p.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA, ExtendSeconds: huge,
	})
	if err != nil {
		p.check("gia hạn vượt trần gọi được", false, fmt.Sprintf("code=%s", codeOf(err)))
		return
	}
	e1 := first.GetSession().GetExpiresAt().AsTime()
	p.kv("expires_at sau lượt 1", e1.UTC().Format(time.RFC3339))
	p.check("hard_cap_reached = true", first.GetHardCapReached(),
		fmt.Sprintf("%v", first.GetHardCapReached()))
	p.check("expires_at bị cắt ĐÚNG mốc created_at+HARD_CAP", e1.Equal(capAt),
		fmt.Sprintf("%s vs %s", e1.UTC().Format(time.RFC3339), capAt.UTC().Format(time.RFC3339)))

	second, err := p.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA, ExtendSeconds: huge,
	})
	if err != nil {
		p.check("gia hạn lượt 2 gọi được", false, fmt.Sprintf("code=%s", codeOf(err)))
		return
	}
	e2 := second.GetSession().GetExpiresAt().AsTime()
	p.kv("expires_at sau lượt 2", e2.UTC().Format(time.RFC3339))
	p.check("expires_at ĐỨNG YÊN ở lượt 2", e2.Equal(e1),
		fmt.Sprintf("%s vs %s", e2.UTC().Format(time.RFC3339), e1.UTC().Format(time.RFC3339)))
	p.check("hard_cap_reached vẫn true ở lượt 2", second.GetHardCapReached(),
		fmt.Sprintf("%v", second.GetHardCapReached()))
}

// ---------------------------------------------------------------- AC: ReapSession

// caseReap — AC "ReapSession gọi 2 lần → cả hai OK; gọi với user_id người khác →
// từ chối, pod VẪN SỐNG".
//
// Vế "pod vẫn sống" có hai tầng: Redis (probe kiểm được — session còn đọc được
// và pod_name không đổi) và apiserver (wrapper kiểm bằng kubectl trên đúng tên
// pod mà probe in ra). Probe in tên pod để tầng thứ hai kiểm được.
func (p *probe) caseReap(ctx context.Context) {
	sess, err := p.create(ctx, p.userA, "reap-"+p.tag)
	if err != nil {
		p.check("tạo được session", false, fmt.Sprintf("err=%v", err))
		return
	}
	p.kv("PODNAME", sess.GetPodName())
	p.kv("SESSIONID", sess.GetId())

	_, err = p.client.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
		SessionId: sess.GetId(),
		Reason:    "probe: reap của người khác",
		Actor:     &orchestratorv1.ReapSessionRequest_UserId{UserId: p.userB},
	})
	p.check("reap của user lạ bị từ chối (NotFound)", codeOf(err) == codes.NotFound,
		fmt.Sprintf("code=%s", codeOf(err)))

	alive, err := p.client.GetSession(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: sess.GetId(), UserId: p.userA,
	})
	p.check("session vẫn sống sau lần reap bị từ chối",
		err == nil && alive.GetSession().GetPodName() == sess.GetPodName() &&
			alive.GetSession().GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_REAPED,
		fmt.Sprintf("code=%s status=%s pod=%s", codeOf(err),
			alive.GetSession().GetStatus(), alive.GetSession().GetPodName()))

	if p.hold > 0 {
		// Cửa sổ cho người quan sát bên ngoài (kubectl) kiểm pod ở APISERVER.
		// In mốc thời gian hai đầu để report ghép được snapshot với cửa sổ này
		// thay vì tin rằng chúng trùng nhau.
		fmt.Printf("  > HOLD-BAT-DAU %s (%s)\n", time.Now().UTC().Format(time.RFC3339), p.hold)
		time.Sleep(p.hold)
		fmt.Printf("  > HOLD-KET-THUC %s\n", time.Now().UTC().Format(time.RFC3339))
	}

	// Chủ thật reap: lượt 1 và lượt 2 đều OK, revision KHÔNG đổi giữa hai lượt
	// (đổi thì một gateway đang cầm revision đúng bỗng thấy lệch).
	r1, err1 := p.client.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
		SessionId: sess.GetId(), Reason: "probe: chủ thật",
		Actor: &orchestratorv1.ReapSessionRequest_UserId{UserId: p.userA},
	})
	p.check("chủ thật reap lượt 1 → OK + REAPED",
		err1 == nil && r1.GetSession().GetStatus() == orchestratorv1.SessionStatus_SESSION_STATUS_REAPED,
		fmt.Sprintf("code=%s status=%s", codeOf(err1), r1.GetSession().GetStatus()))

	r2, err2 := p.client.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
		SessionId: sess.GetId(), Reason: "probe: chủ thật, lượt 2",
		Actor: &orchestratorv1.ReapSessionRequest_UserId{UserId: p.userA},
	})
	p.check("reap lượt 2 cũng OK (idempotent)", err2 == nil, fmt.Sprintf("code=%s", codeOf(err2)))
	p.check("revision không đổi giữa hai lượt reap",
		err2 == nil && r2.GetSession().GetRevision() == r1.GetSession().GetRevision(),
		fmt.Sprintf("%d vs %d", r1.GetSession().GetRevision(), r2.GetSession().GetRevision()))
}
