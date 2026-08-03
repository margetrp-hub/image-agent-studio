package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/migration"
)

func TestRunEmitsMachineReadableDryRunReport(t *testing.T) {
	source := t.TempDir()
	asset := filepath.Join(source, "users", "legacy-user", "assets", "record", "0.png")
	if err := os.MkdirAll(filepath.Dir(asset), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(asset, []byte("image"), 0o600); err != nil {
		t.Fatal(err)
	}

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := run([]string{"--source", source}, &stdout, &stderr); code != 0 {
		t.Fatalf("run code=%d stderr=%s", code, stderr.String())
	}
	var report migration.Report
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatalf("decode report: %v\n%s", err, stdout.String())
	}
	if !report.DryRun || report.Scanned != 1 || report.Imported != 1 {
		t.Fatalf("unexpected report: %#v", report)
	}
	if _, err := os.Stat(filepath.Join(source, "studio-go", "assets")); !os.IsNotExist(err) {
		t.Fatalf("dry-run created default target: %v", err)
	}
}

func TestRunRequiresSource(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	t.Setenv("STUDIO_DATA_DIR", "")
	if code := run(nil, &stdout, &stderr); code != 1 {
		t.Fatalf("run code=%d stdout=%s stderr=%s", code, stdout.String(), stderr.String())
	}
	var failure map[string]string
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil || failure["error"] == "" {
		t.Fatalf("stderr is not a machine-readable error: %v %s", err, stderr.String())
	}
}
