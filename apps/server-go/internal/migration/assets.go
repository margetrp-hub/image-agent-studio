package migration

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/assets"
)

const defaultMaxAssetBytes int64 = 10 << 30

var supportedMediaTypes = map[string]string{
	".avif": "image/avif",
	".bmp":  "image/bmp",
	".gif":  "image/gif",
	".jpeg": "image/jpeg",
	".jpg":  "image/jpeg",
	".png":  "image/png",
	".tif":  "image/tiff",
	".tiff": "image/tiff",
	".webp": "image/webp",
	".m4v":  "video/x-m4v",
	".mkv":  "video/x-matroska",
	".mov":  "video/quicktime",
	".mp4":  "video/mp4",
	".webm": "video/webm",
}

// Options configures one compatibility migration pass.
type Options struct {
	SourceRoot    string
	AssetRoot     string
	Apply         bool
	MaxAssetBytes int64
}

// Entry records how one legacy path was handled.
type Entry struct {
	SourcePath string `json:"sourcePath"`
	Digest     string `json:"digest,omitempty"`
	MediaType  string `json:"mediaType,omitempty"`
	Size       int64  `json:"size,omitempty"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
}

// Issue records a non-asset discovery problem without hiding usable assets.
type Issue struct {
	SourcePath string `json:"sourcePath"`
	Error      string `json:"error"`
}

// Report is the stable machine-readable migration result.
type Report struct {
	DryRun       bool              `json:"dryRun"`
	SourceRoot   string            `json:"sourceRoot"`
	AssetRoot    string            `json:"assetRoot"`
	Scanned      int               `json:"scanned"`
	Imported     int               `json:"imported"`
	Deduplicated int               `json:"deduplicated"`
	Missing      int               `json:"missing"`
	Failed       int               `json:"failed"`
	Mappings     map[string]string `json:"mappings"`
	Entries      []Entry           `json:"entries"`
	Issues       []Issue           `json:"issues,omitempty"`
}

type candidate struct {
	path         string
	relative     string
	discoveryErr error
}

// Run discovers legacy media and optionally imports it into the content-addressed store.
func Run(ctx context.Context, options Options) (Report, error) {
	sourceRoot, err := resolveExistingRoot(options.SourceRoot)
	if err != nil {
		return Report{}, fmt.Errorf("resolve source root: %w", err)
	}
	assetRoot, err := resolveAssetRoot(options.AssetRoot, sourceRoot)
	if err != nil {
		return Report{}, fmt.Errorf("resolve asset root: %w", err)
	}
	maxBytes := options.MaxAssetBytes
	if maxBytes == 0 {
		maxBytes = defaultMaxAssetBytes
	}
	if maxBytes < 0 {
		return Report{}, errors.New("max asset bytes must be positive")
	}

	report := Report{
		DryRun:     !options.Apply,
		SourceRoot: sourceRoot,
		AssetRoot:  assetRoot,
		Mappings:   make(map[string]string),
		Entries:    make([]Entry, 0),
	}
	candidates, issues, err := discover(sourceRoot)
	if err != nil {
		return Report{}, err
	}
	report.Issues = issues

	var assetStore *assets.Store
	if options.Apply {
		assetStore, err = assets.New(assetRoot, maxBytes)
		if err != nil {
			return Report{}, fmt.Errorf("open target asset store: %w", err)
		}
	}

	seen := make(map[string]struct{})
	for _, item := range candidates {
		if err := ctx.Err(); err != nil {
			return report, err
		}
		report.Scanned++
		entry := Entry{SourcePath: item.relative}
		if item.discoveryErr != nil {
			entry.Status = "failed"
			entry.Error = item.discoveryErr.Error()
			report.Failed++
			report.Entries = append(report.Entries, entry)
			continue
		}

		file, info, realPath, err := openContainedRegular(sourceRoot, item.path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				entry.Status = "missing"
				report.Missing++
			} else {
				entry.Status = "failed"
				entry.Error = err.Error()
				report.Failed++
			}
			report.Entries = append(report.Entries, entry)
			continue
		}

		entry.Size = info.Size()
		entry.MediaType = mediaType(realPath)
		if info.Size() > maxBytes {
			_ = file.Close()
			entry.Status = "failed"
			entry.Error = assets.ErrTooLarge.Error()
			report.Failed++
			report.Entries = append(report.Entries, entry)
			continue
		}

		digest, err := hashFile(file)
		if err != nil {
			_ = file.Close()
			entry.Status = "failed"
			entry.Error = err.Error()
			report.Failed++
			report.Entries = append(report.Entries, entry)
			continue
		}
		entry.Digest = digest
		report.Mappings[item.relative] = digest

		_, duplicateInRun := seen[digest]
		stored := targetHasAsset(assetRoot, digest)
		if options.Apply {
			_, getErr := assetStore.Get(digest)
			stored = getErr == nil
		}
		if duplicateInRun || stored {
			_ = file.Close()
			entry.Status = "deduplicated"
			report.Deduplicated++
			report.Entries = append(report.Entries, entry)
			seen[digest] = struct{}{}
			continue
		}

		if options.Apply {
			if _, err := file.Seek(0, io.SeekStart); err != nil {
				_ = file.Close()
				entry.Status = "failed"
				entry.Error = fmt.Sprintf("rewind source asset: %v", err)
				report.Failed++
				report.Entries = append(report.Entries, entry)
				continue
			}
			storedAsset, putErr := assetStore.Put(file, assets.Metadata{
				Filename:  filepath.Base(realPath),
				MediaType: entry.MediaType,
			})
			if closeErr := file.Close(); putErr == nil && closeErr != nil {
				putErr = closeErr
			}
			if putErr != nil {
				entry.Status = "failed"
				entry.Error = putErr.Error()
				report.Failed++
				report.Entries = append(report.Entries, entry)
				continue
			}
			if storedAsset.Digest != digest {
				entry.Status = "failed"
				entry.Error = "asset store returned an unexpected digest"
				report.Failed++
				report.Entries = append(report.Entries, entry)
				continue
			}
		} else {
			_ = file.Close()
		}

		entry.Status = "would_import"
		if options.Apply {
			entry.Status = "imported"
		}
		report.Imported++
		report.Entries = append(report.Entries, entry)
		seen[digest] = struct{}{}
	}

	return report, nil
}

func discover(root string) ([]candidate, []Issue, error) {
	usersRoot := filepath.Join(root, "users")
	usersInfo, err := os.Lstat(usersRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("inspect users directory: %w", err)
	}
	if usersInfo.Mode()&os.ModeSymlink != 0 || !usersInfo.IsDir() {
		return nil, nil, errors.New("users path is not a regular directory")
	}

	userEntries, err := os.ReadDir(usersRoot)
	if err != nil {
		return nil, nil, fmt.Errorf("read users directory: %w", err)
	}
	byPath := make(map[string]candidate)
	var issues []Issue
	for _, userEntry := range userEntries {
		userPath := filepath.Join(usersRoot, userEntry.Name())
		userInfo, infoErr := os.Lstat(userPath)
		if infoErr != nil {
			issues = append(issues, issueFor(root, userPath, infoErr))
			continue
		}
		if userInfo.Mode()&os.ModeSymlink != 0 || !userInfo.IsDir() {
			issues = append(issues, issueFor(root, userPath, errors.New("user path is not a regular directory")))
			continue
		}

		assetsRoot := filepath.Join(userPath, "assets")
		if err := discoverAssetTree(root, assetsRoot, byPath); err != nil {
			issues = append(issues, issueFor(root, assetsRoot, err))
		}
		recordCandidates, recordIssues := discoverRecordReferences(root, userPath)
		issues = append(issues, recordIssues...)
		for _, item := range recordCandidates {
			if _, exists := byPath[item.relative]; !exists {
				byPath[item.relative] = item
			}
		}
	}

	paths := make([]string, 0, len(byPath))
	for path := range byPath {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	items := make([]candidate, 0, len(paths))
	for _, path := range paths {
		items = append(items, byPath[path])
	}
	sort.Slice(issues, func(i, j int) bool { return issues[i].SourcePath < issues[j].SourcePath })
	return items, issues, nil
}

func discoverAssetTree(root, assetsRoot string, byPath map[string]candidate) error {
	info, err := os.Lstat(assetsRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return errors.New("assets path is not a regular directory")
	}
	return filepath.WalkDir(assetsRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			relative := relativePath(root, path)
			byPath[relative] = candidate{path: path, relative: relative, discoveryErr: walkErr}
			return nil
		}
		if path == assetsRoot {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			relative := relativePath(root, path)
			byPath[relative] = candidate{
				path:         path,
				relative:     relative,
				discoveryErr: errors.New("symlinked legacy asset is not followed"),
			}
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() || !isSupportedMedia(path) {
			return nil
		}
		relative := relativePath(root, path)
		byPath[relative] = candidate{path: path, relative: relative}
		return nil
	})
}

func discoverRecordReferences(root, userPath string) ([]candidate, []Issue) {
	recordsPath := filepath.Join(userPath, "records.json")
	info, err := os.Lstat(recordsPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, []Issue{issueFor(root, recordsPath, err)}
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, []Issue{issueFor(root, recordsPath, errors.New("records file is not a regular file"))}
	}
	file, _, _, err := openContainedRegular(root, recordsPath)
	if err != nil {
		return nil, []Issue{issueFor(root, recordsPath, err)}
	}
	defer file.Close()

	var value any
	decoder := json.NewDecoder(io.LimitReader(file, 64<<20))
	if err := decoder.Decode(&value); err != nil {
		return nil, []Issue{issueFor(root, recordsPath, fmt.Errorf("decode records: %w", err))}
	}

	seen := make(map[string]candidate)
	walkJSONStrings(value, func(raw string) {
		path, ok := localRecordAssetPath(root, userPath, raw)
		if !ok || !isSupportedMedia(path) {
			return
		}
		relative := relativePath(root, path)
		seen[relative] = candidate{path: path, relative: relative}
	})
	items := make([]candidate, 0, len(seen))
	for _, item := range seen {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].relative < items[j].relative })
	return items, nil
}

func walkJSONStrings(value any, visit func(string)) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			walkJSONStrings(item, visit)
		}
	case map[string]any:
		for _, item := range typed {
			walkJSONStrings(item, visit)
		}
	case string:
		visit(typed)
	}
}

func localRecordAssetPath(root, userPath, raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(value, "data:") {
		return "", false
	}
	parsed, err := url.Parse(value)
	if err == nil && parsed.Scheme != "" && parsed.Scheme != "file" {
		return "", false
	}
	if err == nil && parsed.Scheme == "file" {
		value = parsed.Path
	} else if err == nil && parsed.Path != "" {
		value = parsed.Path
	}
	decoded, err := url.PathUnescape(value)
	if err == nil {
		value = decoded
	}

	parts := strings.Split(strings.Trim(strings.ReplaceAll(value, "\\", "/"), "/"), "/")
	if len(parts) == 5 && parts[0] == "studio-api" && parts[1] == "history" && parts[3] == "assets" {
		return containedJoin(root, filepath.Join(userPath, "assets"), parts[2], parts[4])
	}
	if len(parts) >= 2 && parts[0] == "assets" {
		return containedJoin(root, userPath, parts...)
	}
	if filepath.IsAbs(value) {
		clean := filepath.Clean(value)
		if isContained(root, clean) && isContained(userPath, clean) {
			return clean, true
		}
	}
	return "", false
}

func containedJoin(root, base string, parts ...string) (string, bool) {
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || filepath.IsAbs(part) || filepath.VolumeName(part) != "" {
			return "", false
		}
	}
	path := filepath.Join(append([]string{base}, parts...)...)
	if !isContained(root, path) || !isContained(base, path) {
		return "", false
	}
	return path, true
}

func openContainedRegular(root, path string) (*os.File, os.FileInfo, string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, nil, "", err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, nil, "", errors.New("symlinked legacy asset is not followed")
	}
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, nil, "", err
	}
	if !isContained(root, realPath) {
		return nil, nil, "", errors.New("legacy asset resolves outside source root")
	}
	file, err := os.Open(realPath)
	if err != nil {
		return nil, nil, "", err
	}
	openedInfo, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, nil, "", err
	}
	if !openedInfo.Mode().IsRegular() {
		_ = file.Close()
		return nil, nil, "", errors.New("legacy asset is not a regular file")
	}
	return file, openedInfo, realPath, nil
}

func hashFile(file *os.File) (string, error) {
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("hash source asset: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func targetHasAsset(root, digest string) bool {
	objectPath := filepath.Join(root, "objects", digest[:2], digest[2:4], digest)
	manifestPath := filepath.Join(root, "manifests", digest[:2], digest[2:4], digest+".json")
	objectInfo, err := os.Lstat(objectPath)
	if err != nil || !objectInfo.Mode().IsRegular() {
		return false
	}
	manifestInfo, err := os.Lstat(manifestPath)
	if err != nil || !manifestInfo.Mode().IsRegular() {
		return false
	}
	file, err := os.Open(objectPath)
	if err != nil {
		return false
	}
	actualDigest, err := hashFile(file)
	_ = file.Close()
	if err != nil || actualDigest != digest {
		return false
	}
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return false
	}
	var manifest assets.Asset
	return json.Unmarshal(data, &manifest) == nil && manifest.Digest == digest && manifest.Size == objectInfo.Size()
}

func resolveExistingRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errors.New("source root is required")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	realRoot, err := filepath.EvalSymlinks(absRoot)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(realRoot)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("source root is not a directory")
	}
	return filepath.Clean(realRoot), nil
}

func resolveAssetRoot(root, sourceRoot string) (string, error) {
	if strings.TrimSpace(root) == "" {
		root = filepath.Join(sourceRoot, "studio-go", "assets")
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if info, err := os.Lstat(absRoot); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			resolved, resolveErr := filepath.EvalSymlinks(absRoot)
			if resolveErr != nil {
				return "", resolveErr
			}
			return filepath.Clean(resolved), nil
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return filepath.Clean(absRoot), nil
}

func isContained(root, path string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func relativePath(root, path string) string {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.ToSlash(filepath.Clean(path))
	}
	return filepath.ToSlash(relative)
}

func issueFor(root, path string, err error) Issue {
	return Issue{SourcePath: relativePath(root, path), Error: err.Error()}
}

func isSupportedMedia(path string) bool {
	_, ok := supportedMediaTypes[strings.ToLower(filepath.Ext(path))]
	return ok
}

func mediaType(path string) string {
	extension := strings.ToLower(filepath.Ext(path))
	if value := supportedMediaTypes[extension]; value != "" {
		return value
	}
	if value := mime.TypeByExtension(extension); value != "" {
		return strings.Split(value, ";")[0]
	}
	return "application/octet-stream"
}
