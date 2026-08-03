package assets

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	maxFilenameBytes    = 255
	maxMediaTypeBytes   = 255
	maxVariantNameBytes = 64
	maxVariants         = 128
	maxManifestBytes    = 1 << 20

	RelationThumbnail = "thumbnail"
	RelationVariant   = "variant"
)

var (
	ErrTooLarge        = errors.New("asset exceeds size limit")
	ErrInvalidDigest   = errors.New("invalid asset digest")
	ErrInvalidMetadata = errors.New("invalid asset metadata")
	ErrInvalidVariant  = errors.New("invalid asset variant")
	ErrVariantExists   = errors.New("asset variant already exists")
	ErrTooManyVariants = errors.New("asset has too many variants")
)

// Metadata describes an asset without influencing its content identity.
type Metadata struct {
	Filename  string `json:"filename,omitempty"`
	MediaType string `json:"mediaType,omitempty"`
	Width     int    `json:"width,omitempty"`
	Height    int    `json:"height,omitempty"`
}

// Variant is a named, content-addressed derivative of an asset.
type Variant struct {
	Name     string   `json:"name"`
	Kind     string   `json:"kind"`
	Digest   string   `json:"digest"`
	Size     int64    `json:"size"`
	Metadata Metadata `json:"metadata,omitempty"`
}

// Asset is the persisted manifest for one original object and its variants.
type Asset struct {
	Digest    string             `json:"digest"`
	Size      int64              `json:"size"`
	CreatedAt time.Time          `json:"createdAt"`
	Metadata  Metadata           `json:"metadata,omitempty"`
	Variants  map[string]Variant `json:"variants,omitempty"`
}

// Store persists immutable objects by SHA-256 digest under root.
type Store struct {
	root     string
	maxBytes int64
	mu       sync.RWMutex
}

// New creates a store with a per-object byte limit.
func New(root string, maxBytes int64) (*Store, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("asset root is required")
	}
	if maxBytes <= 0 {
		return nil, errors.New("asset size limit must be positive")
	}

	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve asset root: %w", err)
	}
	if err := os.MkdirAll(absRoot, 0o750); err != nil {
		return nil, fmt.Errorf("create asset root: %w", err)
	}
	realRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return nil, fmt.Errorf("resolve asset root links: %w", err)
	}

	store := &Store{root: realRoot, maxBytes: maxBytes}
	for _, name := range []string{"objects", "manifests", "tmp"} {
		if _, err := store.ensureDir(name); err != nil {
			return nil, err
		}
	}
	return store, nil
}

// Put streams an original object into the store. The first metadata written for
// duplicate content remains canonical.
func (s *Store) Put(reader io.Reader, metadata Metadata) (Asset, error) {
	if reader == nil {
		return Asset{}, errors.New("asset reader is required")
	}
	if err := validateMetadata(metadata); err != nil {
		return Asset{}, err
	}

	digest, size, err := s.writeObject(reader)
	if err != nil {
		return Asset{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	asset, err := s.loadManifest(digest)
	if err == nil {
		return asset, nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return Asset{}, err
	}

	asset = Asset{
		Digest:    digest,
		Size:      size,
		CreatedAt: time.Now().UTC(),
		Metadata:  metadata,
		Variants:  make(map[string]Variant),
	}
	if err := s.writeManifest(asset); err != nil {
		return Asset{}, err
	}
	return asset, nil
}

// AddVariant streams and attaches an immutable named derivative to an asset.
func (s *Store) AddVariant(assetDigest, name string, reader io.Reader, metadata Metadata) (Asset, error) {
	return s.addRelation(assetDigest, name, RelationVariant, reader, metadata)
}

// AddThumbnail streams and attaches an immutable named thumbnail to an asset.
func (s *Store) AddThumbnail(assetDigest, name string, reader io.Reader, metadata Metadata) (Asset, error) {
	return s.addRelation(assetDigest, name, RelationThumbnail, reader, metadata)
}

func (s *Store) addRelation(assetDigest, name, kind string, reader io.Reader, metadata Metadata) (Asset, error) {
	if err := validateDigest(assetDigest); err != nil {
		return Asset{}, err
	}
	if err := validateVariantName(name); err != nil {
		return Asset{}, err
	}
	if reader == nil {
		return Asset{}, errors.New("asset reader is required")
	}
	if err := validateMetadata(metadata); err != nil {
		return Asset{}, err
	}
	if _, err := s.Get(assetDigest); err != nil {
		return Asset{}, err
	}

	digest, size, err := s.writeObject(reader)
	if err != nil {
		return Asset{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	asset, err := s.loadManifest(assetDigest)
	if err != nil {
		return Asset{}, err
	}
	if existing, ok := asset.Variants[name]; ok {
		if existing.Digest == digest {
			return asset, nil
		}
		return Asset{}, fmt.Errorf("%w: %q", ErrVariantExists, name)
	}
	if len(asset.Variants) >= maxVariants {
		return Asset{}, ErrTooManyVariants
	}
	if asset.Variants == nil {
		asset.Variants = make(map[string]Variant)
	}
	asset.Variants[name] = Variant{
		Name:     name,
		Kind:     kind,
		Digest:   digest,
		Size:     size,
		Metadata: metadata,
	}
	if err := s.writeManifest(asset); err != nil {
		return Asset{}, err
	}
	return asset, nil
}

// Get loads an asset manifest by its lowercase SHA-256 digest.
func (s *Store) Get(digest string) (Asset, error) {
	if err := validateDigest(digest); err != nil {
		return Asset{}, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadManifest(digest)
}

// Open opens an immutable object by digest. The caller must close the file.
func (s *Store) Open(digest string) (*os.File, error) {
	if err := validateDigest(digest); err != nil {
		return nil, err
	}
	if _, err := s.ensureDir("objects", digest[:2], digest[2:4]); err != nil {
		return nil, err
	}
	path, err := s.safePath("objects", digest[:2], digest[2:4], digest)
	if err != nil {
		return nil, err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("asset object is not a regular file: %s", digest)
	}
	return os.Open(path)
}

// OpenVariant opens a named variant object. The caller must close the file.
func (s *Store) OpenVariant(assetDigest, name string) (*os.File, error) {
	if err := validateVariantName(name); err != nil {
		return nil, err
	}
	asset, err := s.Get(assetDigest)
	if err != nil {
		return nil, err
	}
	variant, ok := asset.Variants[name]
	if !ok {
		return nil, os.ErrNotExist
	}
	return s.Open(variant.Digest)
}

func (s *Store) writeObject(reader io.Reader) (string, int64, error) {
	tmpDir, err := s.ensureDir("tmp")
	if err != nil {
		return "", 0, err
	}
	tmp, err := os.CreateTemp(tmpDir, "asset-*")
	if err != nil {
		return "", 0, fmt.Errorf("create asset temp file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	hash := sha256.New()
	limited := &io.LimitedReader{R: reader, N: s.maxBytes + 1}
	size, copyErr := io.Copy(io.MultiWriter(tmp, hash), limited)
	if copyErr != nil {
		_ = tmp.Close()
		return "", 0, fmt.Errorf("copy asset: %w", copyErr)
	}
	if size > s.maxBytes {
		_ = tmp.Close()
		return "", 0, ErrTooLarge
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return "", 0, fmt.Errorf("sync asset temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", 0, fmt.Errorf("close asset temp file: %w", err)
	}

	digest := hex.EncodeToString(hash.Sum(nil))
	dir, err := s.ensureDir("objects", digest[:2], digest[2:4])
	if err != nil {
		return "", 0, err
	}
	target := filepath.Join(dir, digest)
	if _, err := os.Lstat(target); err == nil {
		matches, matchErr := objectMatches(target, digest, size)
		if matchErr != nil {
			return "", 0, matchErr
		}
		if !matches {
			return "", 0, fmt.Errorf("asset object conflicts with digest %s", digest)
		}
		return digest, size, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", 0, fmt.Errorf("inspect asset object: %w", err)
	}

	if err := os.Rename(tmpPath, target); err != nil {
		matches, matchErr := objectMatches(target, digest, size)
		if matchErr == nil && matches {
			return digest, size, nil
		}
		if matchErr != nil && !errors.Is(matchErr, os.ErrNotExist) {
			return "", 0, matchErr
		}
		return "", 0, fmt.Errorf("commit asset object: %w", err)
	}
	return digest, size, nil
}

func objectMatches(path, digest string, size int64) (bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return false, err
	}
	if !info.Mode().IsRegular() || info.Size() != size {
		return false, nil
	}
	file, err := os.Open(path)
	if err != nil {
		return false, fmt.Errorf("open existing asset object: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return false, fmt.Errorf("hash existing asset object: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)) == digest, nil
}

func (s *Store) loadManifest(digest string) (Asset, error) {
	path, err := s.manifestPath(digest, false)
	if err != nil {
		return Asset{}, err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return Asset{}, err
	}
	if !info.Mode().IsRegular() {
		return Asset{}, fmt.Errorf("asset manifest is not a regular file: %s", digest)
	}
	file, err := os.Open(path)
	if err != nil {
		return Asset{}, err
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, maxManifestBytes+1))
	if err != nil {
		return Asset{}, fmt.Errorf("read asset manifest: %w", err)
	}
	if len(data) > maxManifestBytes {
		return Asset{}, errors.New("asset manifest exceeds size limit")
	}
	var asset Asset
	if err := json.Unmarshal(data, &asset); err != nil {
		return Asset{}, fmt.Errorf("decode asset manifest: %w", err)
	}
	if err := validateAsset(asset, digest); err != nil {
		return Asset{}, err
	}
	return asset, nil
}

func (s *Store) writeManifest(asset Asset) error {
	if err := validateAsset(asset, asset.Digest); err != nil {
		return err
	}
	path, err := s.manifestPath(asset.Digest, true)
	if err != nil {
		return err
	}
	if info, err := os.Lstat(path); err == nil && !info.Mode().IsRegular() {
		return fmt.Errorf("asset manifest is not a regular file: %s", asset.Digest)
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect asset manifest: %w", err)
	}

	data, err := json.Marshal(asset)
	if err != nil {
		return fmt.Errorf("encode asset manifest: %w", err)
	}
	if len(data) > maxManifestBytes {
		return errors.New("asset manifest exceeds size limit")
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".manifest-*")
	if err != nil {
		return fmt.Errorf("create manifest temp file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write asset manifest: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("sync asset manifest: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close asset manifest: %w", err)
	}
	if err := replaceFile(tmpPath, path); err != nil {
		return fmt.Errorf("commit asset manifest: %w", err)
	}
	return nil
}

func replaceFile(source, target string) error {
	if err := os.Rename(source, target); err == nil {
		return nil
	}
	if _, err := os.Lstat(target); err != nil {
		return os.Rename(source, target)
	}

	backup, err := os.CreateTemp(filepath.Dir(target), ".manifest-backup-*")
	if err != nil {
		return err
	}
	backupPath := backup.Name()
	if err := backup.Close(); err != nil {
		return err
	}
	if err := os.Remove(backupPath); err != nil {
		return err
	}
	if err := os.Rename(target, backupPath); err != nil {
		return err
	}
	if err := os.Rename(source, target); err != nil {
		_ = os.Rename(backupPath, target)
		return err
	}
	return os.Remove(backupPath)
}

func (s *Store) manifestPath(digest string, createDir bool) (string, error) {
	if err := validateDigest(digest); err != nil {
		return "", err
	}
	if createDir {
		dir, err := s.ensureDir("manifests", digest[:2], digest[2:4])
		if err != nil {
			return "", err
		}
		return filepath.Join(dir, digest+".json"), nil
	}
	if _, err := s.ensureDir("manifests", digest[:2], digest[2:4]); err != nil {
		return "", err
	}
	return s.safePath("manifests", digest[:2], digest[2:4], digest+".json")
}

func (s *Store) ensureDir(parts ...string) (string, error) {
	current := s.root
	for i := range parts {
		path, err := s.safePath(parts[:i+1]...)
		if err != nil {
			return "", err
		}
		if err := os.Mkdir(path, 0o750); err != nil && !errors.Is(err, os.ErrExist) {
			return "", fmt.Errorf("create asset directory: %w", err)
		}
		info, err := os.Lstat(path)
		if err != nil {
			return "", fmt.Errorf("inspect asset directory: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return "", fmt.Errorf("unsafe asset directory: %s", path)
		}
		current = path
	}
	return current, nil
}

func (s *Store) safePath(parts ...string) (string, error) {
	path := filepath.Join(append([]string{s.root}, parts...)...)
	relative, err := filepath.Rel(s.root, path)
	if err != nil {
		return "", fmt.Errorf("resolve asset path: %w", err)
	}
	if relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", errors.New("asset path escapes storage root")
	}
	return path, nil
}

func validateAsset(asset Asset, expectedDigest string) error {
	if err := validateDigest(asset.Digest); err != nil {
		return err
	}
	if asset.Digest != expectedDigest {
		return fmt.Errorf("asset manifest digest mismatch: got %s", asset.Digest)
	}
	if asset.Size < 0 || asset.CreatedAt.IsZero() {
		return errors.New("invalid asset manifest")
	}
	if err := validateMetadata(asset.Metadata); err != nil {
		return err
	}
	if len(asset.Variants) > maxVariants {
		return ErrTooManyVariants
	}
	for name, variant := range asset.Variants {
		if err := validateVariantName(name); err != nil {
			return err
		}
		if variant.Name != name || variant.Size < 0 ||
			(variant.Kind != RelationThumbnail && variant.Kind != RelationVariant) {
			return fmt.Errorf("%w: inconsistent manifest entry", ErrInvalidVariant)
		}
		if err := validateDigest(variant.Digest); err != nil {
			return err
		}
		if err := validateMetadata(variant.Metadata); err != nil {
			return err
		}
	}
	return nil
}

func validateDigest(digest string) error {
	if len(digest) != sha256.Size*2 {
		return ErrInvalidDigest
	}
	for _, char := range digest {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return ErrInvalidDigest
		}
	}
	return nil
}

func validateMetadata(metadata Metadata) error {
	if len(metadata.Filename) > maxFilenameBytes || len(metadata.MediaType) > maxMediaTypeBytes {
		return ErrInvalidMetadata
	}
	if metadata.Width < 0 || metadata.Height < 0 {
		return ErrInvalidMetadata
	}
	if metadata.Filename != "" {
		if metadata.Filename == "." || metadata.Filename == ".." ||
			strings.ContainsAny(metadata.Filename, "/\\\x00") ||
			filepath.IsAbs(metadata.Filename) || filepath.VolumeName(metadata.Filename) != "" {
			return ErrInvalidMetadata
		}
	}
	if strings.ContainsAny(metadata.MediaType, "\r\n\x00") {
		return ErrInvalidMetadata
	}
	return nil
}

func validateVariantName(name string) error {
	if name == "" || len(name) > maxVariantNameBytes {
		return ErrInvalidVariant
	}
	for _, char := range name {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') &&
			(char < '0' || char > '9') && char != '-' && char != '_' && char != '.' {
			return ErrInvalidVariant
		}
	}
	if name == "." || name == ".." {
		return ErrInvalidVariant
	}
	return nil
}
