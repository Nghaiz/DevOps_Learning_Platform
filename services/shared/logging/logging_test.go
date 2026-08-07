package logging_test

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"
)

func TestNewEmitsJSONWithServiceIdentity(t *testing.T) {
	var buf bytes.Buffer
	log, err := logging.New(&buf, "info", "orchestrator", "v0.0.0")
	if err != nil {
		t.Fatalf("New() lỗi bất ngờ: %v", err)
	}

	log.Info("khởi động", "addr", ":9090")

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log không phải JSON hợp lệ: %v (raw=%q)", err, buf.String())
	}
	for key, want := range map[string]any{
		"service": "orchestrator",
		"version": "v0.0.0",
		"msg":     "khởi động",
		"addr":    ":9090",
	} {
		if entry[key] != want {
			t.Errorf("entry[%q] = %v, muốn %v", key, entry[key], want)
		}
	}
}

func TestNewFiltersBelowLevel(t *testing.T) {
	var buf bytes.Buffer
	log, err := logging.New(&buf, "warn", "svc", "v0")
	if err != nil {
		t.Fatalf("New() lỗi bất ngờ: %v", err)
	}

	log.Info("không được xuất hiện")
	if buf.Len() != 0 {
		t.Fatalf("log level warn vẫn ghi entry info: %q", buf.String())
	}
}

func TestNewRejectsUnknownLevel(t *testing.T) {
	if _, err := logging.New(&bytes.Buffer{}, "verbose", "svc", "v0"); err == nil {
		t.Fatal("New() muốn error với level lạ, nhận nil")
	}
}
