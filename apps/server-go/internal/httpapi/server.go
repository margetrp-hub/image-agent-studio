package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/assets"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/executor"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/jobevents"
	creativeproject "github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/project"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/providerconnections"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/secrets"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/workflow"
)

type Server struct {
	cfg              config.Config
	store            *store.Store
	events           *jobevents.Stream
	assets           *assets.Store
	vault            *secrets.Vault
	initErr          error
	startedAt        time.Time
	executionMu      sync.Mutex
	executionCancels map[string]context.CancelFunc
}

func NewServer(cfg config.Config, studioStore *store.Store) *Server {
	server := &Server{cfg: cfg, store: studioStore, events: jobevents.New(64, 16), startedAt: time.Now().UTC(), executionCancels: make(map[string]context.CancelFunc)}
	if strings.TrimSpace(cfg.DataDir) != "" {
		assetStore, err := assets.New(filepath.Join(cfg.DataDir, "studio-go", "assets"), cfg.AssetMaxBytes)
		server.assets = assetStore
		server.initErr = err
	}
	if strings.TrimSpace(cfg.MasterKey) != "" {
		key, err := cfg.MasterKeyBytes()
		if err != nil {
			server.initErr = err
		} else {
			vault, vaultErr := secrets.New(key, cfg.MasterKeyVersion)
			server.vault = vault
			if server.initErr == nil {
				server.initErr = vaultErr
			}
		}
	}
	return server
}

func (s *Server) StartupError() error {
	return s.initErr
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !s.applyCORS(w, r) {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "ORIGIN_NOT_ALLOWED"})
		return
	}
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := strings.TrimRight(r.URL.Path, "/")
	if path == "" {
		path = "/"
	}

	switch {
	case r.Method == http.MethodGet && path == "/studio-api/health":
		s.handleHealth(w, r)
	case r.Method == http.MethodPost && path == "/studio-api/auth/bootstrap":
		s.handleBootstrap(w, r)
	case r.Method == http.MethodPost && path == "/studio-api/auth/register":
		s.handleRegister(w, r)
	case r.Method == http.MethodPost && path == "/studio-api/auth/login":
		s.handleLogin(w, r)
	case r.Method == http.MethodPost && path == "/studio-api/auth/logout":
		s.handleLogout(w, r)
	case r.Method == http.MethodGet && path == "/studio-api/auth/me":
		s.handleMe(w, r)
	case path == "/studio-api/session":
		s.handleSession(w, r)
	case path == "/studio-api/history":
		s.handleHistory(w, r)
	case strings.HasPrefix(path, "/studio-api/history/"):
		s.handleHistoryRecord(w, r, strings.TrimPrefix(path, "/studio-api/history/"))
	case path == "/studio-api/projects":
		s.handleProjects(w, r)
	case strings.HasPrefix(path, "/studio-api/projects/"):
		s.handleProject(w, r, strings.TrimPrefix(path, "/studio-api/projects/"))
	case path == "/studio-api/assets":
		s.handleAssets(w, r)
	case strings.HasPrefix(path, "/studio-api/assets/"):
		s.handleAsset(w, r, strings.TrimPrefix(path, "/studio-api/assets/"))
	case path == "/studio-api/generation-jobs":
		s.handleGenerationJobs(w, r)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/dispatch-plan"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/dispatch-plan")
		s.handleGenerationJobDispatchPlan(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/continuation-plan"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/continuation-plan")
		s.handleGenerationJobContinuationPlan(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/events"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/events")
		s.handleGenerationJobEvents(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/execute"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/execute")
		s.handleGenerationJobExecute(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/"):
		s.handleGenerationJob(w, r, strings.TrimPrefix(path, "/studio-api/generation-jobs/"))
	case path == "/studio-api/providers":
		s.handleProviders(w, r)
	case strings.HasPrefix(path, "/studio-api/providers/"):
		s.handleProviderModels(w, r, strings.TrimPrefix(path, "/studio-api/providers/"))
	case path == "/studio-api/provider-connections":
		s.handleProviderConnections(w, r)
	case strings.HasPrefix(path, "/studio-api/provider-connections/"):
		s.handleProviderConnection(w, r, strings.TrimPrefix(path, "/studio-api/provider-connections/"))
	case path == "/studio-api/admin/users":
		s.handleAdminUsers(w, r)
	case strings.HasPrefix(path, "/studio-api/admin/users/"):
		s.handleAdminUser(w, r, strings.TrimPrefix(path, "/studio-api/admin/users/"))
	case path == "/studio-api/admin/provider-links":
		s.handleAdminProviderLinks(w, r)
	default:
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
	}
}

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		projects, err := s.store.ListProjects(user)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "projects": projects})
	case http.MethodPost:
		var item creativeproject.Project
		if !decodeJSON(w, r, &item) {
			return
		}
		created, err := s.store.CreateProject(user, item)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "project": created})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleProject(w http.ResponseWriter, r *http.Request, projectID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if projectID == "" || strings.Contains(projectID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROJECT_NOT_FOUND"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		item, found, err := s.store.GetProject(user, projectID)
		if err != nil {
			writeError(w, err)
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROJECT_NOT_FOUND"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "project": item})
	case http.MethodPut:
		var item creativeproject.Project
		if !decodeJSON(w, r, &item) {
			return
		}
		updated, err := s.store.UpdateProject(user, projectID, item)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "project": updated})
	case http.MethodDelete:
		archived, err := s.store.ArchiveProject(user, projectID)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "project": archived})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleAssets(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		items, err := s.store.ListUserAssets(user)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "assets": items})
	case http.MethodPost:
		if s.assets == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "ASSET_STORE_UNAVAILABLE"})
			return
		}
		limit := s.cfg.AssetMaxBytes
		if limit <= 0 {
			limit = 25 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit+(1<<20))
		if err := r.ParseMultipartForm(limit); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "ASSET_UPLOAD_INVALID"})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "ASSET_FILE_REQUIRED"})
			return
		}
		defer file.Close()
		metadata, reader, err := uploadMetadata(file, header, r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "ASSET_UPLOAD_INVALID"})
			return
		}
		asset, err := s.assets.Put(reader, metadata)
		if err != nil {
			if errors.Is(err, assets.ErrTooLarge) {
				writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{"ok": false, "error": "ASSET_TOO_LARGE"})
				return
			}
			writeError(w, err)
			return
		}
		reference, err := s.store.AttachUserAsset(user, store.UserAsset{
			Digest: asset.Digest, Filename: asset.Metadata.Filename, MediaType: asset.Metadata.MediaType,
			Size: asset.Size, CreatedAt: asset.CreatedAt,
		})
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"ok": true, "asset": reference, "url": "/studio-api/assets/" + asset.Digest,
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleAsset(w http.ResponseWriter, r *http.Request, digest string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet || digest == "" || strings.Contains(digest, "/") || s.assets == nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "ASSET_NOT_FOUND"})
		return
	}
	allowed, err := s.store.UserCanAccessAsset(user, digest)
	if err != nil {
		writeError(w, err)
		return
	}
	if !allowed {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "ASSET_NOT_FOUND"})
		return
	}
	asset, err := s.assets.Get(digest)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "ASSET_NOT_FOUND"})
		return
	}
	file, err := s.assets.Open(digest)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "ASSET_NOT_FOUND"})
		return
	}
	defer file.Close()
	w.Header().Set("Content-Type", asset.Metadata.MediaType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("ETag", `"sha256-`+asset.Digest+`"`)
	http.ServeContent(w, r, asset.Metadata.Filename, asset.CreatedAt, file)
}

func uploadMetadata(file multipart.File, header *multipart.FileHeader, r *http.Request) (assets.Metadata, io.Reader, error) {
	prefix := make([]byte, 512)
	read, err := file.Read(prefix)
	if err != nil && !errors.Is(err, io.EOF) {
		return assets.Metadata{}, nil, err
	}
	prefix = prefix[:read]
	mediaType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if mediaType == "" || mediaType == "application/octet-stream" {
		mediaType = http.DetectContentType(prefix)
	}
	if !allowedAssetMediaType(mediaType) {
		return assets.Metadata{}, nil, errors.New("unsupported asset media type")
	}
	width, _ := strconv.Atoi(r.FormValue("width"))
	height, _ := strconv.Atoi(r.FormValue("height"))
	metadata := assets.Metadata{
		Filename: filepath.Base(strings.TrimSpace(header.Filename)), MediaType: mediaType, Width: width, Height: height,
	}
	return metadata, io.MultiReader(bytes.NewReader(prefix), file), nil
}

func allowedAssetMediaType(value string) bool {
	value = strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	switch value {
	case "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm", "video/quicktime":
		return true
	default:
		return false
	}
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if s.initErr != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "SERVICE_INITIALIZATION_FAILED"})
		return
	}
	userCount, _ := s.store.UserCount()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                              true,
		"service":                         "image-agent-studio-go",
		"version":                         s.cfg.Version,
		"dataDir":                         s.cfg.DataDir,
		"users":                           userCount,
		"startedAt":                       s.startedAt.Format(time.RFC3339),
		"authMode":                        "studio-local",
		"registrationEnabled":             s.cfg.RegistrationEnabled,
		"assetStoreReady":                 s.assets != nil,
		"personalProviderEncryptionReady": s.vault != nil,
		"providerMode":                    "admin-provider-links",
	})
}

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	count, err := s.store.UserCount()
	if err != nil {
		writeError(w, err)
		return
	}
	if count > 0 {
		writeJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": "BOOTSTRAP_ALREADY_DONE"})
		return
	}
	if s.cfg.BootstrapToken != "" && r.Header.Get("X-Studio-Bootstrap-Token") != s.cfg.BootstrapToken {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "BOOTSTRAP_TOKEN_REQUIRED"})
		return
	}

	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	user, err := s.store.CreateUser(body.Email, body.Password, body.DisplayName, store.RoleAdmin)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "user": store.Public(user)})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	session, user, err := s.store.Login(body.Email, body.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"token":     session.Token,
		"expiresAt": session.ExpiresAt,
		"user":      user,
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.RegistrationEnabled {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "REGISTRATION_DISABLED"})
		return
	}
	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
	}
	if !decodeJSON(w, r, &body) {
		return
	}
	user, err := s.store.CreateUser(body.Email, body.Password, body.DisplayName, store.RoleCreator)
	if err != nil {
		writeError(w, err)
		return
	}
	session, publicUser, err := s.store.Login(user.Email, body.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"ok": true, "token": session.Token, "expiresAt": session.ExpiresAt, "user": publicUser,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token != "" {
		if err := s.store.Logout(token); err != nil {
			writeError(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "user": user})
}

func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	sessionID := r.URL.Query().Get("sessionId")

	switch r.Method {
	case http.MethodGet:
		session, err := s.store.ReadStudioSession(user, sessionID)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
	case http.MethodPost:
		var body map[string]any
		if !decodeJSONWithLimit(w, r, &body, 16<<20) {
			return
		}
		session, err := s.store.WriteStudioSession(user, sessionID, body)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
	case http.MethodDelete:
		if err := s.store.DeleteStudioSession(user, sessionID); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodGet:
		limit := queryInt(r, "limit", 30)
		offset := queryInt(r, "offset", 0)
		page, err := s.store.ListHistory(user, limit, offset)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"records":    page.Records,
			"total":      page.Total,
			"nextOffset": page.NextOffset,
		})
	case http.MethodPost:
		var body map[string]any
		if !decodeJSONWithLimit(w, r, &body, 16<<20) {
			return
		}
		record, err := s.store.AppendHistory(user, body, 200)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "record": record})
	case http.MethodDelete:
		if err := s.store.ClearHistory(user); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleHistoryRecord(w http.ResponseWriter, r *http.Request, recordID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if strings.Contains(recordID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
		return
	}
	if err := s.store.DeleteHistory(user, recordID); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleGenerationJobs(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodGet:
		page, err := s.store.ListJobs(user, r.URL.Query().Get("sessionId"), queryInt(r, "limit", 40), queryInt(r, "offset", 0))
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"jobs":       page.Jobs,
			"total":      page.Total,
			"nextOffset": page.NextOffset,
		})
	case http.MethodPost:
		var body map[string]any
		if !decodeJSONWithLimit(w, r, &body, 16<<20) {
			return
		}
		job, duplicate, err := s.store.CreateJob(user, body, 120)
		if err != nil {
			writeError(w, err)
			return
		}
		if !duplicate {
			s.events.Publish(user.ID, job.ID, jobevents.EventType("queued"), job)
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "job": job, "duplicate": duplicate})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleGenerationJob(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if strings.Contains(jobID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		job, found, err := s.store.GetJob(user, jobID)
		if err != nil {
			writeError(w, err)
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "job": job})
	case http.MethodDelete:
		s.cancelExecution(user.ID, jobID)
		job, found, err := s.store.CancelJob(user, jobID)
		if err != nil {
			writeError(w, err)
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
			return
		}
		s.events.Publish(user.ID, job.ID, jobevents.EventType("canceled"), job)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "job": job})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleGenerationJobEvents(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if jobID == "" || strings.Contains(jobID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	job, found, err := s.store.GetJob(user, jobID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "EVENT_STREAM_UNAVAILABLE"})
		return
	}

	afterSequence := uint64(0)
	lastEventID := strings.TrimSpace(r.Header.Get("Last-Event-ID"))
	if lastEventID == "" {
		lastEventID = strings.TrimSpace(r.URL.Query().Get("after"))
	}
	if value, parseErr := strconv.ParseUint(lastEventID, 10, 64); parseErr == nil {
		afterSequence = value
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	if !writeServerEvent(w, "", "snapshot", job) {
		return
	}
	flusher.Flush()

	events, unsubscribe := s.events.Subscribe(user.ID, job.ID, afterSequence)
	defer unsubscribe()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, open := <-events:
			if !open {
				return
			}
			if !writeServerEvent(w, strconv.FormatUint(event.Sequence, 10), string(event.Type), event) {
				return
			}
			flusher.Flush()
		case now := <-heartbeat.C:
			if !writeServerEvent(w, "", string(jobevents.EventTypeHeartbeat), map[string]any{"at": now.UTC()}) {
				return
			}
			flusher.Flush()
		}
	}
}

func writeServerEvent(w io.Writer, id, eventType string, data any) bool {
	body, err := json.Marshal(data)
	if err != nil {
		return false
	}
	if id != "" {
		if _, err := fmt.Fprintf(w, "id: %s\n", id); err != nil {
			return false
		}
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, body); err != nil {
		return false
	}
	return true
}

func (s *Server) handleGenerationJobExecute(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if !s.cfg.ExecutionEnabled {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"ok": false, "error": "GO_EXECUTION_DISABLED"})
		return
	}
	job, found, err := s.store.GetJob(user, jobID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	link, token, personal, found, err := s.resolveProvider(user, job.ProviderID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_NOT_FOUND"})
		return
	}
	plan, err := provider.BuildGenerationPlan(link, job, token != "")
	if err != nil {
		writeError(w, err)
		return
	}
	var executionClient *http.Client
	if personal {
		executionClient, err = newPersonalProviderHTTPClient(r.Context(), plan.Endpoint, s.cfg.AllowPrivateProviderURLs)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "PROVIDER_URL_NOT_ALLOWED"})
			return
		}
	}

	job, found, err = s.store.TransitionJob(user, job.ID, store.JobStatusDispatching, nil, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusDispatching), job)
	job, _, err = s.store.TransitionJob(user, job.ID, store.JobStatusUpstream, nil, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusUpstream), job)
	if job.Mode == "video" {
		ctx, finish := s.beginExecution(user.ID, job.ID, job.Mode)
		go s.executeVideoJob(ctx, finish, user, job, plan, token, executionClient)
		writeJSON(w, http.StatusAccepted, map[string]any{"ok": true, "job": job})
		return
	}

	ctx, cancel := s.beginExecution(user.ID, job.ID, job.Mode)
	defer cancel()
	result, executeErr := executor.Execute(ctx, plan, token, executionClient)
	if executeErr != nil {
		current, _, _ := s.store.GetJob(user, job.ID)
		if current.Status == store.JobStatusCanceled {
			writeJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": "JOB_CANCELED", "job": current})
			return
		}
		failure := executorErrorPayload(executeErr)
		failed, _, transitionErr := s.store.TransitionJob(user, job.ID, store.JobStatusFailed, nil, failure)
		if transitionErr == nil {
			s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusFailed), failed)
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": failure["code"], "job": failed})
		return
	}

	needsSaving := false
	for _, image := range result.Images {
		if image.B64JSON != "" {
			needsSaving = true
			break
		}
	}
	if needsSaving {
		job, _, err = s.store.TransitionJob(user, job.ID, store.JobStatusSaving, nil, nil)
		if err != nil {
			writeError(w, err)
			return
		}
		s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusSaving), job)
	}
	resultURLs, err := s.persistGeneratedImages(user, job.ID, result)
	if err != nil {
		failure := map[string]any{"code": "GENERATED_ASSET_SAVE_FAILED", "message": err.Error()}
		failed, _, _ := s.store.TransitionJob(user, job.ID, store.JobStatusFailed, nil, failure)
		s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusFailed), failed)
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "GENERATED_ASSET_SAVE_FAILED", "job": failed})
		return
	}
	completed, _, err := s.store.TransitionJob(user, job.ID, store.JobStatusCompleted, resultURLs, nil)
	if err != nil {
		writeError(w, err)
		return
	}
	s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusCompleted), completed)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "job": completed})
}

func (s *Server) resolveProvider(user store.PublicUser, providerID string) (store.ProviderLink, string, bool, bool, error) {
	link, found, err := s.store.GetProviderLinkForUser(user, providerID)
	if err != nil {
		return store.ProviderLink{}, "", false, false, err
	}
	if found {
		return link, providerAuthToken(link), false, true, nil
	}
	connection, found, err := s.store.GetProviderConnection(user, providerID)
	if err != nil || !found || !connection.Enabled {
		return store.ProviderLink{}, "", true, false, err
	}
	if s.vault == nil {
		return store.ProviderLink{}, "", true, false, providerconnections.ErrSecretUnavailable
	}
	credentials, err := providerconnections.Open(s.vault, connection)
	if err != nil {
		return store.ProviderLink{}, "", true, false, err
	}
	token := credentials.APIKey
	if token == "" {
		token = credentials.AccessToken
	}
	return store.ProviderLink{
		ID: connection.ID, ProviderType: connection.ProviderType, Label: connection.Label,
		Enabled: connection.Enabled, BaseURL: connection.BaseURL, ModelBaseURL: connection.ModelBaseURL,
		AccountMode: connection.AccountMode,
	}, token, true, true, nil
}

func (s *Server) beginExecution(userID, jobID, mode string) (context.Context, context.CancelFunc) {
	timeout := time.Duration(s.cfg.ExecutionTimeoutSeconds) * time.Second
	if mode == "video" {
		timeout = time.Duration(s.cfg.VideoExecutionTimeoutSeconds) * time.Second
	}
	if timeout <= 0 {
		timeout = 30 * time.Minute
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	key := userID + ":" + jobID
	s.executionMu.Lock()
	s.executionCancels[key] = cancel
	s.executionMu.Unlock()
	return ctx, func() {
		cancel()
		s.executionMu.Lock()
		delete(s.executionCancels, key)
		s.executionMu.Unlock()
	}
}

func (s *Server) executeVideoJob(ctx context.Context, finish context.CancelFunc, user store.PublicUser, job store.GenerationJob, plan provider.DispatchPlan, token string, client *http.Client) {
	defer finish()
	result, err := executor.ExecuteVideo(ctx, plan, token, client, executor.VideoOptions{
		ClientRequestID:     job.ID,
		PollInterval:        time.Duration(s.cfg.VideoPollIntervalMS) * time.Millisecond,
		MaxTransientRetries: s.cfg.VideoPollMaxTransientFailures,
		OnProgress: func(string) {
			current, found, getErr := s.store.GetJob(user, job.ID)
			if getErr != nil || !found || current.Status == store.JobStatusCanceled {
				return
			}
			s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusUpstream), current)
		},
	})
	if err != nil {
		current, _, _ := s.store.GetJob(user, job.ID)
		if current.Status == store.JobStatusCanceled {
			return
		}
		failure := executorErrorPayload(err)
		failed, _, transitionErr := s.store.TransitionJob(user, job.ID, store.JobStatusFailed, nil, failure)
		if transitionErr == nil {
			s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusFailed), failed)
		}
		return
	}

	saving, found, err := s.store.TransitionJob(user, job.ID, store.JobStatusSaving, nil, nil)
	if err != nil || !found {
		return
	}
	s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusSaving), saving)
	resultURL, err := s.persistGeneratedVideo(user, job.ID, result)
	if err != nil {
		failure := map[string]any{"code": "GENERATED_ASSET_SAVE_FAILED", "message": err.Error()}
		failed, _, _ := s.store.TransitionJob(user, job.ID, store.JobStatusFailed, nil, failure)
		s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusFailed), failed)
		return
	}
	completed, _, err := s.store.TransitionJob(user, job.ID, store.JobStatusCompleted, []string{resultURL}, nil)
	if err == nil {
		s.events.Publish(user.ID, job.ID, jobevents.EventType(store.JobStatusCompleted), completed)
	}
}

func (s *Server) cancelExecution(userID, jobID string) {
	s.executionMu.Lock()
	cancel := s.executionCancels[userID+":"+jobID]
	s.executionMu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func executorErrorPayload(err error) map[string]any {
	payload := map[string]any{"code": "GENERATION_EXECUTION_FAILED", "message": err.Error()}
	var executionErr *executor.Error
	if errors.As(err, &executionErr) {
		payload["code"] = executionErr.Code
		if executionErr.UpstreamStatus != 0 {
			payload["upstreamStatus"] = executionErr.UpstreamStatus
		}
		if executionErr.UpstreamBody != "" {
			payload["upstreamBody"] = executionErr.UpstreamBody
		}
	}
	return payload
}

func (s *Server) persistGeneratedImages(user store.PublicUser, jobID string, result executor.Result) ([]string, error) {
	urls := make([]string, 0, len(result.Images))
	for index, image := range result.Images {
		if image.B64JSON == "" {
			if image.URL != "" {
				parsed, err := url.Parse(image.URL)
				if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil {
					return nil, errors.New("invalid generated image URL")
				}
				urls = append(urls, image.URL)
			}
			continue
		}
		if s.assets == nil {
			return nil, errors.New("asset store unavailable")
		}
		body, err := base64.StdEncoding.DecodeString(image.B64JSON)
		if err != nil {
			body, err = base64.RawStdEncoding.DecodeString(image.B64JSON)
		}
		if err != nil {
			return nil, errors.New("invalid base64 image")
		}
		mediaType := http.DetectContentType(body)
		if !allowedAssetMediaType(mediaType) || strings.HasPrefix(mediaType, "video/") {
			return nil, errors.New("unsupported generated image type")
		}
		filename := fmt.Sprintf("generated-%s-%d%s", jobID, index+1, mediaExtension(mediaType))
		asset, err := s.assets.Put(bytes.NewReader(body), assets.Metadata{Filename: filename, MediaType: mediaType})
		if err != nil {
			return nil, err
		}
		if _, err := s.store.AttachUserAsset(user, store.UserAsset{
			Digest: asset.Digest, Filename: filename, MediaType: mediaType, Size: asset.Size, CreatedAt: asset.CreatedAt,
		}); err != nil {
			return nil, err
		}
		urls = append(urls, "/studio-api/assets/"+asset.Digest)
	}
	if len(urls) == 0 {
		return nil, errors.New("no generated images")
	}
	return urls, nil
}

func (s *Server) persistGeneratedVideo(user store.PublicUser, jobID string, result executor.VideoResult) (string, error) {
	if s.assets == nil {
		return "", errors.New("asset store unavailable")
	}
	if len(result.Body) == 0 {
		return "", errors.New("generated video is empty")
	}
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(result.MediaType, ";")[0]))
	if !strings.HasPrefix(mediaType, "video/") || !allowedAssetMediaType(mediaType) {
		return "", errors.New("unsupported generated video type")
	}
	filename := fmt.Sprintf("generated-%s-1%s", jobID, mediaExtension(mediaType))
	asset, err := s.assets.Put(bytes.NewReader(result.Body), assets.Metadata{Filename: filename, MediaType: mediaType})
	if err != nil {
		return "", err
	}
	if _, err := s.store.AttachUserAsset(user, store.UserAsset{
		Digest: asset.Digest, Filename: filename, MediaType: mediaType, Size: asset.Size, CreatedAt: asset.CreatedAt,
	}); err != nil {
		return "", err
	}
	return "/studio-api/assets/" + asset.Digest, nil
}

func mediaExtension(mediaType string) string {
	switch strings.ToLower(strings.Split(mediaType, ";")[0]) {
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "image/avif":
		return ".avif"
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	case "video/mp4":
		return ".mp4"
	default:
		return ".png"
	}
}

func (s *Server) handleGenerationJobDispatchPlan(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if strings.Contains(jobID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
		return
	}

	job, found, err := s.store.GetJob(user, jobID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	link, token, _, found, err := s.resolveProvider(user, job.ProviderID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_NOT_FOUND"})
		return
	}

	plan, err := provider.BuildGenerationPlan(link, job, token != "")
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "jobId": job.ID, "dispatchPlan": plan})
}

func (s *Server) handleGenerationJobContinuationPlan(w http.ResponseWriter, r *http.Request, jobID string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if strings.Contains(jobID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
		return
	}
	var body workflow.ContinuationRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	job, found, err := s.store.GetJob(user, jobID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
		return
	}
	plan, err := workflow.BuildContinuationPlan(job, body)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "jobId": job.ID, "continuationPlan": plan})
}

func (s *Server) handleProviders(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	links, err := s.store.ListProviderLinksForUser(user)
	if err != nil {
		writeError(w, err)
		return
	}
	publicLinks := make([]store.PublicProviderLink, 0, len(links))
	for _, link := range links {
		publicLinks = append(publicLinks, store.PublicProvider(link))
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "providers": publicLinks})
}

func (s *Server) handleProviderConnections(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		connections, err := s.store.ListProviderConnections(user)
		if err != nil {
			writeError(w, err)
			return
		}
		public := make([]providerconnections.PublicConnection, 0, len(connections))
		for _, connection := range connections {
			public = append(public, providerconnections.Public(connection))
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connections": public})
	case http.MethodPost:
		if s.vault == nil {
			writeJSON(w, http.StatusFailedDependency, map[string]any{"ok": false, "error": "PROVIDER_ENCRYPTION_NOT_CONFIGURED"})
			return
		}
		var input providerconnections.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		connection, err := s.connectionFromInput(user, input, providerconnections.Connection{})
		if err != nil {
			writeError(w, err)
			return
		}
		created, err := s.store.CreateProviderConnection(user, connection)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "connection": providerconnections.Public(created)})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleProviderConnection(w http.ResponseWriter, r *http.Request, connectionPath string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	connectionID := connectionPath
	models := false
	if id, suffix, found := strings.Cut(connectionPath, "/"); found {
		if suffix != "models" || strings.Contains(suffix, "/") {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
			return
		}
		connectionID = id
		models = true
	}
	if connectionID == "" || providerconnections.CleanID(connectionID) != connectionID {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_CONNECTION_NOT_FOUND"})
		return
	}
	existing, found, err := s.store.GetProviderConnection(user, connectionID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_CONNECTION_NOT_FOUND"})
		return
	}
	if models {
		s.handleProviderConnectionModels(w, r, existing)
		return
	}

	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connection": providerconnections.Public(existing)})
	case http.MethodPut:
		if s.vault == nil {
			writeJSON(w, http.StatusFailedDependency, map[string]any{"ok": false, "error": "PROVIDER_ENCRYPTION_NOT_CONFIGURED"})
			return
		}
		var input providerconnections.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		connection, err := s.connectionFromInput(user, input, existing)
		if err != nil {
			writeError(w, err)
			return
		}
		updated, err := s.store.UpdateProviderConnection(user, connectionID, connection)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "connection": providerconnections.Public(updated)})
	case http.MethodDelete:
		if err := s.store.DeleteProviderConnection(user, connectionID); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) connectionFromInput(user store.PublicUser, input providerconnections.Input, existing providerconnections.Connection) (providerconnections.Connection, error) {
	id := providerconnections.CleanID(input.ID)
	if existing.ID != "" {
		id = existing.ID
	} else if id == "" {
		id = providerconnections.NewID()
	}
	credentials := providerconnections.Credentials{}
	if existing.ID != "" {
		opened, err := providerconnections.Open(s.vault, existing)
		if err != nil {
			return providerconnections.Connection{}, err
		}
		credentials = opened
	}
	if input.APIKey != nil {
		credentials.APIKey = strings.TrimSpace(*input.APIKey)
	}
	if input.AccessToken != nil {
		credentials.AccessToken = strings.TrimSpace(*input.AccessToken)
	}
	envelope, err := providerconnections.Seal(s.vault, user.ID, id, credentials)
	if err != nil {
		return providerconnections.Connection{}, err
	}
	return providerconnections.Normalize(providerconnections.Connection{
		ID: id, OwnerID: user.ID, ProviderType: input.ProviderType, Label: input.Label,
		Enabled: input.Enabled, BaseURL: input.BaseURL, ModelBaseURL: input.ModelBaseURL,
		AccountMode: input.AccountMode, APIKeyConfigured: credentials.APIKey != "",
		AccessTokenConfigured: credentials.AccessToken != "", Credentials: envelope,
	}), nil
}

func (s *Server) handleProviderConnectionModels(w http.ResponseWriter, r *http.Request, connection providerconnections.Connection) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	if s.vault == nil {
		writeJSON(w, http.StatusFailedDependency, map[string]any{"ok": false, "error": "PROVIDER_ENCRYPTION_NOT_CONFIGURED"})
		return
	}
	credentials, err := providerconnections.Open(s.vault, connection)
	if err != nil {
		writeError(w, err)
		return
	}
	token := credentials.APIKey
	if token == "" {
		token = credentials.AccessToken
	}
	endpoint := strings.TrimRight(connection.ModelBaseURL, "/")
	if !strings.HasSuffix(endpoint, "/models") {
		endpoint += "/models"
	}
	client, err := newPersonalProviderHTTPClient(r.Context(), endpoint, s.cfg.AllowPrivateProviderURLs)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "PROVIDER_URL_NOT_ALLOWED"})
		return
	}
	models, upstreamStatus, upstreamBody, err := fetchProviderModels(r.Context(), endpoint, token, client)
	if err != nil {
		if upstreamStatus != 0 {
			writeJSON(w, http.StatusBadGateway, map[string]any{
				"ok": false, "error": "PROVIDER_MODELS_UPSTREAM_FAILED", "upstreamStatus": upstreamStatus,
				"upstreamBody": trimForClient(upstreamBody, 1200),
			})
			return
		}
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "PROVIDER_MODELS_REQUEST_FAILED"})
		return
	}
	models = provider.AnnotateModels(connection.ProviderType, models)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "connection": providerconnections.Public(connection), "models": models,
		"count": len(models), "syncedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func fetchProviderModels(parent context.Context, endpoint, token string, client *http.Client) ([]map[string]any, int, string, error) {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || token == "" {
		return nil, 0, "", errors.New("provider model configuration invalid")
	}
	ctx, cancel := context.WithTimeout(parent, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, 0, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, resp.StatusCode, string(body), errors.New("provider models upstream failed")
	}
	models, err := parseProviderModels(body)
	return models, 0, "", err
}

func (s *Server) handleProviderModels(w http.ResponseWriter, r *http.Request, providerPath string) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}

	providerID, modelsPath, ok := strings.Cut(providerPath, "/")
	if !ok || modelsPath != "models" || strings.Contains(providerID, "/") {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "NOT_FOUND"})
		return
	}
	link, found, err := s.store.GetProviderLinkForUser(user, providerID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_NOT_FOUND"})
		return
	}

	endpoint := providerModelsEndpoint(link)
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "PROVIDER_MODEL_BASE_URL_REQUIRED"})
		return
	}
	token := providerAuthToken(link)
	if token == "" {
		writeJSON(w, http.StatusFailedDependency, map[string]any{"ok": false, "error": "PROVIDER_SECRET_NOT_CONFIGURED"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "PROVIDER_MODELS_REQUEST_FAILED"})
		return
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "PROVIDER_MODELS_REQUEST_FAILED"})
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "PROVIDER_MODELS_READ_FAILED"})
		return
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok":             false,
			"error":          "PROVIDER_MODELS_UPSTREAM_FAILED",
			"upstreamStatus": resp.StatusCode,
			"upstreamBody":   trimForClient(string(body), 1200),
		})
		return
	}

	models, err := parseProviderModels(body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "error": "PROVIDER_MODELS_BAD_RESPONSE"})
		return
	}
	models = provider.AnnotateModels(link.ProviderType, models)
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"provider": store.PublicProvider(link),
		"models":   models,
		"count":    len(models),
		"syncedAt": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		users, err := s.store.ListUsers()
		if err != nil {
			writeError(w, err)
			return
		}
		publicUsers := make([]store.PublicUser, 0, len(users))
		for _, user := range users {
			publicUsers = append(publicUsers, store.Public(user))
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "users": publicUsers})
	case http.MethodPost:
		var body struct {
			Email       string `json:"email"`
			Password    string `json:"password"`
			DisplayName string `json:"displayName"`
			Role        string `json:"role"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		user, err := s.store.CreateUser(body.Email, body.Password, body.DisplayName, body.Role)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "user": store.Public(user)})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func (s *Server) handleAdminUser(w http.ResponseWriter, r *http.Request, id string) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	if r.Method != http.MethodPatch {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
		return
	}
	var patch map[string]any
	if !decodeJSON(w, r, &patch) {
		return
	}
	user, err := s.store.UpdateUser(id, patch)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "user": store.Public(user)})
}

func (s *Server) handleAdminProviderLinks(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		links, err := s.store.ListProviderLinks()
		if err != nil {
			writeError(w, err)
			return
		}
		publicLinks := make([]store.PublicProviderLink, 0, len(links))
		for _, link := range links {
			publicLinks = append(publicLinks, store.PublicProvider(link))
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "providerLinks": publicLinks})
	case http.MethodPost:
		var body store.ProviderLink
		if !decodeJSON(w, r, &body) {
			return
		}
		link, err := s.store.UpsertProviderLink(body)
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "providerLink": store.PublicProvider(link)})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
	}
}

func providerModelsEndpoint(link store.ProviderLink) string {
	base := strings.TrimRight(link.ModelBaseURL, "/")
	if base == "" {
		base = strings.TrimRight(link.BaseURL, "/")
	}
	if base == "" {
		return ""
	}
	if strings.HasSuffix(base, "/models") {
		return base
	}
	return base + "/models"
}

func providerAuthToken(link store.ProviderLink) string {
	for _, key := range []string{link.SecretEnv, link.AccessTokenEnv} {
		if value := strings.TrimSpace(key); value != "" {
			if token := strings.TrimSpace(getenv(value)); token != "" {
				return token
			}
		}
	}
	return ""
}

func parseProviderModels(body []byte) ([]map[string]any, error) {
	var payload struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	models := make([]map[string]any, 0, len(payload.Data))
	for _, item := range payload.Data {
		id, _ := item["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		model := map[string]any{"id": id}
		for _, key := range []string{
			"name", "label", "model", "object", "type", "category", "mode", "modality", "endpoint",
			"capabilities", "capability", "features", "supported_generation_types", "supportedGenerationTypes", "created",
		} {
			if value, ok := item[key]; ok {
				model[key] = value
			}
		}
		if value, ok := item["owned_by"]; ok {
			model["ownedBy"] = value
		}
		models = append(models, model)
	}
	return models, nil
}

func trimForClient(value string, limit int) string {
	value = strings.TrimSpace(value)
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[:limit]
}

var getenv = os.Getenv

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (store.PublicUser, bool) {
	user, ok := s.requireUser(w, r)
	if !ok {
		return store.PublicUser{}, false
	}
	if user.Role != store.RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "ADMIN_REQUIRED"})
		return store.PublicUser{}, false
	}
	return user, true
}

func (s *Server) requireUser(w http.ResponseWriter, r *http.Request) (store.PublicUser, bool) {
	user, ok, err := s.store.Authenticate(bearerToken(r))
	if err != nil {
		writeError(w, err)
		return store.PublicUser{}, false
	}
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "AUTH_REQUIRED"})
		return store.PublicUser{}, false
	}
	return user, true
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := strings.TrimRight(r.Header.Get("Origin"), "/")
	if origin == "" {
		return true
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Studio-Bootstrap-Token")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			return true
		}
	}
	return false
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	return decodeJSONWithLimit(w, r, target, 2<<20)
}

func decodeJSONWithLimit(w http.ResponseWriter, r *http.Request, target any, limit int64) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	if err := decoder.Decode(target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "BAD_JSON"})
		return false
	}
	return true
}

func queryInt(r *http.Request, key string, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(key))
	if err != nil {
		return fallback
	}
	return value
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	message := err.Error()
	if errors.Is(err, http.ErrNoCookie) {
		status = http.StatusUnauthorized
	}
	switch message {
	case "AUTH_REQUIRED", "INVALID_CREDENTIALS", "USER_DISABLED":
		status = http.StatusUnauthorized
	case "ADMIN_REQUIRED":
		status = http.StatusForbidden
	case "USER_NOT_FOUND":
		status = http.StatusNotFound
	case "PROVIDER_NOT_FOUND":
		status = http.StatusNotFound
	case "PROJECT_NOT_FOUND":
		status = http.StatusNotFound
	case "EMAIL_ALREADY_EXISTS":
		status = http.StatusConflict
	case "PROJECT_ALREADY_EXISTS":
		status = http.StatusConflict
	case "PROJECT_STATUS_TRANSITION_NOT_ALLOWED":
		status = http.StatusConflict
	case "PROVIDER_CONNECTION_NOT_FOUND":
		status = http.StatusNotFound
	case "PROVIDER_CONNECTION_ALREADY_EXISTS":
		status = http.StatusConflict
	case "PROVIDER_CONNECTION_SECRET_UNAVAILABLE", "PROVIDER_CONNECTION_CREDENTIAL_OWNER_MISMATCH", "PROVIDER_CONNECTION_CREDENTIAL_ID_MISMATCH":
		status = http.StatusFailedDependency
	case "PARENT_PROMPT_REQUIRED", "CHANGE_PROMPT_REQUIRED":
		status = http.StatusBadRequest
	}
	writeJSON(w, status, map[string]any{"ok": false, "error": message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	body, err := json.Marshal(value)
	if err != nil {
		http.Error(w, "JSON_ENCODE_FAILED", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func bearerToken(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(header) < 8 || !strings.EqualFold(header[:7], "Bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}
