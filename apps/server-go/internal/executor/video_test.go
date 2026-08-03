package executor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
)

func TestExecuteVideoPollsPersistsAffinityAndDownloadsProtectedContent(t *testing.T) {
	const requestID = "job-video-affinity"
	videoBody := []byte("test-mp4-body")
	var mu sync.Mutex
	polls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer video-secret" || r.Header.Get("X-Client-Request-ID") != requestID {
			t.Fatalf("missing execution headers for %s", r.URL.Path)
		}
		switch r.URL.Path {
		case "/v1/videos/generations":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "video-task", "status": "queued"})
		case "/v1/videos/video-task":
			mu.Lock()
			polls++
			current := polls
			mu.Unlock()
			if current == 1 {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"not ready"}`))
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "video-task", "status": "done"})
		case "/v1/videos/video-task/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write(videoBody)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	result, err := ExecuteVideo(context.Background(), provider.DispatchPlan{
		ProviderID: "xai", ProviderType: "xai-compatible", Method: http.MethodPost,
		Endpoint: server.URL + "/v1/videos/generations", RetrieveEndpoint: server.URL + "/v1/videos/{id}",
		ContentEndpoint: server.URL + "/v1/videos/{id}/content", Route: "video", Transport: "xai-videos",
		SecretConfigured: true, Body: map[string]any{"model": "video-model", "prompt": "test"},
	}, "video-secret", server.Client(), VideoOptions{
		ClientRequestID: requestID, PollInterval: time.Millisecond, MaxTransientRetries: 2,
	})
	if err != nil {
		t.Fatalf("ExecuteVideo failed: %v", err)
	}
	if string(result.Body) != string(videoBody) || result.MediaType != "video/mp4" || result.TaskID != "video-task" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteVideoHonorsCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "video-task", "status": "queued"})
	}))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ExecuteVideo(ctx, provider.DispatchPlan{
		Method: http.MethodPost, Endpoint: server.URL + "/v1/video/generations",
		RetrieveEndpoint: server.URL + "/v1/video/generations/{id}", Route: "video", Transport: provider.AdapterNewAPITaskVideo,
		SecretConfigured: true, Body: map[string]any{"model": "video-model", "prompt": "test"},
	}, "video-secret", server.Client(), VideoOptions{PollInterval: time.Millisecond})
	requireExecutionError(t, err, "EXECUTOR_CONTEXT_CANCELED")
}

func TestExecuteOpenAIVideoUsesMultipartCreate(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/videos":
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Fatalf("expected multipart request: %v", err)
			}
			if r.FormValue("model") != "sora-2" || r.FormValue("seconds") != "8" || r.FormValue("size") != "1280x720" {
				t.Fatalf("unexpected multipart fields: %#v", r.Form)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "openai-video", "status": "completed"})
		case "/v1/videos/openai-video/content":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("openai-video-body"))
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	result, err := ExecuteVideo(context.Background(), provider.DispatchPlan{
		Method: http.MethodPost, Endpoint: server.URL + "/v1/videos", RetrieveEndpoint: server.URL + "/v1/videos/{id}",
		ContentEndpoint: server.URL + "/v1/videos/{id}/content", Route: "video", Transport: "openai-videos",
		SecretConfigured: true, Body: map[string]any{"model": "sora-2", "prompt": "test", "seconds": 8, "size": "1280x720"},
	}, "video-secret", server.Client(), VideoOptions{ClientRequestID: "openai-job"})
	if err != nil || string(result.Body) != "openai-video-body" {
		t.Fatalf("ExecuteVideo failed: result=%#v err=%v", result, err)
	}
}
