package provider

import (
	"errors"
	"fmt"
	"strings"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

type DispatchPlan struct {
	ProviderID        string         `json:"providerId"`
	ProviderType      string         `json:"providerType"`
	Method            string         `json:"method"`
	Endpoint          string         `json:"endpoint"`
	Route             string         `json:"route"`
	Transport         string         `json:"transport"`
	InvocationAdapter string         `json:"invocationAdapter"`
	SecretConfigured  bool           `json:"secretConfigured"`
	Body              map[string]any `json:"body"`
	RetrieveEndpoint  string         `json:"retrieveEndpoint,omitempty"`
	ContentEndpoint   string         `json:"contentEndpoint,omitempty"`
}

func BuildGenerationPlan(link store.ProviderLink, job store.GenerationJob, secretConfigured bool) (DispatchPlan, error) {
	if strings.TrimSpace(job.Mode) == "video" || strings.TrimSpace(job.Route) == "video" {
		return BuildVideoGenerationPlan(link, job, secretConfigured)
	}
	return BuildImageGenerationPlan(link, job, secretConfigured)
}

func BuildImageGenerationPlan(link store.ProviderLink, job store.GenerationJob, secretConfigured bool) (DispatchPlan, error) {
	route := strings.TrimSpace(job.Route)
	if route == "" && strings.TrimSpace(job.Mode) == "image" {
		route = "generations"
	}
	if route != "generations" {
		return DispatchPlan{}, errors.New("GO_DISPATCH_ROUTE_NOT_SUPPORTED")
	}

	baseURL := strings.TrimRight(link.BaseURL, "/")
	if baseURL == "" {
		return DispatchPlan{}, errors.New("PROVIDER_BASE_URL_REQUIRED")
	}
	model := valueFromJob(job, "model")
	if model == "" {
		return DispatchPlan{}, errors.New("JOB_MODEL_REQUIRED")
	}
	prompt := valueFromJob(job, "generationPrompt")
	if prompt == "" {
		prompt = valueFromJob(job, "prompt")
	}
	if prompt == "" {
		return DispatchPlan{}, errors.New("JOB_PROMPT_REQUIRED")
	}

	decision := ResolveInvocation(link.ProviderType, model, "image", nil)
	if decision.Status != "verified" {
		return DispatchPlan{}, errors.New("MODEL_INVOCATION_NOT_VERIFIED")
	}
	if err := validateImageParameters(model, job, decision.Adapter); err != nil {
		return DispatchPlan{}, err
	}

	body := map[string]any{
		"model":  model,
		"prompt": prompt,
	}
	if decision.Adapter == AdapterOpenAIImages {
		if size := valueFromJob(job, "size"); size != "" {
			body["size"] = size
		}
		if quality := valueFromJob(job, "quality"); quality != "" {
			body["quality"] = quality
		}
	}
	if count := intFromJob(job, "n"); count > 0 {
		body["n"] = count
	} else if count := intFromJob(job, "count"); count > 0 {
		body["n"] = count
	}

	endpoint := baseURL + "/images/generations"
	if decision.Adapter == AdapterOpenAIChatImage {
		endpoint = baseURL + "/chat/completions"
		body = map[string]any{
			"model":    model,
			"messages": []map[string]any{{"role": "user", "content": prompt}},
			"stream":   false,
		}
		if aspectRatio := aspectRatioFromJob(job); aspectRatio != "" {
			body["extra_body"] = map[string]any{
				"google": map[string]any{"image_config": map[string]any{"aspect_ratio": aspectRatio}},
			}
		}
	}
	if decision.Adapter == AdapterXAIImages {
		body["response_format"] = "b64_json"
		if aspectRatio := aspectRatioFromJob(job); aspectRatio != "" {
			body["aspect_ratio"] = aspectRatio
		}
	}

	return DispatchPlan{
		ProviderID:        link.ID,
		ProviderType:      link.ProviderType,
		Method:            "POST",
		Endpoint:          endpoint,
		Route:             "generations",
		Transport:         decision.Adapter,
		InvocationAdapter: decision.Adapter,
		SecretConfigured:  secretConfigured,
		Body:              body,
	}, nil
}

func BuildVideoGenerationPlan(link store.ProviderLink, job store.GenerationJob, secretConfigured bool) (DispatchPlan, error) {
	if strings.TrimSpace(job.Mode) != "video" || strings.TrimSpace(job.Route) != "video" {
		return DispatchPlan{}, errors.New("GO_DISPATCH_ROUTE_NOT_SUPPORTED")
	}
	baseURL := strings.TrimRight(link.BaseURL, "/")
	if baseURL == "" {
		return DispatchPlan{}, errors.New("PROVIDER_BASE_URL_REQUIRED")
	}
	model := valueFromJob(job, "model")
	prompt := valueFromJob(job, "generationPrompt")
	if prompt == "" {
		prompt = valueFromJob(job, "prompt")
	}
	if model == "" {
		return DispatchPlan{}, errors.New("JOB_MODEL_REQUIRED")
	}
	if prompt == "" {
		return DispatchPlan{}, errors.New("JOB_PROMPT_REQUIRED")
	}

	decision := ResolveInvocation(link.ProviderType, model, "video", nil)
	if decision.Status != "verified" {
		return DispatchPlan{}, errors.New("MODEL_INVOCATION_NOT_VERIFIED")
	}
	if err := validateVideoParameters(job, decision.Adapter); err != nil {
		return DispatchPlan{}, err
	}

	body := map[string]any{"model": model, "prompt": prompt}
	if duration := intFromJob(job, "duration"); duration > 0 {
		body["duration"] = duration
	}

	plan := DispatchPlan{
		ProviderID:        link.ID,
		ProviderType:      link.ProviderType,
		Method:            "POST",
		Route:             "video",
		SecretConfigured:  secretConfigured,
		Body:              body,
		Transport:         decision.Adapter,
		InvocationAdapter: decision.Adapter,
	}
	switch decision.Adapter {
	case AdapterOpenAIVideos:
		if valueFromJob(job, "image") != "" {
			return DispatchPlan{}, errors.New("OPENAI_VIDEO_REFERENCE_UPLOAD_NOT_SUPPORTED")
		}
		plan.Endpoint = baseURL + "/videos"
		plan.RetrieveEndpoint = baseURL + "/videos/{id}"
		plan.ContentEndpoint = baseURL + "/videos/{id}/content"
		if duration := intFromJob(job, "duration"); duration > 0 {
			body["seconds"] = duration
			delete(body, "duration")
		}
		if width, height := intFromJob(job, "width"), intFromJob(job, "height"); width > 0 && height > 0 {
			body["size"] = fmt.Sprintf("%dx%d", width, height)
		}
	case AdapterXAIVideos:
		plan.Endpoint = baseURL + "/videos/generations"
		plan.RetrieveEndpoint = baseURL + "/videos/{id}"
		plan.ContentEndpoint = baseURL + "/videos/{id}/content"
		if aspectRatio := aspectRatioFromJob(job); aspectRatio != "" {
			body["aspect_ratio"] = aspectRatio
		}
		if resolution := xaiResolutionFromJob(job); resolution != "" {
			body["resolution"] = resolution
		}
		if image := valueFromJob(job, "image"); image != "" {
			body["image"] = image
		}
	case AdapterNewAPITaskVideo:
		plan.Endpoint = baseURL + "/video/generations"
		plan.RetrieveEndpoint = baseURL + "/video/generations/{id}"
		if width := intFromJob(job, "width"); width > 0 {
			body["width"] = width
		}
		if height := intFromJob(job, "height"); height > 0 {
			body["height"] = height
		}
		if width, height := intFromJob(job, "width"), intFromJob(job, "height"); width > 0 && height > 0 {
			body["size"] = fmt.Sprintf("%dx%d", width, height)
		}
		if fps := intFromJob(job, "fps"); fps > 0 {
			body["fps"] = fps
		}
		body["n"] = 1
		if image := valueFromJob(job, "image"); image != "" {
			body["image"] = image
		}
		metadata := map[string]any{}
		for requestKey, metadataKey := range map[string]string{
			"aspectRatio": "aspect_ratio", "motion": "camera_motion", "videoStyle": "style",
			"videoQuality": "quality_level", "negativePrompt": "negative_prompt",
		} {
			if value := valueFromJob(job, requestKey); value != "" {
				metadata[metadataKey] = value
			}
		}
		if len(metadata) > 0 {
			body["metadata"] = metadata
		}
	default:
		return DispatchPlan{}, errors.New("GO_VIDEO_PROVIDER_NOT_SUPPORTED")
	}
	return plan, nil
}

func validateImageParameters(model string, job store.GenerationJob, adapter string) error {
	model = strings.ToLower(model)
	if adapter != AdapterOpenAIImages {
		return nil
	}
	size := valueFromJob(job, "size")
	quality := strings.ToLower(valueFromJob(job, "quality"))
	count := intFromJob(job, "n")
	if count == 0 {
		count = intFromJob(job, "count")
	}
	if strings.Contains(model, "dall-e-3") || strings.Contains(model, "dall_e_3") {
		if count > 1 {
			return errors.New("IMAGE_COUNT_NOT_SUPPORTED")
		}
		if size != "" && size != "1024x1024" && size != "1792x1024" && size != "1024x1792" {
			return errors.New("IMAGE_SIZE_NOT_SUPPORTED")
		}
		if quality != "" && quality != "standard" && quality != "hd" {
			return errors.New("IMAGE_QUALITY_NOT_SUPPORTED")
		}
	}
	if strings.Contains(model, "gpt-image") {
		if size != "" && size != "auto" && size != "1024x1024" && size != "1536x1024" && size != "1024x1536" {
			return errors.New("IMAGE_SIZE_NOT_SUPPORTED")
		}
		if quality != "" && quality != "auto" && quality != "low" && quality != "medium" && quality != "high" {
			return errors.New("IMAGE_QUALITY_NOT_SUPPORTED")
		}
	}
	return nil
}

func validateVideoParameters(job store.GenerationJob, adapter string) error {
	duration := intFromJob(job, "duration")
	switch adapter {
	case AdapterOpenAIVideos:
		if duration > 0 && duration != 4 && duration != 8 && duration != 12 {
			return errors.New("VIDEO_DURATION_NOT_SUPPORTED")
		}
		if width, height := intFromJob(job, "width"), intFromJob(job, "height"); width > 0 && height > 0 {
			size := fmt.Sprintf("%dx%d", width, height)
			if size != "720x1280" && size != "1280x720" && size != "1024x1792" && size != "1792x1024" {
				return errors.New("VIDEO_SIZE_NOT_SUPPORTED")
			}
		}
	case AdapterXAIVideos:
		if duration > 15 {
			return errors.New("VIDEO_DURATION_NOT_SUPPORTED")
		}
	}
	return nil
}

func aspectRatioFromJob(job store.GenerationJob) string {
	if value := valueFromJob(job, "aspectRatio"); value != "" {
		return value
	}
	switch valueFromJob(job, "size") {
	case "1024x1024":
		return "1:1"
	case "1536x1024", "1792x1024":
		return "3:2"
	case "1024x1536", "1024x1792":
		return "2:3"
	}
	width, height := intFromJob(job, "width"), intFromJob(job, "height")
	if width <= 0 || height <= 0 {
		return ""
	}
	switch {
	case width == height:
		return "1:1"
	case width*9 == height*16:
		return "16:9"
	case width*16 == height*9:
		return "9:16"
	default:
		return ""
	}
}

func xaiResolutionFromJob(job store.GenerationJob) string {
	if value := strings.ToLower(valueFromJob(job, "resolution")); value == "480p" || value == "720p" || value == "1080p" {
		return value
	}
	width, height := intFromJob(job, "width"), intFromJob(job, "height")
	shortSide := width
	if height > 0 && (shortSide == 0 || height < shortSide) {
		shortSide = height
	}
	switch {
	case shortSide >= 1080:
		return "1080p"
	case shortSide >= 720:
		return "720p"
	case shortSide > 0:
		return "480p"
	default:
		return ""
	}
}

func valueFromJob(job store.GenerationJob, key string) string {
	if job.Request != nil {
		if value, ok := job.Request[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	switch key {
	case "model":
		return strings.TrimSpace(job.Model)
	case "prompt", "generationPrompt":
		return strings.TrimSpace(job.Prompt)
	default:
		return ""
	}
}

func intFromJob(job store.GenerationJob, key string) int {
	if job.Request == nil {
		return 0
	}
	switch value := job.Request[key].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}
