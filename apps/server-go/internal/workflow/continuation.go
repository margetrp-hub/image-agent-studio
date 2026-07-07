package workflow

import (
	"errors"
	"strings"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

type ContinuationRequest struct {
	Mode         string `json:"mode"`
	Route        string `json:"route"`
	ChangePrompt string `json:"changePrompt"`
	NextPrompt   string `json:"nextPrompt"`
	Model        string `json:"model"`
}

type PromptStep struct {
	Index  int    `json:"index"`
	JobID  string `json:"jobId,omitempty"`
	Mode   string `json:"mode"`
	Route  string `json:"route,omitempty"`
	Prompt string `json:"prompt"`
}

type WorkflowState struct {
	RootPrompt string       `json:"rootPrompt"`
	Lineage    []PromptStep `json:"lineage"`
}

type ContinuationPlan struct {
	ParentJobID        string        `json:"parentJobId"`
	ParentCanvasNodeID string        `json:"parentCanvasNodeId,omitempty"`
	Mode               string        `json:"mode"`
	Route              string        `json:"route"`
	Depth              int           `json:"depth"`
	RootPrompt         string        `json:"rootPrompt"`
	PreviousPrompt     string        `json:"previousPrompt"`
	ChangePrompt       string        `json:"changePrompt"`
	GenerationPrompt   string        `json:"generationPrompt"`
	Lineage            []PromptStep  `json:"lineage"`
	Workflow           WorkflowState `json:"workflow"`
}

func BuildContinuationPlan(parent store.GenerationJob, request ContinuationRequest) (ContinuationPlan, error) {
	previousPrompt := jobPrompt(parent)
	if previousPrompt == "" {
		return ContinuationPlan{}, errors.New("PARENT_PROMPT_REQUIRED")
	}
	changePrompt := strings.TrimSpace(request.ChangePrompt)
	if changePrompt == "" {
		changePrompt = strings.TrimSpace(request.NextPrompt)
	}
	if changePrompt == "" {
		return ContinuationPlan{}, errors.New("CHANGE_PROMPT_REQUIRED")
	}

	mode := normalizeMode(request.Mode)
	if mode == "" {
		mode = normalizeMode(parent.Mode)
	}
	route := normalizeRoute(request.Route, mode)
	parentWorkflow := workflowFromJob(parent)
	rootPrompt := strings.TrimSpace(parentWorkflow.RootPrompt)
	if rootPrompt == "" {
		rootPrompt = previousPrompt
	}
	lineage := append([]PromptStep(nil), parentWorkflow.Lineage...)
	if len(lineage) == 0 {
		lineage = append(lineage, PromptStep{
			Index:  1,
			JobID:  parent.ID,
			Mode:   normalizeMode(parent.Mode),
			Route:  parent.Route,
			Prompt: previousPrompt,
		})
	}
	nextIndex := len(lineage) + 1
	lineage = append(lineage, PromptStep{
		Index:  nextIndex,
		Mode:   mode,
		Route:  route,
		Prompt: changePrompt,
	})

	generationPrompt := composeGenerationPrompt(mode, rootPrompt, previousPrompt, changePrompt, lineage)
	return ContinuationPlan{
		ParentJobID:        parent.ID,
		ParentCanvasNodeID: stringFromMap(parent.Request, "parentCanvasNodeId"),
		Mode:               mode,
		Route:              route,
		Depth:              nextIndex,
		RootPrompt:         rootPrompt,
		PreviousPrompt:     previousPrompt,
		ChangePrompt:       changePrompt,
		GenerationPrompt:   generationPrompt,
		Lineage:            lineage,
		Workflow: WorkflowState{
			RootPrompt: rootPrompt,
			Lineage:    lineage,
		},
	}, nil
}

func composeGenerationPrompt(mode, rootPrompt, previousPrompt, changePrompt string, lineage []PromptStep) string {
	parts := []string{
		"Root prompt:\n" + rootPrompt,
		"Previous result prompt to inherit:\n" + previousPrompt,
		"Next change request:\n" + changePrompt,
	}
	if len(lineage) > 1 {
		summaries := make([]string, 0, len(lineage))
		for _, step := range lineage {
			prompt := compactPrompt(step.Prompt, 220)
			if prompt != "" {
				summaries = append(summaries, "#"+itoa(step.Index)+" "+step.Mode+": "+prompt)
			}
		}
		if len(summaries) > 0 {
			parts = append(parts, "Lineage summary:\n"+strings.Join(summaries, "\n"))
		}
	}
	if mode == "video" {
		parts = append(parts, "Continuity rules:\n- Keep the same subject identity, scene logic, visual style, and important props from the previous result.\n- Apply the new change as the next motion/story beat, not as a full reset.\n- Keep motion stable, coherent, and suitable for the selected video duration.")
	} else {
		parts = append(parts, "Continuity rules:\n- Keep the same subject identity, composition logic, visual style, materials, lighting, and important props from the previous result.\n- Apply only the new change unless the change explicitly asks for a redesign.\n- Do not add captions, watermarks, UI text, prompt text, or unrelated elements.")
	}
	return strings.Join(parts, "\n\n")
}

type parentWorkflowData struct {
	RootPrompt string
	Lineage    []PromptStep
}

func workflowFromJob(job store.GenerationJob) parentWorkflowData {
	data, _ := job.Request["workflow"].(map[string]any)
	if data == nil {
		return parentWorkflowData{}
	}
	lineage := []PromptStep{}
	if items, ok := data["lineage"].([]any); ok {
		for _, item := range items {
			if step, ok := item.(map[string]any); ok {
				lineage = append(lineage, PromptStep{
					Index:  intFromAny(step["index"]),
					JobID:  stringFromAny(step["jobId"]),
					Mode:   normalizeMode(stringFromAny(step["mode"])),
					Route:  stringFromAny(step["route"]),
					Prompt: stringFromAny(step["prompt"]),
				})
			}
		}
	}
	return parentWorkflowData{
		RootPrompt: stringFromAny(data["rootPrompt"]),
		Lineage:    lineage,
	}
}

func jobPrompt(job store.GenerationJob) string {
	if prompt := stringFromMap(job.Request, "generationPrompt"); prompt != "" {
		return prompt
	}
	if prompt := stringFromMap(job.Request, "prompt"); prompt != "" {
		return prompt
	}
	return strings.TrimSpace(job.Prompt)
}

func normalizeMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "video":
		return "video"
	case "edit", "mask":
		return "edit"
	default:
		return "image"
	}
}

func normalizeRoute(value string, mode string) string {
	route := strings.ToLower(strings.TrimSpace(value))
	if route != "" {
		return route
	}
	if mode == "video" {
		return "video"
	}
	if mode == "edit" {
		return "edits"
	}
	return "generations"
}

func compactPrompt(value string, limit int) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[:limit]
}

func stringFromMap(source map[string]any, key string) string {
	if source == nil {
		return ""
	}
	return stringFromAny(source[key])
}

func stringFromAny(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func intFromAny(value any) int {
	switch number := value.(type) {
	case int:
		return number
	case int64:
		return int(number)
	case float64:
		return int(number)
	default:
		return 0
	}
}

func itoa(value int) string {
	if value <= 0 {
		return "0"
	}
	var out []byte
	for value > 0 {
		out = append([]byte{byte('0' + value%10)}, out...)
		value /= 10
	}
	return string(out)
}
