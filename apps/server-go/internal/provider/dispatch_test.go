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
			if plan.Transport != AdapterOpenAIImages || plan.InvocationAdapter != AdapterOpenAIImages || plan.Route != "generations" {
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

func TestBuildImageGenerationPlanForXAIOmitsUnsupportedParameters(t *testing.T) {
	plan, err := BuildImageGenerationPlan(store.ProviderLink{
		ID:           "xai-shared",
		ProviderType: "xai-compatible",
		BaseURL:      "https://fast.example/v1",
	}, store.GenerationJob{
		Mode:   "image",
		Route:  "generations",
		Model:  "grok-imagine-image",
		Prompt: "A clean product shot",
		Request: map[string]any{
			"size":    "1536x1024",
			"quality": "high",
			"n":       float64(4),
		},
	}, true)
	if err != nil {
		t.Fatalf("BuildImageGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://fast.example/v1/images/generations" {
		t.Fatalf("unexpected endpoint: %#v", plan)
	}
	if plan.Body["model"] != "grok-imagine-image" || plan.Body["prompt"] != "A clean product shot" || plan.Body["n"] != 4 {
		t.Fatalf("unexpected xAI plan body: %#v", plan.Body)
	}
	if _, ok := plan.Body["size"]; ok {
		t.Fatalf("xAI plan must omit size: %#v", plan.Body)
	}
	if _, ok := plan.Body["quality"]; ok {
		t.Fatalf("xAI plan must omit quality: %#v", plan.Body)
	}
	if plan.Transport != AdapterXAIImages || plan.Body["response_format"] != "b64_json" || plan.Body["aspect_ratio"] != "3:2" {
		t.Fatalf("xAI plan must use the official image protocol: %#v", plan)
	}
}

func TestBuildImageGenerationPlanForNewAPIChatImage(t *testing.T) {
	plan, err := BuildImageGenerationPlan(store.ProviderLink{
		ID: "newapi", ProviderType: "newapi-compatible", BaseURL: "https://newapi.example/v1",
	}, store.GenerationJob{
		Mode: "image", Route: "generations", Model: "nano-banana-pro-preview", Prompt: "Draw a cat",
		Request: map[string]any{"size": "1536x1024"},
	}, true)
	if err != nil {
		t.Fatalf("BuildImageGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://newapi.example/v1/chat/completions" || plan.Transport != AdapterOpenAIChatImage {
		t.Fatalf("unexpected chat-image plan: %#v", plan)
	}
	messages, ok := plan.Body["messages"].([]map[string]any)
	if !ok || len(messages) != 1 || messages[0]["content"] != "Draw a cat" {
		t.Fatalf("unexpected chat-image body: %#v", plan.Body)
	}
}

func TestBuildVideoGenerationPlanForXAI(t *testing.T) {
	plan, err := BuildGenerationPlan(store.ProviderLink{
		ID: "xai-video", ProviderType: "xai-compatible", BaseURL: "https://fast.example/v1/",
	}, store.GenerationJob{
		Mode: "video", Route: "video", Model: "grok-imagine-video", Prompt: "A slow camera orbit",
		Request: map[string]any{"duration": float64(8), "aspectRatio": "16:9", "width": float64(1280), "height": float64(720)},
	}, true)
	if err != nil {
		t.Fatalf("BuildGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://fast.example/v1/videos/generations" || plan.RetrieveEndpoint != "https://fast.example/v1/videos/{id}" || plan.ContentEndpoint != "https://fast.example/v1/videos/{id}/content" {
		t.Fatalf("unexpected xAI video endpoints: %#v", plan)
	}
	if plan.Transport != AdapterXAIVideos || plan.Body["duration"] != 8 || plan.Body["aspect_ratio"] != "16:9" || plan.Body["resolution"] != "720p" {
		t.Fatalf("unexpected xAI video plan: %#v", plan)
	}
}

func TestBuildVideoGenerationPlanForTaskProvider(t *testing.T) {
	plan, err := BuildGenerationPlan(store.ProviderLink{
		ID: "newapi-video", ProviderType: "newapi-compatible", BaseURL: "https://newapi.example/v1",
	}, store.GenerationJob{
		Mode: "video", Route: "video", Model: "veo-3.1-generate-preview", Prompt: "Product reveal",
		Request: map[string]any{
			"duration": float64(5), "width": float64(1280), "height": float64(720), "fps": float64(24),
			"aspectRatio": "16:9", "motion": "orbit", "videoStyle": "product_ad", "videoQuality": "high",
		},
	}, true)
	if err != nil {
		t.Fatalf("BuildGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://newapi.example/v1/video/generations" || plan.RetrieveEndpoint != "https://newapi.example/v1/video/generations/{id}" || plan.Transport != AdapterNewAPITaskVideo {
		t.Fatalf("unexpected task video plan: %#v", plan)
	}
	metadata, _ := plan.Body["metadata"].(map[string]any)
	if plan.Body["width"] != 1280 || plan.Body["height"] != 720 || plan.Body["size"] != "1280x720" || plan.Body["fps"] != 24 || metadata["camera_motion"] != "orbit" {
		t.Fatalf("unexpected task video body: %#v", plan.Body)
	}
}

func TestBuildVideoGenerationPlanForOpenAICompatible(t *testing.T) {
	plan, err := BuildGenerationPlan(store.ProviderLink{
		ID: "openai", ProviderType: "openai-compatible", BaseURL: "https://api.example/v1",
	}, store.GenerationJob{Mode: "video", Route: "video", Model: "sora-2", Prompt: "hello", Request: map[string]any{
		"duration": float64(8), "width": float64(1280), "height": float64(720),
	}}, true)
	if err != nil {
		t.Fatalf("BuildGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://api.example/v1/videos" || plan.Transport != AdapterOpenAIVideos || plan.Body["seconds"] != 8 || plan.Body["size"] != "1280x720" {
		t.Fatalf("unexpected OpenAI video plan: %#v", plan)
	}
}

func TestBuildVideoGenerationPlanRoutesNewAPISoraToOpenAIVideos(t *testing.T) {
	plan, err := BuildGenerationPlan(store.ProviderLink{
		ID: "newapi", ProviderType: "newapi-compatible", BaseURL: "https://newapi.example/v1",
	}, store.GenerationJob{
		Mode: "video", Route: "video", Model: "sora-2", Prompt: "hello",
		Request: map[string]any{"duration": float64(4), "width": float64(720), "height": float64(1280)},
	}, true)
	if err != nil {
		t.Fatalf("BuildGenerationPlan failed: %v", err)
	}
	if plan.Endpoint != "https://newapi.example/v1/videos" || plan.Transport != AdapterOpenAIVideos || plan.Body["seconds"] != 4 || plan.Body["size"] != "720x1280" {
		t.Fatalf("unexpected NewAPI Sora plan: %#v", plan)
	}
}

func TestBuildGenerationPlanRejectsDiscoveredButUnverifiedModel(t *testing.T) {
	_, err := BuildGenerationPlan(store.ProviderLink{
		ID: "openai", ProviderType: "openai-compatible", BaseURL: "https://api.example/v1",
	}, store.GenerationJob{Mode: "video", Route: "video", Model: "veo-3.1", Prompt: "hello"}, true)
	if err == nil || err.Error() != "MODEL_INVOCATION_NOT_VERIFIED" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildGenerationPlanRejectsProtocolSpecificInvalidParameters(t *testing.T) {
	cases := []struct {
		name string
		link store.ProviderLink
		job  store.GenerationJob
		want string
	}{
		{
			name: "Sora duration",
			link: store.ProviderLink{ProviderType: "openai-compatible", BaseURL: "https://api.example/v1"},
			job: store.GenerationJob{Mode: "video", Route: "video", Model: "sora-2", Prompt: "hello", Request: map[string]any{
				"duration": float64(5), "width": float64(1280), "height": float64(720),
			}},
			want: "VIDEO_DURATION_NOT_SUPPORTED",
		},
		{
			name: "xAI duration",
			link: store.ProviderLink{ProviderType: "xai-compatible", BaseURL: "https://api.example/v1"},
			job: store.GenerationJob{Mode: "video", Route: "video", Model: "grok-imagine-video", Prompt: "hello", Request: map[string]any{
				"duration": float64(16),
			}},
			want: "VIDEO_DURATION_NOT_SUPPORTED",
		},
		{
			name: "DALL-E count",
			link: store.ProviderLink{ProviderType: "openai-compatible", BaseURL: "https://api.example/v1"},
			job: store.GenerationJob{Mode: "image", Route: "generations", Model: "dall-e-3", Prompt: "hello", Request: map[string]any{
				"n": float64(2), "size": "1024x1024", "quality": "standard",
			}},
			want: "IMAGE_COUNT_NOT_SUPPORTED",
		},
		{
			name: "GPT Image size",
			link: store.ProviderLink{ProviderType: "openai-compatible", BaseURL: "https://api.example/v1"},
			job: store.GenerationJob{Mode: "image", Route: "generations", Model: "gpt-image-2", Prompt: "hello", Request: map[string]any{
				"n": float64(1), "size": "1792x1024", "quality": "high",
			}},
			want: "IMAGE_SIZE_NOT_SUPPORTED",
		},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := BuildGenerationPlan(item.link, item.job, true)
			if err == nil || err.Error() != item.want {
				t.Fatalf("expected %s, got %v", item.want, err)
			}
		})
	}
}

func TestBuildOpenAIVideoRejectsReferenceUntilMultipartAssetUploadExists(t *testing.T) {
	_, err := BuildGenerationPlan(store.ProviderLink{
		ProviderType: "openai-compatible", BaseURL: "https://api.example/v1",
	}, store.GenerationJob{
		Mode: "video", Route: "video", Model: "sora-2", Prompt: "hello",
		Request: map[string]any{"duration": float64(4), "image": "data:image/png;base64,aW1hZ2U="},
	}, true)
	if err == nil || err.Error() != "OPENAI_VIDEO_REFERENCE_UPLOAD_NOT_SUPPORTED" {
		t.Fatalf("unexpected error: %v", err)
	}
}
