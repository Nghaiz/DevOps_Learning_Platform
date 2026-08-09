package grpcserver_test

import (
	"context"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
)

// runInterceptor chạy interceptor với một handler đánh dấu "đã tới".
func runInterceptor(
	ctx context.Context, t *testing.T, requireMTLS bool,
) (reached bool, trust grpcserver.PeerTrust, err error) {
	t.Helper()
	interceptor := grpcserver.NewAuthInterceptor(discardLogger(), requireMTLS)
	_, err = interceptor(ctx, nil, &grpc.UnaryServerInfo{FullMethod: "/test/Method"},
		func(inner context.Context, _ interface{}) (interface{}, error) {
			reached = true
			trust = grpcserver.TrustFromContext(inner)
			return nil, nil
		})
	return reached, trust, err
}

func ctxWithPeer() context.Context {
	// Peer KHÔNG có AuthInfo TLS — đúng trạng thái của một kết nối insecure,
	// tức mọi kết nối tới orchestrator hôm nay (chưa có grpc.Creds nào).
	return peer.NewContext(context.Background(), &peer.Peer{
		Addr: &net.TCPAddr{IP: net.ParseIP("10.244.0.7"), Port: 40000},
	})
}

// TestInterceptorTatThiKhongChungMinhDuocGi.
//
// Với GRPC_REQUIRE_MTLS=false, interceptor phải nói THẲNG là không chứng minh
// được gì (InCluster=false) thay vì đoán bằng dải IP — mọi pod trong cluster đều
// nằm trong pod CIDR, kể cả pod của sinh viên nếu NetworkPolicy hở, nên một
// heuristic theo IP cho kết quả "hợp lệ" cho chính thứ nó phải chặn.
func TestInterceptorTatThiKhongChungMinhDuocGi(t *testing.T) {
	reached, trust, err := runInterceptor(ctxWithPeer(), t, false)
	if err != nil {
		t.Fatalf("cổng tắt không được chặn request: %v", err)
	}
	if !reached {
		t.Fatal("handler không được gọi")
	}
	if trust.InCluster {
		t.Fatal("InCluster=true dù không có cert nào — đây là đoán, không phải chứng minh")
	}
	if trust.Addr == "" {
		t.Error("Addr rỗng — vẫn cần cho log/chẩn đoán (nhưng KHÔNG được dùng làm căn cứ authz)")
	}
}

// TestInterceptorBatMaKhongCoPeerThiTUCHOI (H-2, vế fail-open).
//
// ⛔ Bản đầu đặt nhánh từ chối BÊN TRONG `if p, ok := peer.FromContext(ctx)`,
// nên một request KHÔNG có peer đi thẳng qua handler dù cổng đang bật —
// fail-OPEN, ngược hẳn với lập luận trong chính doc comment phía trên nó.
func TestInterceptorBatMaKhongCoPeerThiTuChoi(t *testing.T) {
	reached, _, err := runInterceptor(context.Background(), t, true)
	if reached {
		t.Fatal("handler ĐÃ CHẠY dù cổng bật và không xác định được peer — fail-OPEN")
	}
	if got := status.Code(err); got != codes.Unauthenticated {
		t.Fatalf("code = %v, cần Unauthenticated", got)
	}
}

// TestInterceptorBatMaPeerKhongCoCertThiTUCHOI.
func TestInterceptorBatMaPeerKhongCoCertThiTuChoi(t *testing.T) {
	reached, _, err := runInterceptor(ctxWithPeer(), t, true)
	if reached {
		t.Fatal("handler ĐÃ CHẠY dù peer không trình được client certificate")
	}
	if got := status.Code(err); got != codes.Unauthenticated {
		t.Fatalf("code = %v, cần Unauthenticated", got)
	}
}

// TestTrustFromContextMacDinhFailClosed — context chưa qua interceptor phải cho
// zero value, tức InCluster=false. Nếu nó cho true thì mọi test khác vô nghĩa.
func TestTrustFromContextMacDinhFailClosed(t *testing.T) {
	if grpcserver.TrustFromContext(context.Background()).InCluster {
		t.Fatal("context rỗng cho InCluster=true — fail-open ở tầng đọc")
	}
}
