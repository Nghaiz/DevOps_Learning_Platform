package rediskeys_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// Vector nạp từ docs/redis-key-vectors.json — CÙNG file mà
// packages/shared-types/src/redis-keys.test.ts đọc.
//
// Trước đây hai suite chép tay hai bản vector giống nhau, nghĩa là sửa một bản
// hiện thực mà quên bản kia thì cả hai vẫn xanh — một "guard" không gác gì.
// Đọc chung một byte thì lệch là đỏ.
type vectors struct {
	PoolFree      string   `json:"poolFree"`
	PoolClaimed   string   `json:"poolClaimed"`
	PoolQuarantine string  `json:"poolQuarantine"`
	PodPrefix     string   `json:"podPrefix"`
	SessionFields []string `json:"sessionFields"`
	IdemUserID    string   `json:"idemUserId"`
	Valid         []struct {
		ID         string `json:"id"`
		Session    string `json:"session"`
		SessionPod string `json:"sessionPod"`
		SessionWS  string `json:"sessionWs"`
		PodState   string `json:"podState"`
		Idem       string `json:"idem"`
	} `json:"valid"`
	Invalid []struct {
		ID  string `json:"id"`
		Why string `json:"_why"`
	} `json:"invalid"`
}

func load(t *testing.T) vectors {
	t.Helper()

	// BA cấp `..`, không phải bốn: package sống ở services/shared/rediskeys/ kể
	// từ phase-1 D7 (trước đó là services/orchestrator/internal/rediskeys/).
	path := filepath.Join("..", "..", "..", "docs", "redis-key-vectors.json")
	raw, err := os.ReadFile(path) //nolint:gosec // đường dẫn cố định trong repo
	if err != nil {
		t.Fatalf("đọc vector dùng chung %s: %v", path, err)
	}

	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vector dùng chung: %v", err)
	}
	if len(v.Valid) == 0 || len(v.Invalid) == 0 {
		t.Fatal("vector dùng chung rỗng")
	}
	return v
}

func TestPoolKeys(t *testing.T) {
	v := load(t)
	if rediskeys.PoolFree != v.PoolFree {
		t.Errorf("PoolFree = %q, muốn %q", rediskeys.PoolFree, v.PoolFree)
	}
	if rediskeys.PoolClaimed != v.PoolClaimed {
		t.Errorf("PoolClaimed = %q, muốn %q", rediskeys.PoolClaimed, v.PoolClaimed)
	}
	if rediskeys.PoolQuarantine != v.PoolQuarantine {
		t.Errorf("PoolQuarantine = %q, muốn %q", rediskeys.PoolQuarantine, v.PoolQuarantine)
	}
	// PodPrefix là thứ claim.lua nhận qua ARGV. Vector gác nó vì prefix nằm
	// trong file Lua thì không suite nào thấy được khi nó trôi.
	if rediskeys.PodPrefix != v.PodPrefix {
		t.Errorf("PodPrefix = %q, muốn %q", rediskeys.PodPrefix, v.PodPrefix)
	}
	if got, _ := rediskeys.Pod("sandbox-1"); got != v.PodPrefix+"sandbox-1" {
		t.Errorf("Pod() = %q, không khớp PodPrefix %q", got, v.PodPrefix)
	}
}

// Thứ tự cũng được so sánh: hai bản song sinh phải khai field theo đúng một thứ
// tự thì "thêm field mới" mới là một thao tác nhìn thấy được ở cả hai bên.
func TestSessionFields(t *testing.T) {
	want := load(t).SessionFields
	got := rediskeys.SessionFields

	if len(got) != len(want) {
		t.Fatalf("SessionFields có %d field, vector có %d: %v vs %v", len(got), len(want), got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("SessionFields[%d] = %q, muốn %q", i, got[i], want[i])
		}
	}
}

func TestValidIDs(t *testing.T) {
	v := load(t)
	for _, tc := range v.Valid {
		t.Run(tc.ID, func(t *testing.T) {
			for _, c := range []struct {
				name string
				got  func(string) (string, error)
				want string
			}{
				{"Session", rediskeys.Session, tc.Session},
				{"SessionPod", rediskeys.SessionPod, tc.SessionPod},
				{"SessionWS", rediskeys.SessionWS, tc.SessionWS},
				{"Pod", rediskeys.Pod, tc.PodState},
				{"Idem", func(id string) (string, error) { return rediskeys.Idem(v.IdemUserID, id) }, tc.Idem},
			} {
				got, err := c.got(tc.ID)
				if err != nil || got != c.want {
					t.Errorf("%s(%q) = (%q, %v), muốn (%q, nil)", c.name, tc.ID, got, err, c.want)
				}
			}
		})
	}
}

func TestInvalidIDs(t *testing.T) {
	v := load(t)
	for _, tc := range v.Invalid {
		t.Run(tc.Why, func(t *testing.T) {
			for _, c := range []struct {
				name string
				got  func(string) (string, error)
			}{
				{"Session", rediskeys.Session},
				{"SessionPod", rediskeys.SessionPod},
				{"SessionWS", rediskeys.SessionWS},
				{"Pod", rediskeys.Pod},
				// Cả HAI đoạn của Idem đều phải bị gác: một userId bẩn cũng bẻ
				// được namespace y như một idempotency_key bẩn.
				{"Idem(key bẩn)", func(id string) (string, error) { return rediskeys.Idem(v.IdemUserID, id) }},
				{"Idem(userId bẩn)", func(id string) (string, error) { return rediskeys.Idem(id, "k") }},
			} {
				if _, err := c.got(tc.ID); err == nil {
					t.Errorf("%s(%q) muốn error (%s), nhận nil", c.name, tc.ID, tc.Why)
				}
			}
		})
	}
}

// Hai user gửi CÙNG một idempotency_key phải ra HAI key khác nhau. Đây là ca
// duy nhất chứng minh scope-theo-user tồn tại — mọi ca ở trên vẫn xanh với một
// hiện thực dùng namespace toàn cục.
func TestIdemScopeTheoUser(t *testing.T) {
	a, err := rediskeys.Idem("userA", "cung-mot-key")
	if err != nil {
		t.Fatal(err)
	}
	b, err := rediskeys.Idem("userB", "cung-mot-key")
	if err != nil {
		t.Fatal(err)
	}
	if a == b {
		t.Fatalf("hai user trùng idempotency_key ra CÙNG key %q — user B sẽ nhận lại session của user A", a)
	}
}
