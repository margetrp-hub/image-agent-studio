package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	creativeproject "github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/project"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func TestHealthReportsStableServerStartTime(t *testing.T) {
	server := NewServer(config.Config{Version: "test"}, store.New(t.TempDir()))
	server.startedAt = time.Date(2026, time.August, 2, 12, 30, 0, 0, time.UTC)
	recorder := httptest.NewRecorder()
	server.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/studio-api/health", nil))
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"startedAt":"2026-08-02T12:30:00Z"`) {
		t.Fatalf("health did not report stable server start time: %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestParseProviderModelsPreservesCapabilityMetadata(t *testing.T) {
	models, err := parseProviderModels([]byte(`{"data":[{"id":"jimeng-3","type":"model","modality":"video","capabilities":["video_generation"],"secret":"must-not-return"}]}`))
	if err != nil || len(models) != 1 {
		t.Fatalf("parseProviderModels failed: %#v err=%v", models, err)
	}
	if models[0]["modality"] != "video" || models[0]["type"] != "model" {
		t.Fatalf("capability metadata was lost: %#v", models[0])
	}
	if _, leaked := models[0]["secret"]; leaked {
		t.Fatalf("unapproved model metadata leaked: %#v", models[0])
	}
}

func TestGenerationJobEventStreamReturnsSnapshotAndReplay(t *testing.T) {
	studioStore := store.New(t.TempDir())
	user, err := studioStore.CreateUser("events@example.com", "change-me-now", "Events", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	session, _, _ := studioStore.Login(user.Email, "change-me-now")
	job, _, err := studioStore.CreateJob(store.Public(user), map[string]any{
		"request": map[string]any{
			"id": "job-events-1", "sessionId": "session-1", "mode": "image",
			"route": "generations", "providerId": "openai-compatible", "model": "gpt-image-2",
			"generationPrompt": "A precise event stream test image.",
		},
	}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	server := NewServer(config.Config{Version: "test"}, studioStore)
	server.events.Publish(user.ID, job.ID, "queued", job)

	ctx, cancel := context.WithCancel(context.Background())
	recorder := &flushCancelRecorder{ResponseRecorder: httptest.NewRecorder(), cancel: cancel, cancelAfter: 2}
	request := httptest.NewRequest(http.MethodGet, "/studio-api/generation-jobs/"+job.ID+"/events", nil).WithContext(ctx)
	request.Header.Set("Authorization", "Bearer "+session.Token)
	server.ServeHTTP(recorder, request)

	response := recorder.Body.String()
	if recorder.Code != http.StatusOK || !strings.Contains(response, "event: snapshot") || !strings.Contains(response, "event: queued") || !strings.Contains(response, "id: 1") {
		t.Fatalf("unexpected event stream response %d: %s", recorder.Code, response)
	}
	if contentType := recorder.Header().Get("Content-Type"); !strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatalf("unexpected event stream content type: %s", contentType)
	}
}

func TestCreatorCanRegisterAndRegistrationCanBeDisabled(t *testing.T) {
	studioStore := store.New(t.TempDir())
	server := NewServer(config.Config{Version: "test", RegistrationEnabled: true}, studioStore)
	body := bytes.NewBufferString(`{"email":"new@example.com","password":"change-me-now","displayName":"New Creator"}`)
	request := httptest.NewRequest(http.MethodPost, "/studio-api/auth/register", body)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusCreated || !strings.Contains(result.Body.String(), `"role":"creator"`) || !strings.Contains(result.Body.String(), `"token"`) {
		t.Fatalf("registration failed: %d %s", result.Code, result.Body.String())
	}

	disabled := NewServer(config.Config{Version: "test", RegistrationEnabled: false}, store.New(t.TempDir()))
	request = httptest.NewRequest(http.MethodPost, "/studio-api/auth/register", bytes.NewBufferString(`{"email":"blocked@example.com","password":"change-me-now"}`))
	result = httptest.NewRecorder()
	disabled.ServeHTTP(result, request)
	if result.Code != http.StatusForbidden || !strings.Contains(result.Body.String(), "REGISTRATION_DISABLED") {
		t.Fatalf("disabled registration was not rejected: %d %s", result.Code, result.Body.String())
	}
}

type flushCancelRecorder struct {
	*httptest.ResponseRecorder
	cancel      context.CancelFunc
	cancelAfter int
	flushes     int
}

func (r *flushCancelRecorder) Flush() {
	r.flushes++
	r.ResponseRecorder.Flush()
	if r.cancel != nil && r.flushes >= r.cancelAfter {
		r.cancel()
	}
}

func TestProjectLifecycleIsIsolatedByStudioUser(t *testing.T) {
	dataDir := t.TempDir()
	studioStore := store.New(dataDir)
	first, err := studioStore.CreateUser("first@example.com", "change-me-now", "First", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser first failed: %v", err)
	}
	second, err := studioStore.CreateUser("second@example.com", "change-me-now", "Second", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser second failed: %v", err)
	}
	firstSession, _, _ := studioStore.Login(first.Email, "change-me-now")
	secondSession, _, _ := studioStore.Login(second.Email, "change-me-now")
	server := NewServer(config.Config{Version: "test"}, studioStore)

	createBody := bytes.NewBufferString(`{"name":"Launch film","scenes":[{"id":"scene-1","order":1,"title":"Opening","shots":[{"id":"shot-1","sceneId":"scene-1","order":1,"title":"Hero frame","prompt":"A precise opening frame.","mediaType":"image","status":"ready"}]}]}`)
	create := httptest.NewRequest(http.MethodPost, "/studio-api/projects", createBody)
	create.Header.Set("Authorization", "Bearer "+firstSession.Token)
	created := httptest.NewRecorder()
	server.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create project status %d: %s", created.Code, created.Body.String())
	}
	var payload struct {
		Project creativeproject.Project `json:"project"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil || payload.Project.ID == "" {
		t.Fatalf("decode created project: %v %s", err, created.Body.String())
	}

	reopened := store.New(dataDir)
	persisted, found, err := reopened.GetProject(store.Public(first), payload.Project.ID)
	if err != nil || !found || persisted.Name != "Launch film" || len(persisted.Scenes) != 1 {
		t.Fatalf("project did not survive store reconstruction: found=%v err=%v project=%#v", found, err, persisted)
	}

	getOther := httptest.NewRequest(http.MethodGet, "/studio-api/projects/"+payload.Project.ID, nil)
	getOther.Header.Set("Authorization", "Bearer "+secondSession.Token)
	otherResult := httptest.NewRecorder()
	server.ServeHTTP(otherResult, getOther)
	if otherResult.Code != http.StatusNotFound {
		t.Fatalf("other user read project status %d: %s", otherResult.Code, otherResult.Body.String())
	}

	archive := httptest.NewRequest(http.MethodDelete, "/studio-api/projects/"+payload.Project.ID, nil)
	archive.Header.Set("Authorization", "Bearer "+firstSession.Token)
	archiveResult := httptest.NewRecorder()
	server.ServeHTTP(archiveResult, archive)
	if archiveResult.Code != http.StatusOK || !strings.Contains(archiveResult.Body.String(), `"status":"archived"`) {
		t.Fatalf("archive project status %d: %s", archiveResult.Code, archiveResult.Body.String())
	}
}

func TestProjectPutPreservesAggregateAndRejectsInvalidStatusTransition(t *testing.T) {
	studioStore := store.New(t.TempDir())
	user, err := studioStore.CreateUser("creator@example.com", "change-me-now", "Creator", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	session, _, _ := studioStore.Login(user.Email, "change-me-now")
	created, err := studioStore.CreateProject(store.Public(user), creativeproject.Project{
		Name: "Original",
		Scenes: []creativeproject.Scene{{
			ID: "scene-1", Order: 1, Title: "Opening",
		}},
	})
	if err != nil {
		t.Fatalf("CreateProject failed: %v", err)
	}
	server := NewServer(config.Config{Version: "test"}, studioStore)

	created.Name = "Renamed"
	created.Status = creativeproject.ProjectStatusActive
	body, _ := json.Marshal(created)
	request := httptest.NewRequest(http.MethodPut, "/studio-api/projects/"+created.ID, bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+session.Token)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"name":"Renamed"`) || !strings.Contains(result.Body.String(), `"scene-1"`) {
		t.Fatalf("project put failed or erased aggregate: %d %s", result.Code, result.Body.String())
	}

	created.Status = creativeproject.ProjectStatusDraft
	body, _ = json.Marshal(created)
	request = httptest.NewRequest(http.MethodPut, "/studio-api/projects/"+created.ID, bytes.NewReader(body))
	request.Header.Set("Authorization", "Bearer "+session.Token)
	result = httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusConflict || !strings.Contains(result.Body.String(), "PROJECT_STATUS_TRANSITION_NOT_ALLOWED") {
		t.Fatalf("invalid project transition was accepted: %d %s", result.Code, result.Body.String())
	}

	patchRequest := httptest.NewRequest(http.MethodPatch, "/studio-api/projects/"+created.ID, bytes.NewBufferString(`{"name":"Partial"}`))
	patchRequest.Header.Set("Authorization", "Bearer "+session.Token)
	patchResult := httptest.NewRecorder()
	server.ServeHTTP(patchResult, patchRequest)
	if patchResult.Code != http.StatusMethodNotAllowed {
		t.Fatalf("partial PATCH should be rejected, got %d: %s", patchResult.Code, patchResult.Body.String())
	}
}

func TestProviderModelsSyncUsesServerSecret(t *testing.T) {
	upstreamAuth := map[string]string{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamAuth[r.URL.Path] = r.Header.Get("Authorization")
		if r.URL.Path != "/newapi/v1/models" && r.URL.Path != "/sub2api/v1/models" {
			t.Fatalf("unexpected upstream path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"object": "list",
			"data": []map[string]any{
				{"id": "gpt-image-2", "object": "model", "owned_by": "openai"},
			},
		})
	}))
	defer upstream.Close()

	t.Setenv("STUDIO_SHARED_NEWAPI_API_KEY", "server-only-secret")
	t.Setenv("STUDIO_SHARED_SUB2API_API_KEY", "server-only-sub2-secret")
	studioStore := store.New(t.TempDir())
	if _, err := studioStore.CreateUser("creator@example.com", "change-me-now", "Creator", store.RoleCreator); err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	session, _, err := studioStore.Login("creator@example.com", "change-me-now")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	_, err = studioStore.UpsertProviderLink(store.ProviderLink{
		ID:           "newapi-shared",
		ProviderType: "newapi-compatible",
		Label:        "Shared NewAPI",
		Enabled:      true,
		BaseURL:      upstream.URL + "/newapi/v1",
		SecretEnv:    "STUDIO_SHARED_NEWAPI_API_KEY",
		AllowedRoles: []string{store.RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink failed: %v", err)
	}
	_, err = studioStore.UpsertProviderLink(store.ProviderLink{
		ID:           "sub2api-shared",
		ProviderType: "sub2api-compatible",
		Label:        "Shared Sub2API",
		Enabled:      true,
		BaseURL:      upstream.URL + "/unused-base/v1",
		ModelBaseURL: upstream.URL + "/sub2api/v1",
		SecretEnv:    "STUDIO_SHARED_SUB2API_API_KEY",
		AllowedRoles: []string{store.RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink sub2api failed: %v", err)
	}

	server := NewServer(config.Config{Version: "test"}, studioStore)
	for _, item := range []struct {
		providerID string
		path       string
		token      string
	}{
		{providerID: "newapi-shared", path: "/newapi/v1/models", token: "server-only-secret"},
		{providerID: "sub2api-shared", path: "/sub2api/v1/models", token: "server-only-sub2-secret"},
	} {
		req := httptest.NewRequest(http.MethodGet, "/studio-api/providers/"+item.providerID+"/models", nil)
		req.Header.Set("Authorization", "Bearer "+session.Token)
		rec := httptest.NewRecorder()

		server.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("%s unexpected status %d: %s", item.providerID, rec.Code, rec.Body.String())
		}
		if upstreamAuth[item.path] != "Bearer "+item.token {
			t.Fatalf("%s upstream did not receive server secret, got %q", item.providerID, upstreamAuth[item.path])
		}
		body := rec.Body.String()
		if !strings.Contains(body, "gpt-image-2") {
			t.Fatalf("%s model response missing synced model: %s", item.providerID, body)
		}
		if strings.Contains(body, item.token) {
			t.Fatalf("%s model response leaked server secret: %s", item.providerID, body)
		}
	}
}

func TestPersonalProviderConnectionIsEncryptedIsolatedAndSyncsModels(t *testing.T) {
	upstreamToken := ""
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamToken = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]any{{"id": "gpt-image-2"}}})
	}))
	defer upstream.Close()

	dataDir := t.TempDir()
	studioStore := store.New(dataDir)
	first, _ := studioStore.CreateUser("first-provider@example.com", "change-me-now", "First", store.RoleCreator)
	second, _ := studioStore.CreateUser("second-provider@example.com", "change-me-now", "Second", store.RoleCreator)
	firstSession, _, _ := studioStore.Login(first.Email, "change-me-now")
	secondSession, _, _ := studioStore.Login(second.Email, "change-me-now")
	masterKey := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x61}, 32))
	server := NewServer(config.Config{DataDir: dataDir, MasterKey: masterKey, MasterKeyVersion: "v1", AssetMaxBytes: 1 << 20, AllowPrivateProviderURLs: true}, studioStore)

	secret := "personal-provider-secret"
	body, _ := json.Marshal(map[string]any{
		"providerType": "newapi-compatible", "label": "My NewAPI", "enabled": true,
		"baseUrl": upstream.URL + "/v1", "apiKey": secret,
	})
	create := httptest.NewRequest(http.MethodPost, "/studio-api/provider-connections", bytes.NewReader(body))
	create.Header.Set("Authorization", "Bearer "+firstSession.Token)
	created := httptest.NewRecorder()
	server.ServeHTTP(created, create)
	if created.Code != http.StatusCreated || strings.Contains(created.Body.String(), secret) || strings.Contains(created.Body.String(), "ciphertext") {
		t.Fatalf("unsafe provider create response %d: %s", created.Code, created.Body.String())
	}
	var payload struct {
		Connection struct {
			ID string `json:"id"`
		} `json:"connection"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil || payload.Connection.ID == "" {
		t.Fatalf("decode provider response: %v %s", err, created.Body.String())
	}

	var persisted []byte
	_ = filepath.Walk(dataDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && info != nil && info.Name() == "provider-connections.json" {
			persisted, _ = os.ReadFile(path)
		}
		return nil
	})
	if len(persisted) == 0 || bytes.Contains(persisted, []byte(secret)) {
		t.Fatalf("provider secret was not encrypted at rest: %s", persisted)
	}

	listOther := httptest.NewRequest(http.MethodGet, "/studio-api/provider-connections", nil)
	listOther.Header.Set("Authorization", "Bearer "+secondSession.Token)
	otherResult := httptest.NewRecorder()
	server.ServeHTTP(otherResult, listOther)
	if otherResult.Code != http.StatusOK || strings.Contains(otherResult.Body.String(), payload.Connection.ID) {
		t.Fatalf("provider connection crossed user boundary: %d %s", otherResult.Code, otherResult.Body.String())
	}

	models := httptest.NewRequest(http.MethodGet, "/studio-api/provider-connections/"+payload.Connection.ID+"/models", nil)
	models.Header.Set("Authorization", "Bearer "+firstSession.Token)
	modelsResult := httptest.NewRecorder()
	server.ServeHTTP(modelsResult, models)
	if modelsResult.Code != http.StatusOK || !strings.Contains(modelsResult.Body.String(), "gpt-image-2") || !strings.Contains(modelsResult.Body.String(), `"adapter":"openai-images"`) {
		t.Fatalf("personal model sync failed: %d %s", modelsResult.Code, modelsResult.Body.String())
	}
	if upstreamToken != "Bearer "+secret || strings.Contains(modelsResult.Body.String(), secret) {
		t.Fatalf("personal model sync mishandled secret: upstream=%q body=%s", upstreamToken, modelsResult.Body.String())
	}

	job, _, err := studioStore.CreateJob(store.Public(first), map[string]any{"request": map[string]any{
		"id": "personal-plan", "mode": "image", "route": "generations", "providerId": payload.Connection.ID,
		"model": "gpt-image-2", "prompt": "A secure personal provider plan.",
	}}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	dispatch := httptest.NewRequest(http.MethodGet, "/studio-api/generation-jobs/"+job.ID+"/dispatch-plan", nil)
	dispatch.Header.Set("Authorization", "Bearer "+firstSession.Token)
	dispatchResult := httptest.NewRecorder()
	server.ServeHTTP(dispatchResult, dispatch)
	if dispatchResult.Code != http.StatusOK || !strings.Contains(dispatchResult.Body.String(), `"secretConfigured":true`) || strings.Contains(dispatchResult.Body.String(), secret) {
		t.Fatalf("personal dispatch plan failed or leaked secret: %d %s", dispatchResult.Code, dispatchResult.Body.String())
	}
}

func TestAssetUploadIsContentAddressedAndUserIsolated(t *testing.T) {
	dataDir := t.TempDir()
	studioStore := store.New(dataDir)
	first, _ := studioStore.CreateUser("first-asset@example.com", "change-me-now", "First", store.RoleCreator)
	second, _ := studioStore.CreateUser("second-asset@example.com", "change-me-now", "Second", store.RoleCreator)
	firstSession, _, _ := studioStore.Login(first.Email, "change-me-now")
	secondSession, _, _ := studioStore.Login(second.Email, "change-me-now")
	server := NewServer(config.Config{DataDir: dataDir, AssetMaxBytes: 1 << 20}, studioStore)

	imageBody := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte("small-test-image")...)
	var multipartBody bytes.Buffer
	writer := multipart.NewWriter(&multipartBody)
	part, err := writer.CreateFormFile("file", "sample.png")
	if err != nil {
		t.Fatalf("CreateFormFile failed: %v", err)
	}
	_, _ = part.Write(imageBody)
	_ = writer.Close()
	upload := httptest.NewRequest(http.MethodPost, "/studio-api/assets", &multipartBody)
	upload.Header.Set("Authorization", "Bearer "+firstSession.Token)
	upload.Header.Set("Content-Type", writer.FormDataContentType())
	uploadResult := httptest.NewRecorder()
	server.ServeHTTP(uploadResult, upload)
	if uploadResult.Code != http.StatusCreated {
		t.Fatalf("asset upload failed: %d %s", uploadResult.Code, uploadResult.Body.String())
	}
	var payload struct {
		Asset store.UserAsset `json:"asset"`
	}
	if err := json.Unmarshal(uploadResult.Body.Bytes(), &payload); err != nil || len(payload.Asset.Digest) != 64 {
		t.Fatalf("asset response invalid: %v %s", err, uploadResult.Body.String())
	}

	readOther := httptest.NewRequest(http.MethodGet, "/studio-api/assets/"+payload.Asset.Digest, nil)
	readOther.Header.Set("Authorization", "Bearer "+secondSession.Token)
	otherResult := httptest.NewRecorder()
	server.ServeHTTP(otherResult, readOther)
	if otherResult.Code != http.StatusNotFound {
		t.Fatalf("other user accessed asset: %d %s", otherResult.Code, otherResult.Body.String())
	}

	readOwner := httptest.NewRequest(http.MethodGet, "/studio-api/assets/"+payload.Asset.Digest, nil)
	readOwner.Header.Set("Authorization", "Bearer "+firstSession.Token)
	ownerResult := httptest.NewRecorder()
	server.ServeHTTP(ownerResult, readOwner)
	if ownerResult.Code != http.StatusOK || !bytes.Equal(ownerResult.Body.Bytes(), imageBody) {
		t.Fatalf("owner asset read failed: %d %q", ownerResult.Code, ownerResult.Body.Bytes())
	}
}

func TestExplicitGoImageExecutionPersistsBase64Result(t *testing.T) {
	imageBody := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, []byte("generated-image")...)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" || r.Header.Get("Authorization") != "Bearer execution-secret" {
			t.Fatalf("unexpected execution request: %s auth=%q", r.URL.Path, r.Header.Get("Authorization"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"b64_json": base64.StdEncoding.EncodeToString(imageBody)}}})
	}))
	defer upstream.Close()

	dataDir := t.TempDir()
	t.Setenv("STUDIO_EXECUTION_TEST_KEY", "execution-secret")
	studioStore := store.New(dataDir)
	user, _ := studioStore.CreateUser("execute@example.com", "change-me-now", "Execute", store.RoleCreator)
	session, _, _ := studioStore.Login(user.Email, "change-me-now")
	_, err := studioStore.UpsertProviderLink(store.ProviderLink{
		ID: "execution-provider", ProviderType: "openai-compatible", Label: "Execution",
		Enabled: true, BaseURL: upstream.URL + "/v1", SecretEnv: "STUDIO_EXECUTION_TEST_KEY",
		AllowedRoles: []string{store.RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink failed: %v", err)
	}
	job, _, err := studioStore.CreateJob(store.Public(user), map[string]any{"request": map[string]any{
		"id": "execute-job", "mode": "image", "route": "generations", "providerId": "execution-provider",
		"model": "gpt-image-2", "prompt": "A generated test image.",
	}}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	server := NewServer(config.Config{DataDir: dataDir, AssetMaxBytes: 1 << 20, ExecutionEnabled: true, ExecutionTimeoutSeconds: 10}, studioStore)
	execute := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/"+job.ID+"/execute", nil)
	execute.Header.Set("Authorization", "Bearer "+session.Token)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, execute)
	if result.Code != http.StatusOK || !strings.Contains(result.Body.String(), `"status":"completed"`) || !strings.Contains(result.Body.String(), "/studio-api/assets/") {
		t.Fatalf("execution failed: %d %s", result.Code, result.Body.String())
	}
	var payload struct {
		Job store.GenerationJob `json:"job"`
	}
	if err := json.Unmarshal(result.Body.Bytes(), &payload); err != nil || len(payload.Job.ResultURLs) != 1 {
		t.Fatalf("decode execution result: %v %s", err, result.Body.String())
	}
	read := httptest.NewRequest(http.MethodGet, payload.Job.ResultURLs[0], nil)
	read.Header.Set("Authorization", "Bearer "+session.Token)
	assetResult := httptest.NewRecorder()
	server.ServeHTTP(assetResult, read)
	if assetResult.Code != http.StatusOK || !bytes.Equal(assetResult.Body.Bytes(), imageBody) {
		t.Fatalf("generated asset was not persisted: %d %q", assetResult.Code, assetResult.Body.Bytes())
	}
}

func TestExplicitGoVideoExecutionRunsAsynchronouslyAndPersistsResult(t *testing.T) {
	videoBody := []byte("generated-video")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer execution-video-secret" || r.Header.Get("X-Client-Request-ID") != "execute-video-job" {
			t.Fatalf("unexpected video execution headers for %s", r.URL.Path)
		}
		switch r.URL.Path {
		case "/v1/videos/generations":
			_ = json.NewEncoder(w).Encode(map[string]any{"request_id": "video-task", "status": "queued"})
		case "/v1/videos/video-task":
			_ = json.NewEncoder(w).Encode(map[string]any{"request_id": "video-task", "status": "done"})
		case "/v1/videos/video-task/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write(videoBody)
		default:
			t.Fatalf("unexpected video request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer upstream.Close()

	dataDir := t.TempDir()
	t.Setenv("STUDIO_EXECUTION_VIDEO_TEST_KEY", "execution-video-secret")
	studioStore := store.New(dataDir)
	user, _ := studioStore.CreateUser("execute-video@example.com", "change-me-now", "Execute video", store.RoleCreator)
	session, _, _ := studioStore.Login(user.Email, "change-me-now")
	_, err := studioStore.UpsertProviderLink(store.ProviderLink{
		ID: "execution-video-provider", ProviderType: "xai-compatible", Label: "Execution video",
		Enabled: true, BaseURL: upstream.URL + "/v1", SecretEnv: "STUDIO_EXECUTION_VIDEO_TEST_KEY",
		AllowedRoles: []string{store.RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink failed: %v", err)
	}
	job, _, err := studioStore.CreateJob(store.Public(user), map[string]any{"request": map[string]any{
		"id": "execute-video-job", "mode": "video", "route": "video", "providerId": "execution-video-provider",
		"model": "grok-imagine-video-1.5", "prompt": "A generated test video.", "duration": float64(5),
	}}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	server := NewServer(config.Config{
		DataDir: dataDir, AssetMaxBytes: 1 << 20, ExecutionEnabled: true, ExecutionTimeoutSeconds: 10,
		VideoExecutionTimeoutSeconds: 10, VideoPollIntervalMS: 1, VideoPollMaxTransientFailures: 2,
	}, studioStore)
	execute := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/"+job.ID+"/execute", nil)
	execute.Header.Set("Authorization", "Bearer "+session.Token)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, execute)
	if result.Code != http.StatusAccepted || !strings.Contains(result.Body.String(), `"status":"upstream"`) {
		t.Fatalf("video execution did not start asynchronously: %d %s", result.Code, result.Body.String())
	}

	var completed store.GenerationJob
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		completed, _, err = studioStore.GetJob(store.Public(user), job.ID)
		if err == nil && completed.Status == store.JobStatusCompleted {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if completed.Status != store.JobStatusCompleted || len(completed.ResultURLs) != 1 {
		t.Fatalf("video execution did not complete: %#v err=%v", completed, err)
	}
	read := httptest.NewRequest(http.MethodGet, completed.ResultURLs[0], nil)
	read.Header.Set("Authorization", "Bearer "+session.Token)
	assetResult := httptest.NewRecorder()
	server.ServeHTTP(assetResult, read)
	if assetResult.Code != http.StatusOK || !bytes.Equal(assetResult.Body.Bytes(), videoBody) || assetResult.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("generated video was not persisted: %d %q %s", assetResult.Code, assetResult.Body.Bytes(), assetResult.Header().Get("Content-Type"))
	}
}

func TestGoImageExecutionIsDisabledByDefault(t *testing.T) {
	studioStore := store.New(t.TempDir())
	user, _ := studioStore.CreateUser("disabled-execute@example.com", "change-me-now", "Disabled", store.RoleCreator)
	session, _, _ := studioStore.Login(user.Email, "change-me-now")
	server := NewServer(config.Config{}, studioStore)
	request := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/job/execute", nil)
	request.Header.Set("Authorization", "Bearer "+session.Token)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)
	if result.Code != http.StatusServiceUnavailable || !strings.Contains(result.Body.String(), "GO_EXECUTION_DISABLED") {
		t.Fatalf("disabled executor response: %d %s", result.Code, result.Body.String())
	}
}

func TestGenerationJobDispatchPlanIsSanitized(t *testing.T) {
	t.Setenv("STUDIO_SHARED_NEWAPI_API_KEY", "server-only-secret")
	studioStore := store.New(t.TempDir())
	user, err := studioStore.CreateUser("creator@example.com", "change-me-now", "Creator", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	session, _, err := studioStore.Login("creator@example.com", "change-me-now")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	_, err = studioStore.UpsertProviderLink(store.ProviderLink{
		ID:           "newapi-shared",
		ProviderType: "newapi-compatible",
		Label:        "Shared NewAPI",
		Enabled:      true,
		BaseURL:      "https://newapi.example.com/v1",
		SecretEnv:    "STUDIO_SHARED_NEWAPI_API_KEY",
		AllowedRoles: []string{store.RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink failed: %v", err)
	}
	job, _, err := studioStore.CreateJob(store.Public(user), map[string]any{
		"request": map[string]any{
			"id":               "job-plan-1",
			"mode":             "image",
			"route":            "generations",
			"providerId":       "newapi-shared",
			"model":            "gpt-image-2",
			"generationPrompt": "A clean product image.",
			"size":             "1024x1024",
			"quality":          "medium",
			"n":                float64(1),
			"apiKey":           "must-not-persist",
		},
	}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}

	server := NewServer(config.Config{Version: "test"}, studioStore)
	req := httptest.NewRequest(http.MethodGet, "/studio-api/generation-jobs/"+job.ID+"/dispatch-plan", nil)
	req.Header.Set("Authorization", "Bearer "+session.Token)
	rec := httptest.NewRecorder()

	server.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !strings.Contains(body, "https://newapi.example.com/v1/images/generations") {
		t.Fatalf("dispatch plan used the wrong endpoint: %s", body)
	}
	if strings.Contains(body, "server-only-secret") || strings.Contains(body, "must-not-persist") {
		t.Fatalf("dispatch plan leaked a secret: %s", body)
	}
	if !strings.Contains(body, `"secretConfigured":true`) {
		t.Fatalf("dispatch plan did not report configured secret: %s", body)
	}
}

func TestGenerationJobContinuationPlan(t *testing.T) {
	studioStore := store.New(t.TempDir())
	user, err := studioStore.CreateUser("creator@example.com", "change-me-now", "Creator", store.RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	session, _, err := studioStore.Login("creator@example.com", "change-me-now")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	job, _, err := studioStore.CreateJob(store.Public(user), map[string]any{
		"request": map[string]any{
			"id":               "job-workflow-1",
			"mode":             "image",
			"route":            "generations",
			"providerId":       "newapi-shared",
			"model":            "gpt-image-2",
			"generationPrompt": "First image prompt: red bottle on marble, softbox lighting.",
		},
	}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	body := bytes.NewBufferString(`{"mode":"image","changePrompt":"Second image: keep the bottle, add condensation and darker background."}`)
	server := NewServer(config.Config{Version: "test"}, studioStore)
	req := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/"+job.ID+"/continuation-plan", body)
	req.Header.Set("Authorization", "Bearer "+session.Token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
	}
	response := rec.Body.String()
	if !strings.Contains(response, "Previous result prompt to inherit") || !strings.Contains(response, "condensation") {
		t.Fatalf("continuation plan did not inherit and apply change: %s", response)
	}
	if !strings.Contains(response, `"depth":2`) || !strings.Contains(response, `"workflow"`) {
		t.Fatalf("continuation plan did not return workflow metadata: %s", response)
	}
}
