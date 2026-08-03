package assets

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPutDeduplicatesAndPersistsMetadata(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}

	content := "content-addressed image"
	metadata := Metadata{Filename: "image.png", MediaType: "image/png", Width: 640, Height: 480}
	first, err := store.Put(strings.NewReader(content), metadata)
	if err != nil {
		t.Fatalf("Put first failed: %v", err)
	}
	wantHash := sha256.Sum256([]byte(content))
	if first.Digest != hex.EncodeToString(wantHash[:]) || first.Size != int64(len(content)) {
		t.Fatalf("unexpected content identity: %#v", first)
	}

	second, err := store.Put(strings.NewReader(content), Metadata{Filename: "duplicate.png"})
	if err != nil {
		t.Fatalf("Put duplicate failed: %v", err)
	}
	if second.Digest != first.Digest || second.CreatedAt != first.CreatedAt {
		t.Fatalf("duplicate did not reuse manifest: first=%#v second=%#v", first, second)
	}
	if second.Metadata != metadata {
		t.Fatalf("duplicate replaced canonical metadata: %#v", second.Metadata)
	}
	if count := regularFileCount(t, filepath.Join(root, "objects")); count != 1 {
		t.Fatalf("dedupe wrote %d objects, want 1", count)
	}

	reopened, err := New(root, 1024)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	loaded, err := reopened.Get(first.Digest)
	if err != nil {
		t.Fatalf("Get after reopen failed: %v", err)
	}
	if loaded.Metadata != metadata || loaded.Digest != first.Digest {
		t.Fatalf("metadata did not persist: %#v", loaded)
	}
	file, err := reopened.Open(first.Digest)
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer file.Close()
	got, err := io.ReadAll(file)
	if err != nil || string(got) != content {
		t.Fatalf("unexpected object content %q, err=%v", got, err)
	}
}

func TestAddVariantPersistsAndRejectsReplacement(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	asset, err := store.Put(strings.NewReader("original"), Metadata{MediaType: "image/png"})
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	variantMetadata := Metadata{Filename: "thumb.webp", MediaType: "image/webp", Width: 128, Height: 128}
	updated, err := store.AddVariant(asset.Digest, "thumbnail", strings.NewReader("thumbnail bytes"), variantMetadata)
	if err != nil {
		t.Fatalf("AddVariant failed: %v", err)
	}
	variant, ok := updated.Variants["thumbnail"]
	if !ok || variant.Kind != RelationVariant || variant.Metadata != variantMetadata || variant.Size != int64(len("thumbnail bytes")) {
		t.Fatalf("unexpected variant: %#v", updated.Variants)
	}

	idempotent, err := store.AddVariant(asset.Digest, "thumbnail", strings.NewReader("thumbnail bytes"), Metadata{})
	if err != nil {
		t.Fatalf("idempotent AddVariant failed: %v", err)
	}
	if idempotent.Variants["thumbnail"] != variant {
		t.Fatalf("idempotent variant changed metadata: %#v", idempotent.Variants["thumbnail"])
	}
	if _, err := store.AddVariant(asset.Digest, "thumbnail", strings.NewReader("different"), Metadata{}); !errors.Is(err, ErrVariantExists) {
		t.Fatalf("variant replacement error = %v, want ErrVariantExists", err)
	}

	reopened, err := New(root, 1024)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	file, err := reopened.OpenVariant(asset.Digest, "thumbnail")
	if err != nil {
		t.Fatalf("OpenVariant failed: %v", err)
	}
	defer file.Close()
	got, err := io.ReadAll(file)
	if err != nil || string(got) != "thumbnail bytes" {
		t.Fatalf("unexpected variant content %q, err=%v", got, err)
	}
}

func TestAddThumbnailPersistsRelationKind(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	asset, err := store.Put(strings.NewReader("original"), Metadata{MediaType: "image/png"})
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	updated, err := store.AddThumbnail(asset.Digest, "grid-320", strings.NewReader("thumbnail"), Metadata{
		MediaType: "image/webp",
		Width:     320,
		Height:    180,
	})
	if err != nil {
		t.Fatalf("AddThumbnail failed: %v", err)
	}
	if updated.Variants["grid-320"].Kind != RelationThumbnail {
		t.Fatalf("thumbnail relation was not recorded: %#v", updated.Variants)
	}

	reopened, err := New(root, 1024)
	if err != nil {
		t.Fatalf("reopen failed: %v", err)
	}
	loaded, err := reopened.Get(asset.Digest)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if loaded.Variants["grid-320"].Kind != RelationThumbnail {
		t.Fatalf("thumbnail relation kind was not persisted: %#v", loaded.Variants)
	}
}

func TestPutEnforcesStreamingLimitAndCleansTempFiles(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 4)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	if _, err := store.Put(strings.NewReader("1234"), Metadata{}); err != nil {
		t.Fatalf("Put at exact limit failed: %v", err)
	}
	if _, err := store.Put(strings.NewReader("12345"), Metadata{}); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("oversized Put error = %v, want ErrTooLarge", err)
	}
	if count := regularFileCount(t, filepath.Join(root, "objects")); count != 1 {
		t.Fatalf("oversized Put left an object; count=%d", count)
	}
	if entries, err := os.ReadDir(filepath.Join(root, "tmp")); err != nil || len(entries) != 0 {
		t.Fatalf("temp directory not clean: entries=%d err=%v", len(entries), err)
	}
}

func TestPutRejectsCorruptObjectAtDigestPath(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	content := "expected"
	digestBytes := sha256.Sum256([]byte(content))
	digest := hex.EncodeToString(digestBytes[:])
	dir, err := store.ensureDir("objects", digest[:2], digest[2:4])
	if err != nil {
		t.Fatalf("ensureDir failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, digest), []byte("corrupt!"), 0o600); err != nil {
		t.Fatalf("write corrupt object failed: %v", err)
	}

	if _, err := store.Put(strings.NewReader(content), Metadata{}); err == nil || !strings.Contains(err.Error(), "conflicts with digest") {
		t.Fatalf("Put error = %v, want digest conflict", err)
	}
}

func TestTraversalInputsAreRejected(t *testing.T) {
	store, err := New(t.TempDir(), 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	asset, err := store.Put(strings.NewReader("original"), Metadata{})
	if err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	for _, digest := range []string{"../etc/passwd", strings.Repeat("a", 63), strings.Repeat("A", 64), strings.Repeat("g", 64)} {
		if _, err := store.Get(digest); !errors.Is(err, ErrInvalidDigest) {
			t.Errorf("Get(%q) error = %v, want ErrInvalidDigest", digest, err)
		}
	}
	for _, name := range []string{"../thumb", "..\\thumb", "/absolute", "thumb/large", ".."} {
		if _, err := store.AddVariant(asset.Digest, name, strings.NewReader("variant"), Metadata{}); !errors.Is(err, ErrInvalidVariant) {
			t.Errorf("AddVariant(%q) error = %v, want ErrInvalidVariant", name, err)
		}
	}
	for _, filename := range []string{"../image.png", "..\\image.png", "/tmp/image.png", "C:\\temp\\image.png"} {
		if _, err := store.Put(strings.NewReader("bytes"), Metadata{Filename: filename}); !errors.Is(err, ErrInvalidMetadata) {
			t.Errorf("Put filename %q error = %v, want ErrInvalidMetadata", filename, err)
		}
	}
}

func TestPutPropagatesReaderFailureAndCleansTempFile(t *testing.T) {
	root := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	wantErr := errors.New("source failed")
	_, err = store.Put(errorReader{err: wantErr}, Metadata{})
	if !errors.Is(err, wantErr) {
		t.Fatalf("Put error = %v, want wrapped reader error", err)
	}
	if entries, readErr := os.ReadDir(filepath.Join(root, "tmp")); readErr != nil || len(entries) != 0 {
		t.Fatalf("temp directory not clean: entries=%d err=%v", len(entries), readErr)
	}
}

func TestSymlinkedStorageDirectoryIsRejected(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	store, err := New(root, 1024)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	objects := filepath.Join(root, "objects")
	if err := os.Remove(objects); err != nil {
		t.Fatalf("remove objects directory: %v", err)
	}
	if err := os.Symlink(outside, objects); err != nil {
		t.Skipf("symlinks are unavailable: %v", err)
	}

	if _, err := store.Put(strings.NewReader("must stay inside"), Metadata{}); err == nil {
		t.Fatal("Put through a symlinked storage directory succeeded")
	}
	if count := regularFileCount(t, outside); count != 0 {
		t.Fatalf("symlink escape wrote %d files outside the asset root", count)
	}
}

type errorReader struct {
	err error
}

func (reader errorReader) Read([]byte) (int, error) {
	return 0, reader.err
}

func regularFileCount(t *testing.T, root string) int {
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
		t.Fatalf("WalkDir failed: %v", err)
	}
	return count
}
