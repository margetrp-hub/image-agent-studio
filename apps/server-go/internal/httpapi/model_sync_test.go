package httpapi

import (
	"net/http"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func TestSetProviderAuthHeadersAddsGeminiAPIKey(t *testing.T) {
	for _, item := range []struct {
		providerType string
		wantGemini   bool
	}{
		{providerType: "gemini-compatible", wantGemini: true},
		{providerType: "openai-compatible", wantGemini: false},
	} {
		headers := make(http.Header)
		setProviderAuthHeaders(headers, item.providerType, "test-key")
		if got := headers.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("Authorization = %q, want Bearer test-key", got)
		}
		if got := headers.Get("X-Goog-Api-Key"); (got == "test-key") != item.wantGemini {
			t.Fatalf("X-Goog-Api-Key = %q, wantGemini=%v", got, item.wantGemini)
		}
	}
}

func TestProviderModelsEndpointUsesGeminiNativeRoute(t *testing.T) {
	for _, item := range []struct {
		base string
		want string
	}{
		{base: "https://fast.example", want: "https://fast.example/v1beta/models"},
		{base: "https://fast.example/v1", want: "https://fast.example/v1beta/models"},
		{base: "https://fast.example/v1beta", want: "https://fast.example/v1beta/models"},
	} {
		got := providerModelsEndpoint(store.ProviderLink{ProviderType: "gemini-compatible", BaseURL: item.base})
		if got != item.want {
			t.Fatalf("providerModelsEndpoint(%q) = %q, want %q", item.base, got, item.want)
		}
	}
}

func TestParseProviderModelsAcceptsGeminiNativePayload(t *testing.T) {
	models, err := parseProviderModels([]byte(`{"models":[{"name":"models/gemini-3.1-flash-image","supportedGenerationMethods":["generateContent"]}]}`))
	if err != nil {
		t.Fatalf("parseProviderModels failed: %v", err)
	}
	if len(models) != 1 || models[0]["id"] != "gemini-3.1-flash-image" {
		t.Fatalf("unexpected native Gemini models: %#v", models)
	}
	if _, ok := models[0]["supportedGenerationMethods"]; !ok {
		t.Fatalf("native Gemini metadata was dropped: %#v", models[0])
	}
}
