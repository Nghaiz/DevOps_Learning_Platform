package envx_test

import (
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
)

func TestStringFallsBackWhenUnset(t *testing.T) {
	if got := envx.String("DLP_TEST_UNSET", "def"); got != "def" {
		t.Fatalf("String() = %q, muốn %q", got, "def")
	}

	t.Setenv("DLP_TEST_SET", "value")
	if got := envx.String("DLP_TEST_SET", "def"); got != "value" {
		t.Fatalf("String() = %q, muốn %q", got, "value")
	}
}

func TestIntRejectsGarbageInsteadOfFallingBack(t *testing.T) {
	t.Setenv("DLP_TEST_INT", "không-phải-số")
	if _, err := envx.Int("DLP_TEST_INT", 7); err == nil {
		t.Fatal("Int() muốn error khi giá trị sai định dạng, nhận nil")
	}
}

func TestDuration(t *testing.T) {
	t.Setenv("DLP_TEST_DUR", "15m")
	got, err := envx.Duration("DLP_TEST_DUR", time.Second)
	if err != nil {
		t.Fatalf("Duration() lỗi bất ngờ: %v", err)
	}
	if got != 15*time.Minute {
		t.Fatalf("Duration() = %v, muốn %v", got, 15*time.Minute)
	}
}

func TestDurationRejectsNonPositive(t *testing.T) {
	t.Setenv("DLP_TEST_DUR", "0s")
	if _, err := envx.Duration("DLP_TEST_DUR", time.Second); err == nil {
		t.Fatal("Duration() muốn error với 0s, nhận nil")
	}
}

func TestRequire(t *testing.T) {
	if _, err := envx.Require("DLP_TEST_MISSING"); err == nil {
		t.Fatal("Require() muốn error khi thiếu, nhận nil")
	}

	t.Setenv("DLP_TEST_PRESENT", "x")
	if got, err := envx.Require("DLP_TEST_PRESENT"); err != nil || got != "x" {
		t.Fatalf("Require() = (%q, %v), muốn (%q, nil)", got, err, "x")
	}
}
