package provider

import "testing"

func TestAnnotateModelsSeparatesDiscoveryFromInvocation(t *testing.T) {
	models := AnnotateModels("newapi-compatible", []map[string]any{
		{"id": "nano-banana-pro-preview"},
		{"id": "jimeng_high_aes_general_v21_L"},
		{"id": "jimeng_vgfm_t2v_l20"},
		{"id": "sora-2"},
		{"id": "unknown-model"},
	})

	assertInvocation(t, models[0], "image", "verified", AdapterOpenAIChatImage)
	assertInvocation(t, models[0], "video", "unsupported", "")
	assertInvocation(t, models[1], "image", "verified", AdapterOpenAIImages)
	assertInvocation(t, models[1], "video", "unsupported", "")
	assertInvocation(t, models[2], "image", "unsupported", "")
	assertInvocation(t, models[2], "video", "verified", AdapterNewAPITaskVideo)
	assertInvocation(t, models[3], "video", "verified", AdapterOpenAIVideos)
	assertInvocation(t, models[4], "image", "unsupported", "")
	if models[4]["discoveryStatus"] != "discovered" {
		t.Fatalf("unknown model must remain discovered: %#v", models[4])
	}
}

func TestResolveInvocationUsesProviderAndModelProtocol(t *testing.T) {
	for _, item := range []struct {
		provider string
		model    string
		mode     string
		adapter  string
	}{
		{provider: "openai-compatible", model: "gpt-image-2", mode: "image", adapter: AdapterOpenAIImages},
		{provider: "xai-compatible", model: "grok-imagine-image", mode: "image", adapter: AdapterXAIImages},
		{provider: "xai-compatible", model: "grok-imagine-video", mode: "video", adapter: AdapterXAIVideos},
		{provider: "newapi-compatible", model: "veo-3.1-generate-preview", mode: "video", adapter: AdapterNewAPITaskVideo},
		{provider: "newapi-compatible", model: "sora-2", mode: "video", adapter: AdapterOpenAIVideos},
	} {
		decision := ResolveInvocation(item.provider, item.model, item.mode, nil)
		if decision.Status != "verified" || decision.Adapter != item.adapter {
			t.Fatalf("unexpected decision for %#v: %#v", item, decision)
		}
	}
}

func TestResolveInvocationRejectsUnverifiedCombination(t *testing.T) {
	decision := ResolveInvocation("openai-compatible", "veo-3.1-generate-preview", "video", nil)
	if decision.Status != "unsupported" || decision.Adapter != "" {
		t.Fatalf("unexpected decision: %#v", decision)
	}
}

func assertInvocation(t *testing.T, model map[string]any, mode, status, adapter string) {
	t.Helper()
	invocations, ok := model["invocations"].(map[string]InvocationDecision)
	if !ok {
		t.Fatalf("missing invocations: %#v", model)
	}
	decision := invocations[mode]
	if decision.Status != status || decision.Adapter != adapter {
		t.Fatalf("unexpected %s invocation: %#v", mode, decision)
	}
}
