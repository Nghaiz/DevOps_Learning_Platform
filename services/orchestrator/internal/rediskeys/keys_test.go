package rediskeys_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/rediskeys"
)

// Vector nạp từ docs/redis-key-vectors.json — CÙNG file mà
// packages/shared-types/src/redis-keys.test.ts đọc.
//
// Trước đây hai suite chép tay hai bản vector giống nhau, nghĩa là sửa một bản
// hiện thực mà quên bản kia thì cả hai vẫn xanh — một "guard" không gác gì.
// Đọc chung một byte thì lệch là đỏ.
type vectors struct {
	PoolFree string `json:"poolFree"`
	Valid    []struct {
		ID      string `json:"id"`
		Session string `json:"session"`
		Pod     string `json:"pod"`
	} `json:"valid"`
	Invalid []struct {
		ID  string `json:"id"`
		Why string `json:"_why"`
	} `json:"invalid"`
}

func load(t *testing.T) vectors {
	t.Helper()

	path := filepath.Join("..", "..", "..", "..", "docs", "redis-key-vectors.json")
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

func TestPoolFree(t *testing.T) {
	want := load(t).PoolFree
	if rediskeys.PoolFree != want {
		t.Fatalf("PoolFree = %q, muốn %q", rediskeys.PoolFree, want)
	}
}

func TestValidSessionIDs(t *testing.T) {
	for _, tc := range load(t).Valid {
		t.Run(tc.ID, func(t *testing.T) {
			got, err := rediskeys.Session(tc.ID)
			if err != nil || got != tc.Session {
				t.Errorf("Session(%q) = (%q, %v), muốn (%q, nil)", tc.ID, got, err, tc.Session)
			}

			got, err = rediskeys.SessionPod(tc.ID)
			if err != nil || got != tc.Pod {
				t.Errorf("SessionPod(%q) = (%q, %v), muốn (%q, nil)", tc.ID, got, err, tc.Pod)
			}
		})
	}
}

func TestInvalidSessionIDs(t *testing.T) {
	for _, tc := range load(t).Invalid {
		t.Run(tc.Why, func(t *testing.T) {
			if _, err := rediskeys.Session(tc.ID); err == nil {
				t.Errorf("Session(%q) muốn error (%s), nhận nil", tc.ID, tc.Why)
			}
			if _, err := rediskeys.SessionPod(tc.ID); err == nil {
				t.Errorf("SessionPod(%q) muốn error (%s), nhận nil", tc.ID, tc.Why)
			}
		})
	}
}
