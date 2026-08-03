package migration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRunDryRunApplyAndIdempotency(t *testing.T) {
	source := t.TempDir()
	target := filepath.Join(t.TempDir(), "asset-store")
	userDir := filepath.Join(source, "users", "legacy-user")
	first := filepath.Join(userDir, "assets", "record-a", "0.png")
	duplicate := filepath.Join(userDir, "assets", "record-b", "0.png")
	writeTestFile(t, first, []byte("same image bytes"))
	writeTestFile(t, duplicate, []byte("same image bytes"))
	writeRecords(t, userDir, []map[string]any{
		{"resultUrls": []string{
			"/studio-api/history/record-a/assets/0.png",
			"/studio-api/history/missing-record/assets/0.png",
		}},
	})

	dryRun, err := Run(context.Background(), Options{SourceRoot: source, AssetRoot: target})
	if err != nil {
		t.Fatalf("dry-run failed: %v", err)
	}
	assertCounts(t, dryRun, 3, 1, 1, 1, 0)
	if !dryRun.DryRun {
		t.Fatal("dry-run report did not identify itself")
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("dry-run created target storage: %v", err)
	}

	applied, err := Run(context.Background(), Options{SourceRoot: source, AssetRoot: target, Apply: true})
	if err != nil {
		t.Fatalf("apply failed: %v", err)
	}
	assertCounts(t, applied, 3, 1, 1, 1, 0)
	digestBytes := sha256.Sum256([]byte("same image bytes"))
	digest := hex.EncodeToString(digestBytes[:])
	objectPath := filepath.Join(target, "objects", digest[:2], digest[2:4], digest)
	if data, err := os.ReadFile(objectPath); err != nil || string(data) != "same image bytes" {
		t.Fatalf("asset object was not imported: data=%q err=%v", data, err)
	}

	repeated, err := Run(context.Background(), Options{SourceRoot: source, AssetRoot: target, Apply: true})
	if err != nil {
		t.Fatalf("repeated apply failed: %v", err)
	}
	assertCounts(t, repeated, 3, 0, 2, 1, 0)
	if repeated.Mappings["users/legacy-user/assets/record-a/0.png"] != digest {
		t.Fatalf("mapping missing after repeated apply: %#v", repeated.Mappings)
	}
}

func TestRunRejectsEscapingSymlink(t *testing.T) {
	source := t.TempDir()
	target := filepath.Join(t.TempDir(), "asset-store")
	assetsDir := filepath.Join(source, "users", "legacy-user", "assets")
	if err := os.MkdirAll(assetsDir, 0o750); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "outside.png")
	writeTestFile(t, outside, []byte("must not migrate"))
	link := filepath.Join(assetsDir, "escape.png")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}

	report, err := Run(context.Background(), Options{SourceRoot: source, AssetRoot: target, Apply: true})
	if err != nil {
		t.Fatalf("migration failed: %v", err)
	}
	assertCounts(t, report, 1, 0, 0, 0, 1)
	if report.Entries[0].Status != "failed" || report.Entries[0].Error == "" {
		t.Fatalf("unexpected symlink result: %#v", report.Entries[0])
	}
	if count := countRegularFiles(t, filepath.Join(target, "objects")); count != 0 {
		t.Fatalf("symlink target was imported: %d objects", count)
	}
}

func TestRunFindsRelativeRecordAssetAndIgnoresRemoteMedia(t *testing.T) {
	source := t.TempDir()
	userDir := filepath.Join(source, "users", "legacy-user")
	writeTestFile(t, filepath.Join(userDir, "assets", "clips", "result.mp4"), []byte("video"))
	writeRecords(t, userDir, []map[string]any{
		{"outputs": []string{"assets/clips/result.mp4", "https://example.com/remote.png"}},
	})

	report, err := Run(context.Background(), Options{SourceRoot: source})
	if err != nil {
		t.Fatalf("migration failed: %v", err)
	}
	assertCounts(t, report, 1, 1, 0, 0, 0)
	if report.Entries[0].MediaType != "video/mp4" {
		t.Fatalf("unexpected media type: %#v", report.Entries[0])
	}
}

func TestRunIgnoresRecordPathOutsideUserDirectory(t *testing.T) {
	source := t.TempDir()
	userDir := filepath.Join(source, "users", "legacy-user")
	outside := filepath.Join(source, "users", "outside.png")
	writeTestFile(t, outside, []byte("not owned by the legacy user"))
	writeRecords(t, userDir, []map[string]any{
		{"resultUrls": []string{"assets/../../outside.png"}},
	})

	report, err := Run(context.Background(), Options{SourceRoot: source})
	if err != nil {
		t.Fatalf("migration failed: %v", err)
	}
	assertCounts(t, report, 0, 0, 0, 0, 0)
}

func assertCounts(t *testing.T, report Report, scanned, imported, deduplicated, missing, failed int) {
	t.Helper()
	if report.Scanned != scanned || report.Imported != imported || report.Deduplicated != deduplicated || report.Missing != missing || report.Failed != failed {
		t.Fatalf("unexpected counts: %#v", report)
	}
}

func writeTestFile(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeRecords(t *testing.T, userDir string, records any) {
	t.Helper()
	if err := os.MkdirAll(userDir, 0o750); err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(records)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(userDir, "records.json"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func countRegularFiles(t *testing.T, root string) int {
	t.Helper()
	count := 0
	err := filepath.WalkDir(root, func(_ string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type().IsRegular() {
			count++
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return count
}
