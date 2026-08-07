// Package envx đọc cấu hình từ biến môi trường.
//
// Giá trị sai định dạng luôn trả error thay vì âm thầm rơi về default: một
// TTL gõ nhầm mà service vẫn khởi động được là bug chỉ lộ ra lúc 3 giờ sáng
// (rules/development-principles.md — Errors Over Silent Fallbacks).
package envx

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

// String trả giá trị của key, hoặc def nếu key không đặt / rỗng.
func String(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Int phân giải key thành số nguyên. Key không đặt → def. Đặt nhưng sai → error.
func Int(key string, def int) (int, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return def, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("env %s: %q không phải số nguyên: %w", key, raw, err)
	}
	return v, nil
}

// Duration phân giải key thành time.Duration (ví dụ "15m", "30s").
func Duration(key string, def time.Duration) (time.Duration, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return def, nil
	}
	v, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("env %s: %q không phải duration hợp lệ: %w", key, raw, err)
	}
	if v <= 0 {
		return 0, fmt.Errorf("env %s: %q phải dương", key, raw)
	}
	return v, nil
}

// Bool phân giải key thành bool ("true"/"false"/"1"/"0").
func Bool(key string, def bool) (bool, error) {
	raw := os.Getenv(key)
	if raw == "" {
		return def, nil
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("env %s: %q không phải bool: %w", key, raw, err)
	}
	return v, nil
}

// Require trả giá trị của key, hoặc error nếu key không đặt. Dùng cho secret và
// DSN — thứ không có default an toàn.
func Require(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("env %s: bắt buộc nhưng chưa đặt", key)
	}
	return v, nil
}
