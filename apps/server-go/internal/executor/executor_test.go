package executor

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
)

func TestExecuteReturnsURLImages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/images/generations" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer server-secret" {
			t.Fatalf("unexpected authorization header")
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("unexpected content type: %s", r.Header.Get("Content-Type"))
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if body["model"] != "gpt-image-2" || body["prompt"] != "A lighthouse" {
			t.Fatalf("unexpected request body: %#v", body)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []map[string]string{{"url": "https://cdn.example/image.png"}}})
	}))
	defer server.Close()

	result, err := Execute(context.Background(), allowedPlan(server.URL), "server-secret", server.Client())
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].URL != "https://cdn.example/image.png" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteReturnsBase64Images(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aW1hZ2U="}]}`))
	}))
	defer server.Close()

	result, err := Execute(context.Background(), allowedPlan(server.URL), "server-secret", server.Client())
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].B64JSON != "aW1hZ2U=" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteParsesChatImageMarkdown(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected request path: %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]any{
				"content": "Generated image:\n![image](data:image/png;base64,aW1hZ2U=)",
			}}},
		})
	}))
	defer server.Close()

	plan := allowedPlan(server.URL)
	plan.Endpoint = server.URL + "/v1/chat/completions"
	plan.Transport = provider.AdapterOpenAIChatImage
	plan.InvocationAdapter = provider.AdapterOpenAIChatImage
	result, err := Execute(context.Background(), plan, "server-secret", server.Client())
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}
	if len(result.Images) != 1 || result.Images[0].B64JSON != "aW1hZ2U=" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteReturnsSafeUpstreamError(t *testing.T) {
	const token = "server-secret-never-log"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"denied server-secret-never-log"}` + strings.Repeat("x", maxErrorBodyBytes)))
	}))
	defer server.Close()

	_, err := Execute(context.Background(), allowedPlan(server.URL), token, server.Client())
	executionError := requireExecutionError(t, err, "EXECUTOR_UPSTREAM_STATUS")
	if executionError.UpstreamStatus != http.StatusForbidden {
		t.Fatalf("unexpected upstream status: %d", executionError.UpstreamStatus)
	}
	if strings.Contains(executionError.UpstreamBody, token) || strings.Contains(err.Error(), token) {
		t.Fatalf("error leaked bearer token: %#v", executionError)
	}
	if len(executionError.UpstreamBody) > maxErrorBodyBytes {
		t.Fatalf("upstream body was not truncated: %d", len(executionError.UpstreamBody))
	}
}

func TestExecuteRejectsOversizedResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"`))
		_, _ = w.Write([]byte(strings.Repeat("a", maxResponseBytes)))
		_, _ = w.Write([]byte(`"}]}`))
	}))
	defer server.Close()

	_, err := Execute(context.Background(), allowedPlan(server.URL), "server-secret", server.Client())
	requireExecutionError(t, err, "EXECUTOR_UPSTREAM_RESPONSE_TOO_LARGE")
}

func TestExecuteHonorsContextCancellation(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer func() {
		close(release)
		server.Close()
	}()

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		_, err := Execute(ctx, allowedPlan(server.URL), "server-secret", server.Client())
		done <- err
	}()
	<-started
	cancel()

	select {
	case err := <-done:
		requireExecutionError(t, err, "EXECUTOR_CONTEXT_CANCELED")
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation cause was not preserved: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Execute did not return after context cancellation")
	}
}

func TestExecuteNeverLeaksTokenFromTransportError(t *testing.T) {
	const token = "server-secret-never-log"
	client := &http.Client{Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("transport failed")
	})}

	_, err := Execute(context.Background(), allowedPlan("https://upstream.example"), token, client)
	requireExecutionError(t, err, "EXECUTOR_UPSTREAM_REQUEST_FAILED")
	if strings.Contains(err.Error(), token) {
		t.Fatalf("error leaked bearer token: %v", err)
	}
}

func TestExecuteRejectsUnmarkedPlan(t *testing.T) {
	for _, mutate := range []func(*provider.DispatchPlan){
		func(plan *provider.DispatchPlan) { plan.Method = http.MethodGet },
		func(plan *provider.DispatchPlan) { plan.Transport = "custom" },
		func(plan *provider.DispatchPlan) { plan.Route = "responses" },
		func(plan *provider.DispatchPlan) { plan.Endpoint = "https://upstream.example/v1/responses" },
	} {
		plan := allowedPlan("https://upstream.example")
		mutate(&plan)
		_, err := Execute(context.Background(), plan, "server-secret", http.DefaultClient)
		requireExecutionError(t, err, "EXECUTOR_PLAN_NOT_ALLOWED")
	}
}

func TestExecuteDoesNotFollowRedirects(t *testing.T) {
	redirectTargetCalled := false
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		redirectTargetCalled = true
	}))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", target.URL+"/images/generations")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer server.Close()

	_, err := Execute(context.Background(), allowedPlan(server.URL), "server-secret", server.Client())
	executionError := requireExecutionError(t, err, "EXECUTOR_UPSTREAM_STATUS")
	if executionError.UpstreamStatus != http.StatusTemporaryRedirect {
		t.Fatalf("unexpected redirect status: %d", executionError.UpstreamStatus)
	}
	if redirectTargetCalled {
		t.Fatal("executor followed an upstream redirect")
	}
}

func allowedPlan(baseURL string) provider.DispatchPlan {
	return provider.DispatchPlan{
		ProviderID:        "provider-1",
		ProviderType:      "openai-compatible",
		Method:            http.MethodPost,
		Endpoint:          baseURL + "/v1/images/generations",
		Route:             "generations",
		Transport:         provider.AdapterOpenAIImages,
		InvocationAdapter: provider.AdapterOpenAIImages,
		SecretConfigured:  true,
		Body: map[string]any{
			"model":  "gpt-image-2",
			"prompt": "A lighthouse",
		},
	}
}

func requireExecutionError(t *testing.T, err error, code string) *Error {
	t.Helper()
	if err == nil {
		t.Fatalf("expected %s", code)
	}
	var executionError *Error
	if !errors.As(err, &executionError) {
		t.Fatalf("expected *Error, got %T: %v", err, err)
	}
	if executionError.Code != code {
		t.Fatalf("expected %s, got %#v", code, executionError)
	}
	return executionError
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (fn roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}
