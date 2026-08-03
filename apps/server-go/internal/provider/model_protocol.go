package provider

import "strings"

const (
	AdapterOpenAIImages    = "openai-images"
	AdapterOpenAIChatImage = "openai-chat-images"
	AdapterXAIImages       = "xai-images"
	AdapterOpenAIVideos    = "openai-videos"
	AdapterXAIVideos       = "xai-videos"
	AdapterNewAPITaskVideo = "newapi-task-video"
)

type InvocationDecision struct {
	Status  string `json:"status"`
	Adapter string `json:"adapter,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

// AnnotateModels keeps discovery separate from executable protocol support.
// A model returned by /models is selectable only when its mode is verified.
func AnnotateModels(providerType string, models []map[string]any) []map[string]any {
	annotated := make([]map[string]any, 0, len(models))
	for _, source := range models {
		model := make(map[string]any, len(source)+2)
		for key, value := range source {
			model[key] = value
		}
		id, _ := model["id"].(string)
		model["discoveryStatus"] = "discovered"
		model["invocations"] = map[string]InvocationDecision{
			"image": ResolveInvocation(providerType, id, "image", model),
			"video": ResolveInvocation(providerType, id, "video", model),
		}
		annotated = append(annotated, model)
	}
	return annotated
}

func ResolveInvocation(providerType, modelID, mode string, _ map[string]any) InvocationDecision {
	providerType = strings.ToLower(strings.TrimSpace(providerType))
	model := strings.ToLower(strings.TrimSpace(modelID))
	mode = strings.ToLower(strings.TrimSpace(mode))
	if model == "" {
		return unsupportedInvocation("Model id is empty")
	}

	switch mode {
	case "image":
		if providerType == "xai-compatible" && isXAIImageModel(model) {
			return verifiedInvocation(AdapterXAIImages)
		}
		if providerType == "newapi-compatible" && isChatImageModel(model) {
			return verifiedInvocation(AdapterOpenAIChatImage)
		}
		if supportsOpenAIImageRoute(providerType) && isDirectImageModel(model) {
			return verifiedInvocation(AdapterOpenAIImages)
		}
	case "video":
		if providerType == "xai-compatible" && isXAIVideoModel(model) {
			return verifiedInvocation(AdapterXAIVideos)
		}
		if supportsOpenAIVideoRoute(providerType) && isSoraModel(model) {
			return verifiedInvocation(AdapterOpenAIVideos)
		}
		if supportsNewAPITaskRoute(providerType) && isTaskVideoModel(model) {
			return verifiedInvocation(AdapterNewAPITaskVideo)
		}
	default:
		return unsupportedInvocation("Unknown generation mode")
	}

	return unsupportedInvocation("No verified invocation adapter for this provider and model")
}

func verifiedInvocation(adapter string) InvocationDecision {
	return InvocationDecision{Status: "verified", Adapter: adapter}
}

func unsupportedInvocation(reason string) InvocationDecision {
	return InvocationDecision{Status: "unsupported", Reason: reason}
}

func supportsOpenAIImageRoute(providerType string) bool {
	switch providerType {
	case "openai-compatible", "newapi-compatible", "sub2api-compatible":
		return true
	default:
		return false
	}
}

func supportsOpenAIVideoRoute(providerType string) bool {
	switch providerType {
	case "openai-compatible", "newapi-compatible", "sub2api-compatible":
		return true
	default:
		return false
	}
}

func supportsNewAPITaskRoute(providerType string) bool {
	return providerType == "newapi-compatible" || providerType == "sub2api-compatible"
}

func isDirectImageModel(model string) bool {
  return containsAny(model,
		"gpt-image", "dall-e", "dall_e", "grok-imagine-image", "imagen-",
		"seedream", "flux", "ideogram", "recraft", "stable-diffusion", "stable_diffusion",
		"sdxl", "sd3", "doubao-image", "doubao_image", "qwen-image", "qwen_image",
		"cogview", "kolors", "hunyuan-image", "hunyuan_image",
	) || isJimengImageModel(model)
}

func isChatImageModel(model string) bool {
	return strings.Contains(model, "nano-banana") || strings.Contains(model, "nano_banana") ||
		(strings.Contains(model, "gemini") && strings.Contains(model, "image"))
}

func isXAIImageModel(model string) bool {
	return strings.Contains(model, "grok") && strings.Contains(model, "image")
}

func isXAIVideoModel(model string) bool {
	return strings.Contains(model, "grok") && strings.Contains(model, "video")
}

func isSoraModel(model string) bool {
	return strings.Contains(model, "sora")
}

func isTaskVideoModel(model string) bool {
	return containsAny(model,
		"veo", "kling", "seedance", "vidu", "hailuo", "hunyuan-video", "hunyuan_video",
		"pixverse", "pika", "runway", "dreamina",
	) || isJimengVideoModel(model) ||
		((strings.Contains(model, "wan") || strings.Contains(model, "minimax") || strings.Contains(model, "luma")) && hasVideoMarker(model))
}

func isJimengImageModel(model string) bool {
	return strings.Contains(model, "jimeng") && !hasVideoMarker(model) &&
		containsAny(model, "high_aes", "image", "imagegen")
}

func isJimengVideoModel(model string) bool {
	return strings.Contains(model, "jimeng") && (hasVideoMarker(model) || strings.Contains(model, "v30"))
}

func hasVideoMarker(model string) bool {
	return containsAny(model, "video", "t2v", "i2v", "ti2v", "vgfm")
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}
