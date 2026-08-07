// Package rediskeys dựng key Redis theo namespace v0.
//
// SSOT của quy ước: docs/redis-key-namespace.md.
// Bản song sinh TypeScript: packages/shared-types/src/redis-keys.ts.
// Test của cả hai bản đọc chung đúng một file: docs/redis-key-vectors.json.
package rediskeys

import (
	"fmt"
	"regexp"
)

// PoolFree chứa id của pod đang WARM, chờ được claim.
const PoolFree = "pool:free"

// idPattern chặn ký tự bẻ được namespace: session id "a:pod" sẽ biến
// "session:a:pod" thành key thuộc về session khác.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Session trả key hash trạng thái session — SSOT của session đang sống.
func Session(sessionID string) (string, error) {
	if err := validateID(sessionID); err != nil {
		return "", err
	}
	return "session:" + sessionID, nil
}

// SessionPod trả key ánh xạ session → tên pod đang phục vụ nó.
func SessionPod(sessionID string) (string, error) {
	if err := validateID(sessionID); err != nil {
		return "", err
	}
	return "session:" + sessionID + ":pod", nil
}

func validateID(sessionID string) error {
	if !idPattern.MatchString(sessionID) {
		return fmt.Errorf("session id %q không hợp lệ cho Redis key (cần khớp %s)", sessionID, idPattern)
	}
	return nil
}
