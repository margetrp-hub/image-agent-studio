package provider

import (
	"strings"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func TestBuildImageGenerationPlan(t *testing.T) {
	for _, item := range []struct {
		name         string
		providerType string
		baseURL      string
	}{
		{name: "newapi", providerType: "newapi-compatible", baseURL: "https://newapi.example.com/v1/"},
		{name: "sub2api", providerType: "sub2api-compatible", baseURL: "https://sub2api.example.com/v1"},
	} {
		t.Run(item.name, func(t *testing.T) {
			plan, err := BuildImageGenerationPlan(store.ProviderLink{
				ID:           item.name + "-shared",
				ProviderType: item.providerType,
				BaseURL:      item.baseURL,
			}, store.GenerationJob{
				Mode:   "image",
				Route:  "generations",
				Model:  "gpt-image-2",
				Prompt: "Fallback prompt",
				Request: map[string]any{
					"generationPrompt": "Detailed prompt",
					"size":             "1024x1024",
					"quality":          "medium",
					"count":            float64(2),
				},
			}, true)
			if err != nil {
				t.Fatalf("BuildImageGenerationPlan failed: %v", err)
			}
			if plan.Endpoint != strings.TrimRight(item.baseURL, "/")+"/images/generations" {
				t.Fatalf("unexpected endpoint: %#v", plan)
			}
			if plan.Transport != "openai-compatible-images" || plan.Route != "generations" {
				t.Fatalf("unexpected route metadata: %#v", plan)
			}
			if plan.Body["model"] != "gpt-image-2" || plan.Body["prompt"] != "Detailed prompt" || plan.Body["n"] != 2 {
				t.Fatalf("unexpected plan body: %#v", plan.Body)
			}
			for _, value := range plan.Body {
				if text, ok := value.(string); ok && strings.Contains(text, "secret") {
					t.Fatalf("plan leaked secret-looking value: %#v", plan)
				}
			}
		})
	}
}

func TestBuildImageGenerationPlanRejectsUnsupportedRoute(t *testing.T) {
	_, err := BuildImageGenerationPlan(store.ProviderLink{
		ID:           "openai-shared",
		ProviderType: "openai-compatible",
		BaseURL:      "https://api.example.com/v1",
	}, store.GenerationJob{
		Mode:   "image",
		Route:  "responses",
		Model:  "gpt-image-2",
		Prompt: "hello",
	}, true)
	if err == nil || err.Error() != "GO_DISPATCH_ROUTE_NOT_SUPPORTED" {
		t.Fatalf("unexpected error: %v", err)
	}
}
