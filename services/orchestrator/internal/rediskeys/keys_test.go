package rediskeys_test

import (
	"strings"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/rediskeys"
)

// Bộ test vector này được nhân bản y hệt ở
// packages/shared-types/src/redis-keys.test.ts. Đổi một bên mà không đổi bên kia
// = key namespace lệch giữa Go và TS.

func TestPoolFree(t *testing.T) {
	if rediskeys.PoolFree != "pool:free" {
		t.Fatalf("PoolFree = %q, muốn %q", rediskeys.PoolFree, "pool:free")
	}
}

func TestSessionKeys(t *testing.T) {
	got, err := rediskeys.Session("abc123")
	if err != nil || got != "session:abc123" {
		t.Fatalf("Session() = (%q, %v), muốn (%q, nil)", got, err, "session:abc123")
	}

	got, err = rediskeys.SessionPod("abc123")
	if err != nil || got != "session:abc123:pod" {
		t.Fatalf("SessionPod() = (%q, %v), muốn (%q, nil)", got, err, "session:abc123:pod")
	}
}

func TestRejectsInvalidSessionID(t *testing.T) {
	for _, bad := range []string{"", "a:b", "a b", "a/b", strings.Repeat("x", 65)} {
		if _, err := rediskeys.Session(bad); err == nil {
			t.Errorf("Session(%q) muốn error, nhận nil", bad)
		}
		if _, err := rediskeys.SessionPod(bad); err == nil {
			t.Errorf("SessionPod(%q) muốn error, nhận nil", bad)
		}
	}
}
