package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/providerconnections"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func TestPersonalProviderHTTPClientRejectsPrivateAddressesByDefault(t *testing.T) {
	for _, endpoint := range []string{
		"http://127.0.0.1/v1/models",
		"http://[::1]/v1/models",
		"http://100.64.0.1/v1/models",
		"http://169.254.169.254/latest/meta-data",
	} {
		if _, err := newPersonalProviderHTTPClient(context.Background(), endpoint, false); err == nil {
			t.Fatalf("expected private endpoint to be rejected: %s", endpoint)
		}
	}
}

func TestPersonalProviderHTTPClientPinsValidatedDNSAddresses(t *testing.T) {
	lookupCalls := 0
	lookup := func(context.Context, string) ([]net.IPAddr, error) {
		lookupCalls++
		return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
	}
	dialedAddress := ""
	dial := func(_ context.Context, _, address string) (net.Conn, error) {
		dialedAddress = address
		return nil, errors.New("stop after observing pinned target")
	}

	client, err := newPersonalProviderHTTPClientWithNetwork(
		context.Background(),
		"https://provider.example/v1/models",
		false,
		lookup,
		dial,
	)
	if err != nil {
		t.Fatalf("build client: %v", err)
	}
	transport := client.Transport.(*http.Transport)
	_, _ = transport.DialContext(context.Background(), "tcp", "provider.example:443")

	if lookupCalls != 1 {
		t.Fatalf("expected one DNS lookup before dialing, got %d", lookupCalls)
	}
	if dialedAddress != "93.184.216.34:443" {
		t.Fatalf("dial did not use validated address: %q", dialedAddress)
	}
}

func TestPersonalProviderHTTPClientRejectsMixedPublicPrivateDNS(t *testing.T) {
	lookup := func(context.Context, string) ([]net.IPAddr, error) {
		return []net.IPAddr{
			{IP: net.ParseIP("93.184.216.34")},
			{IP: net.ParseIP("127.0.0.1")},
		}, nil
	}
	dial := func(context.Context, string, string) (net.Conn, error) {
		return nil, errors.New("must not dial")
	}

	if _, err := newPersonalProviderHTTPClientWithNetwork(
		context.Background(),
		"https://provider.example/v1/models",
		false,
		lookup,
		dial,
	); err == nil {
		t.Fatal("expected mixed public/private DNS response to be rejected")
	}
}

func TestPersonalProviderModelSyncDoesNotFollowRedirects(t *testing.T) {
	targetCalled := false
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		targetCalled = true
	}))
	defer target.Close()

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer provider-secret" {
			t.Fatalf("initial request did not receive provider credential")
		}
		w.Header().Set("Location", target.URL+"/models")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer redirect.Close()

	client, err := newPersonalProviderHTTPClient(context.Background(), redirect.URL+"/models", true)
	if err != nil {
		t.Fatalf("private provider opt-in was not preserved: %v", err)
	}
	_, status, _, err := fetchProviderModels(context.Background(), redirect.URL+"/models", "provider-secret", client)
	if err == nil || status != http.StatusTemporaryRedirect {
		t.Fatalf("expected redirect response to remain upstream failure, status=%d err=%v", status, err)
	}
	if targetCalled {
		t.Fatal("provider credential was forwarded through redirect")
	}
}

func TestPersonalProviderImageExecutionPreservesPrivateURLPolicy(t *testing.T) {
	for _, test := range []struct {
		name         string
		allowPrivate bool
		wantStatus   int
		wantCalled   bool
		wantJob      string
	}{
		{name: "blocked by default", wantStatus: http.StatusBadRequest, wantJob: store.JobStatusQueued},
		{name: "explicitly allowed", allowPrivate: true, wantStatus: http.StatusOK, wantCalled: true, wantJob: store.JobStatusCompleted},
	} {
		t.Run(test.name, func(t *testing.T) {
			upstreamCalled := false
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				upstreamCalled = true
				if r.Header.Get("Authorization") != "Bearer execution-secret" {
					t.Fatalf("execution credential missing from initial request")
				}
				_, _ = w.Write([]byte(`{"data":[{"url":"https://cdn.example/result.png"}]}`))
			}))
			defer upstream.Close()

			server, studioStore, user, sessionToken, jobID := personalExecutionFixture(t, upstream.URL, test.allowPrivate)
			request := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/"+jobID+"/execute", nil)
			request.Header.Set("Authorization", "Bearer "+sessionToken)
			result := httptest.NewRecorder()
			server.ServeHTTP(result, request)

			if result.Code != test.wantStatus {
				t.Fatalf("unexpected execution status %d: %s", result.Code, result.Body.String())
			}
			if upstreamCalled != test.wantCalled {
				t.Fatalf("upstream called=%v, want %v", upstreamCalled, test.wantCalled)
			}
			job, found, err := studioStore.GetJob(user, jobID)
			if err != nil || !found || job.Status != test.wantJob {
				t.Fatalf("unexpected persisted job: found=%v err=%v job=%#v", found, err, job)
			}
		})
	}
}

func TestPersonalProviderImageExecutionDoesNotFollowRedirects(t *testing.T) {
	targetCalled := false
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		targetCalled = true
	}))
	defer target.Close()

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer execution-secret" {
			t.Fatalf("initial execution request did not receive provider credential")
		}
		w.Header().Set("Location", target.URL+"/v1/images/generations")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer redirect.Close()

	server, _, _, sessionToken, jobID := personalExecutionFixture(t, redirect.URL, true)
	request := httptest.NewRequest(http.MethodPost, "/studio-api/generation-jobs/"+jobID+"/execute", nil)
	request.Header.Set("Authorization", "Bearer "+sessionToken)
	result := httptest.NewRecorder()
	server.ServeHTTP(result, request)

	if result.Code != http.StatusBadGateway || !strings.Contains(result.Body.String(), "EXECUTOR_UPSTREAM_STATUS") {
		t.Fatalf("unexpected redirect execution response %d: %s", result.Code, result.Body.String())
	}
	if targetCalled {
		t.Fatal("provider credential was forwarded through execution redirect")
	}
}

func personalExecutionFixture(t *testing.T, baseURL string, allowPrivate bool) (*Server, *store.Store, store.PublicUser, string, string) {
	t.Helper()
	dataDir := t.TempDir()
	studioStore := store.New(dataDir)
	createdUser, err := studioStore.CreateUser("personal-execute@example.com", "change-me-now", "Execute", store.RoleCreator)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	user := store.Public(createdUser)
	session, _, err := studioStore.Login(createdUser.Email, "change-me-now")
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	masterKey := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x42}, 32))
	server := NewServer(config.Config{
		DataDir:                  dataDir,
		MasterKey:                masterKey,
		MasterKeyVersion:         "v1",
		AssetMaxBytes:            1 << 20,
		ExecutionEnabled:         true,
		ExecutionTimeoutSeconds:  10,
		AllowPrivateProviderURLs: allowPrivate,
	}, studioStore)
	apiKey := "execution-secret"
	connection, err := server.connectionFromInput(user, providerconnections.Input{
		ProviderType: "openai-compatible",
		Label:        "Personal execution",
		Enabled:      true,
		BaseURL:      baseURL + "/v1",
		APIKey:       &apiKey,
	}, providerconnections.Connection{})
	if err != nil {
		t.Fatalf("prepare provider connection: %v", err)
	}
	connection, err = studioStore.CreateProviderConnection(user, connection)
	if err != nil {
		t.Fatalf("create provider connection: %v", err)
	}
	job, _, err := studioStore.CreateJob(user, map[string]any{"request": map[string]any{
		"id": "personal-execute-job", "mode": "image", "route": "generations", "providerId": connection.ID,
		"model": "gpt-image-2", "prompt": "A protected personal provider request.",
	}}, 10)
	if err != nil {
		t.Fatalf("create generation job: %v", err)
	}
	return server, studioStore, user, session.Token, job.ID
}

func TestPinnedProviderDialerRejectsChangedTarget(t *testing.T) {
	target, addresses, err := resolvePersonalProviderTarget(
		context.Background(),
		"https://provider.example/v1/models",
		false,
		func(context.Context, string) ([]net.IPAddr, error) {
			return []net.IPAddr{{IP: net.ParseIP("93.184.216.34")}}, nil
		},
	)
	if err != nil {
		t.Fatalf("resolve target: %v", err)
	}
	dial := pinnedProviderDialer(target, addresses, func(context.Context, string, string) (net.Conn, error) {
		return nil, errors.New("unexpected dial")
	})

	_, err = dial(context.Background(), "tcp", "other.example:443")
	if err == nil || !strings.Contains(err.Error(), "target changed") {
		t.Fatalf("changed target was not rejected: %v", err)
	}
}
