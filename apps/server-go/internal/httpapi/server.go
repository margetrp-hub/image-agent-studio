package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/workflow"
)

type Server struct {
	cfg   config.Config
	store *store.Store
}

func NewServer(cfg config.Config, studioStore *store.Store) *Server {
	return &Server{cfg: cfg, store: studioStore}
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
	case path == "/studio-api/generation-jobs":
		s.handleGenerationJobs(w, r)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/dispatch-plan"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/dispatch-plan")
		s.handleGenerationJobDispatchPlan(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/") && strings.HasSuffix(path, "/continuation-plan"):
		jobID := strings.TrimSuffix(strings.TrimPrefix(path, "/studio-api/generation-jobs/"), "/continuation-plan")
		s.handleGenerationJobContinuationPlan(w, r, jobID)
	case strings.HasPrefix(path, "/studio-api/generation-jobs/"):
		s.handleGenerationJob(w, r, strings.TrimPrefix(path, "/studio-api/generation-jobs/"))
	case path == "/studio-api/providers":
		s.handleProviders(w, r)
	case strings.HasPrefix(path, "/studio-api/providers/"):
		s.handleProviderModels(w, r, strings.TrimPrefix(path, "/studio-api/providers/"))
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

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	userCount, _ := s.store.UserCount()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"service":      "image-agent-studio-go",
		"version":      s.cfg.Version,
		"dataDir":      s.cfg.DataDir,
		"users":        userCount,
		"startedAt":    time.Now().UTC().Format(time.RFC3339),
		"authMode":     "studio-local",
		"providerMode": "admin-provider-links",
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
		job, found, err := s.store.CancelJob(user, jobID)
		if err != nil {
			writeError(w, err)
			return
		}
		if !found {
			writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "GENERATION_JOB_NOT_FOUND"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "job": job})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "METHOD_NOT_ALLOWED"})
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
	link, found, err := s.store.GetProviderLinkForUser(user, job.ProviderID)
	if err != nil {
		writeError(w, err)
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "PROVIDER_NOT_FOUND"})
		return
	}

	plan, err := provider.BuildImageGenerationPlan(link, job, providerAuthToken(link) != "")
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
		Data []struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			OwnedBy string `json:"owned_by"`
			Created any    `json:"created,omitempty"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	models := make([]map[string]any, 0, len(payload.Data))
	for _, item := range payload.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		model := map[string]any{"id": id}
		if item.Object != "" {
			model["object"] = item.Object
		}
		if item.OwnedBy != "" {
			model["ownedBy"] = item.OwnedBy
		}
		if item.Created != nil {
			model["created"] = item.Created
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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
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
	case "EMAIL_ALREADY_EXISTS":
		status = http.StatusConflict
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
