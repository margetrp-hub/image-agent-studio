package provider

import (
	"errors"
	"strings"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

type DispatchPlan struct {
	ProviderID       string         `json:"providerId"`
	ProviderType     string         `json:"providerType"`
	Method           string         `json:"method"`
	Endpoint         string         `json:"endpoint"`
	Route            string         `json:"route"`
	Transport        string         `json:"transport"`
	SecretConfigured bool           `json:"secretConfigured"`
	Body             map[string]any `json:"body"`
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

	body := map[string]any{
		"model":  model,
		"prompt": prompt,
	}
	if size := valueFromJob(job, "size"); size != "" {
		body["size"] = size
	}
	if quality := valueFromJob(job, "quality"); quality != "" {
		body["quality"] = quality
	}
	if count := intFromJob(job, "n"); count > 0 {
		body["n"] = count
	} else if count := intFromJob(job, "count"); count > 0 {
		body["n"] = count
	}

	return DispatchPlan{
		ProviderID:       link.ID,
		ProviderType:     link.ProviderType,
		Method:           "POST",
		Endpoint:         baseURL + "/images/generations",
		Route:            "generations",
		Transport:        "openai-compatible-images",
		SecretConfigured: secretConfigured,
		Body:             body,
	}, nil
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
