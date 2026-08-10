// bench-claim đo AC "claim từ warm-pool p95 < 1s (≥ 50 mẫu)" của phase-1.md.
//
// VÌ SAO LÀ MỘT CHƯƠNG TRÌNH TRONG REPO, KHÔNG PHẢI MỘT VÒNG `grpcurl`:
// con số này là acceptance criteria, nên nó phải ĐO LẠI ĐƯỢC ở mọi chặng sau
// (đổi image ở 1.E, đổi pod builder, lên cloud multi-node). Một lệnh bash gõ
// tay trên VM không tái lập được và không ai chạy lại nó.
//
// ⛔ ĐỌC p95 TỪ HISTOGRAM CỦA SERVER, KHÔNG PHẢI TỪ ĐỒNG HỒ CLIENT.
// AC nói rõ `dlp_claim_duration_seconds`. Đo phía client sẽ cộng thêm RTT mạng,
// thời gian mã hoá protobuf và độ trễ lập lịch của Go — tức đo một thứ KHÁC và
// gần như chắc chắn tệ hơn, rồi kết luận sai rằng warm-pool chậm. Client ở đây
// chỉ có nhiệm vụ SINH TẢI; số liệu lấy từ /metrics.
//
// ⛔ VÌ SAO PHẢI REAP + CHỜ REPLENISH GIỮA HAI LƯỢT:
// `POOL_TARGET=1` (D16) nghĩa là pool chỉ giữ sẵn MỘT pod ấm. Bắn 50 lượt
// CreateSession liên tiếp thì lượt đầu warm còn 49 lượt sau rơi hết vào
// cold-path — đo ra một p95 vài giây rồi kết luận "warm-pool không đạt AC",
// trong khi thứ vừa đo không phải warm-pool. Mỗi vòng vì thế: claim → reap →
// chờ `pool:free` đầy lại → claim tiếp.
//
//	go run ./cmd/bench-claim -addr localhost:9090 -metrics localhost:8081 -n 50
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
)

func main() {
	addr := flag.String("addr", "localhost:9090", "địa chỉ gRPC của orchestrator")
	metricsAddr := flag.String("metrics", "localhost:8081", "địa chỉ /metrics của orchestrator")
	n := flag.Int("n", 50, "số mẫu (AC đòi ≥ 50)")
	userID := flag.String("user", "bench-user", "user_id dùng cho mọi lượt")
	replenishWait := flag.Duration("replenish-wait", 60*time.Second, "trần chờ pool đầy lại giữa hai lượt")
	flag.Parse()

	if err := run(*addr, *metricsAddr, *n, *userID, *replenishWait); err != nil {
		fmt.Fprintf(os.Stderr, "bench-claim: %v\n", err)
		os.Exit(1)
	}
}

func run(addr, metricsAddr string, n int, userID string, replenishWait time.Duration) error {
	ctx := context.Background()

	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("nối gRPC %s: %w", addr, err)
	}
	// `_ =` tường minh: errcheck bắt mọi Close() bị bỏ lơ. Ở đây lỗi đóng
	// kết nối không có hành động khắc phục nào (chương trình đang thoát) nên
	// nuốt nó là ĐÚNG — nhưng phải nuốt có chữ ký, không phải nuốt do quên.
	defer func() { _ = conn.Close() }()
	cli := orchestratorv1.NewSessionServiceClient(conn)

	metricsURL := "http://" + metricsAddr + "/metrics"

	// Mốc TRƯỚC. p95 phải tính trên các mẫu của LƯỢT CHẠY NÀY: histogram là
	// cộng dồn từ lúc process khởi động, nên đọc thẳng nó sẽ trộn cả những lượt
	// claim cũ (kể cả lượt cold-path lúc dựng cluster) vào kết quả.
	before, err := scrapeBuckets(metricsURL, "warm")
	if err != nil {
		return fmt.Errorf("đọc /metrics (mốc trước): %w", err)
	}

	coldBefore, err := scrapeBuckets(metricsURL, "cold")
	if err != nil {
		return fmt.Errorf("đọc /metrics nhánh cold (mốc trước): %w", err)
	}

	// ⛔ LẶP TỚI KHI ĐỦ MẪU WARM, KHÔNG PHẢI LẶP ĐÚNG n LẦN.
	//
	// Bản đầu chạy đúng n vòng rồi tuyên bố "đạt AC ≥ n mẫu". Đo thật: 50 vòng
	// chỉ sinh 25 mẫu warm — nửa còn lại rơi cold-path vì `dlp_pool_free_size`
	// là gauge cập nhật theo nhịp replenish, nên nó đọc > 0 trong khi pod ấm đã
	// bị lượt trước lấy mất. Tức bản đầu IN RA MÀU XANH VỚI MỘT NỬA SỐ MẪU mà
	// AC đòi — chính xác kiểu cổng tự cho điểm mình mà plan này phê phán.
	// `waitPoolFree` chỉ là gợi ý nhịp; thứ ĐẾM ĐƯỢC là histogram của server.
	maxIter := n * 4
	iter := 0
	for iter < maxIter {
		warmNow, err := scrapeBuckets(metricsURL, "warm")
		if err != nil {
			return fmt.Errorf("đọc /metrics giữa chừng: %w", err)
		}
		if warmNow[bucketInf]-before[bucketInf] >= float64(n) {
			break
		}
		iter++
		i := iter

		// Chờ pool có pod ấm trước khi bấm giờ. Đây là NHỊP, không phải bảo đảm.
		waitPoolFree(metricsURL, replenishWait)

		resp, err := cli.CreateSession(ctx, &orchestratorv1.CreateSessionRequest{
			UserId:         userID,
			Tier:           orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX,
			TtlSeconds:     600,
			IdempotencyKey: fmt.Sprintf("bench-%d-%d", time.Now().UnixNano(), i),
		})
		if err != nil {
			return fmt.Errorf("CreateSession lượt %d: %w", i+1, err)
		}

		// Trả pod về ngay. Không reap thì lượt thứ 4 đụng trần quota (D16:
		// trần đồng thời = 4 − POOL_TARGET) và bench dừng giữa chừng vì hết
		// chỗ, chứ không phải vì hệ thống chậm.
		if _, err := cli.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
			SessionId: resp.GetSession().GetId(),
			Reason:    "bench-claim",
			Actor:     &orchestratorv1.ReapSessionRequest_UserId{UserId: userID},
		}); err != nil {
			return fmt.Errorf("ReapSession lượt %d: %w", i+1, err)
		}

		if (i+1)%10 == 0 {
			fmt.Printf("  … %d/%d\n", i+1, n)
		}
	}

	after, err := scrapeBuckets(metricsURL, "warm")
	if err != nil {
		return fmt.Errorf("đọc /metrics (mốc sau): %w", err)
	}
	coldAfter, err := scrapeBuckets(metricsURL, "cold")
	if err != nil {
		return fmt.Errorf("đọc /metrics nhánh cold (mốc sau): %w", err)
	}

	delta := subtract(after, before)
	warmN := delta[bucketInf]
	coldN := subtract(coldAfter, coldBefore)[bucketInf]

	fmt.Printf("\nlượt gọi CreateSession: %d\n", iter)
	fmt.Printf("mẫu warm thu được:      %v\n", warmN)
	fmt.Printf("mẫu cold (không tính):  %v\n", coldN)

	// Cổng SỐ MẪU đứng TRƯỚC cổng p95. Một p95 đẹp trên 25 mẫu không đáp ứng
	// một AC viết là "≥ 50 mẫu", và báo xanh trong ca đó là nói dối về thứ vừa đo.
	if warmN < float64(n) {
		fmt.Printf("\nKẾT QUẢ: ĐỎ — chỉ %v mẫu warm, AC đòi ≥ %d. "+
			"Pool không kịp ấm lại trong %d lượt; nới -replenish-wait hoặc tăng POOL_TARGET rồi đo lại.\n",
			warmN, n, iter)
		os.Exit(1)
	}

	p95, ok := percentileFromBuckets(delta, 0.95)
	if !ok {
		return fmt.Errorf("không tính được p95: phân vị rơi vào bucket +Inf (%v mẫu)", warmN)
	}

	fmt.Printf("p95 (dlp_claim_duration_seconds{path=\"warm\"}): %.3fs\n", p95)
	if p95 >= 1.0 {
		fmt.Printf("KẾT QUẢ: ĐỎ — AC đòi p95 < 1s\n")
		os.Exit(1)
	}
	fmt.Printf("KẾT QUẢ: XANH — p95 < 1s trên %v mẫu warm (AC đòi ≥ %d)\n", warmN, n)
	return nil
}

// bucketInf là khoá của bucket `+Inf` (tổng số mẫu).
const bucketInf = "+Inf"

// scrapeBuckets đọc bucket cộng dồn của một nhánh (`warm` / `cold`).
func scrapeBuckets(url, path string) (map[string]float64, error) {
	resp, err := http.Get(url) //nolint:gosec // URL do người vận hành truyền vào, không phải input ngoài
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	out := map[string]float64{}
	for _, line := range strings.Split(string(body), "\n") {
		if !strings.HasPrefix(line, "dlp_claim_duration_seconds_bucket{") ||
			!strings.Contains(line, `path="`+path+`"`) {
			continue
		}
		le, val, ok := parseBucket(line)
		if !ok {
			continue
		}
		out[le] = val
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("không thấy series dlp_claim_duration_seconds_bucket{path=%q} tại %s", path, url)
	}
	return out, nil
}

func parseBucket(line string) (le string, val float64, ok bool) {
	i := strings.Index(line, `le="`)
	if i < 0 {
		return "", 0, false
	}
	rest := line[i+4:]
	j := strings.Index(rest, `"`)
	if j < 0 {
		return "", 0, false
	}
	le = rest[:j]

	k := strings.LastIndex(line, " ")
	if k < 0 {
		return "", 0, false
	}
	val, err := strconv.ParseFloat(strings.TrimSpace(line[k+1:]), 64)
	if err != nil {
		return "", 0, false
	}
	return le, val, true
}

func subtract(after, before map[string]float64) map[string]float64 {
	out := map[string]float64{}
	for le, v := range after {
		out[le] = v - before[le]
	}
	return out
}

// percentileFromBuckets nội suy tuyến tính trong bucket chứa phân vị — cùng
// cách `histogram_quantile` của Prometheus làm, để số in ra ở đây khớp số đọc
// trên dashboard thay vì là một phương pháp thứ hai không ai đối chiếu được.
func percentileFromBuckets(buckets map[string]float64, q float64) (float64, bool) {
	total := buckets[bucketInf]
	if total <= 0 {
		return 0, false
	}

	type b struct {
		le    float64
		count float64
	}
	var list []b
	for le, c := range buckets {
		if le == bucketInf {
			continue
		}
		f, err := strconv.ParseFloat(le, 64)
		if err != nil {
			continue
		}
		list = append(list, b{le: f, count: c})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].le < list[j].le })

	target := q * total
	prevLe, prevCount := 0.0, 0.0
	for _, cur := range list {
		if cur.count >= target {
			if cur.count == prevCount {
				return cur.le, true
			}
			ratio := (target - prevCount) / (cur.count - prevCount)
			return prevLe + ratio*(cur.le-prevLe), true
		}
		prevLe, prevCount = cur.le, cur.count
	}
	// Phân vị nằm trong bucket +Inf: không có cận trên hữu hạn nên không bịa ra
	// một con số — báo thất bại để người đọc biết pool đang chậm hơn bucket lớn
	// nhất, thay vì nhận một giá trị trông như đo được.
	return 0, false
}

// waitPoolFree chờ `dlp_pool_free_size` > 0. Trả false nếu hết hạn chờ.
func waitPoolFree(metricsURL string, budget time.Duration) bool {
	deadline := time.Now().Add(budget)
	for time.Now().Before(deadline) {
		if v, ok := scrapeGauge(metricsURL, "dlp_pool_free_size"); ok && v > 0 {
			return true
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false
}

func scrapeGauge(url, name string) (float64, bool) {
	resp, err := http.Get(url) //nolint:gosec // như trên
	if err != nil {
		return 0, false
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, false
	}
	for _, line := range strings.Split(string(body), "\n") {
		if !strings.HasPrefix(line, name+" ") {
			continue
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimPrefix(line, name+" ")), 64)
		if err != nil {
			return 0, false
		}
		return v, true
	}
	return 0, false
}
