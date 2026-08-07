// Package logging dựng structured JSON logger dùng chung.
//
// JSON từ P0 chứ không phải "thêm sau": log của pod đi thẳng vào Loki, và
// định dạng người-đọc-được sẽ phải parse lại bằng regex (plan.md §4).
package logging

import (
	"fmt"
	"io"
	"log/slog"
	"strings"
)

// New tạo logger JSON ghi ra w. level nhận debug|info|warn|error (không phân biệt hoa thường).
func New(w io.Writer, level, service, version string) (*slog.Logger, error) {
	lvl, err := parseLevel(level)
	if err != nil {
		return nil, err
	}

	handler := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: lvl})
	return slog.New(handler).With(
		slog.String("service", service),
		slog.String("version", version),
	), nil
}

func parseLevel(level string) (slog.Level, error) {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		return slog.LevelDebug, nil
	case "", "info":
		return slog.LevelInfo, nil
	case "warn", "warning":
		return slog.LevelWarn, nil
	case "error":
		return slog.LevelError, nil
	default:
		return 0, fmt.Errorf("log level %q không hợp lệ (debug|info|warn|error)", level)
	}
}
