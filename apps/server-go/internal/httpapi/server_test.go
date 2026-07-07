package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

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
