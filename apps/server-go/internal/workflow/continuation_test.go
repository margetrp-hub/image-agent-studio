package workflow

import (
	"strings"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func TestBuildContinuationPlanKeepsRootAndPreviousPrompt(t *testing.T) {
	parent := store.GenerationJob{
		ID:     "job-1",
		Mode:   "image",
		Route:  "generations",
		Prompt: "A cinematic product hero image, red bottle on marble, softbox lighting.",
		Request: map[string]any{
			"parentCanvasNodeId": "node-1",
			"generationPrompt":   "A cinematic product hero image, red bottle on marble, softbox lighting.",
		},
	}

	second, err := BuildContinuationPlan(parent, ContinuationRequest{
		Mode:         "image",
		ChangePrompt: "Make the background darker and add subtle condensation.",
	})
	if err != nil {
		t.Fatalf("BuildContinuationPlan second failed: %v", err)
	}
	if second.Depth != 2 || second.ParentJobID != "job-1" || second.ParentCanvasNodeID != "node-1" {
		t.Fatalf("unexpected second plan identity: %#v", second)
	}
	if second.RootPrompt != parent.Prompt || second.PreviousPrompt != parent.Prompt {
		t.Fatalf("second plan did not inherit root/previous prompt: %#v", second)
	}
	if !strings.Contains(second.GenerationPrompt, "Previous result prompt to inherit") || !strings.Contains(second.GenerationPrompt, "subtle condensation") {
		t.Fatalf("second generation prompt missing inheritance sections: %s", second.GenerationPrompt)
	}

	thirdParent := store.GenerationJob{
		ID:     "job-2",
		Mode:   second.Mode,
		Route:  second.Route,
		Prompt: second.GenerationPrompt,
		Request: map[string]any{
			"generationPrompt": second.GenerationPrompt,
			"workflow": map[string]any{
				"rootPrompt": second.Workflow.RootPrompt,
				"lineage": []any{
					map[string]any{"index": float64(1), "jobId": "job-1", "mode": "image", "route": "generations", "prompt": parent.Prompt},
					map[string]any{"index": float64(2), "mode": "image", "route": "generations", "prompt": second.ChangePrompt},
				},
			},
		},
	}
	third, err := BuildContinuationPlan(thirdParent, ContinuationRequest{
		Mode:         "image",
		ChangePrompt: "Now make it a close-up crop with stronger rim light.",
	})
	if err != nil {
		t.Fatalf("BuildContinuationPlan third failed: %v", err)
	}
	if third.Depth != 3 || len(third.Workflow.Lineage) != 3 {
		t.Fatalf("third plan did not extend lineage: %#v", third)
	}
	if third.RootPrompt != parent.Prompt {
		t.Fatalf("third plan lost root prompt: %#v", third)
	}
	if !strings.Contains(third.GenerationPrompt, "#1 image") || !strings.Contains(third.GenerationPrompt, "#2 image") || !strings.Contains(third.GenerationPrompt, "#3 image") {
		t.Fatalf("third generation prompt missing lineage summary: %s", third.GenerationPrompt)
	}
}

func TestBuildContinuationPlanSupportsVideoContinuation(t *testing.T) {
	parent := store.GenerationJob{
		ID:     "job-video-1",
		Mode:   "video",
		Route:  "video",
		Prompt: "A five second product video, slow push-in, clean studio light.",
		Request: map[string]any{
			"generationPrompt": "A five second product video, slow push-in, clean studio light.",
		},
	}
	plan, err := BuildContinuationPlan(parent, ContinuationRequest{
		Mode:         "video",
		ChangePrompt: "Continue with a macro detail shot of the logo.",
	})
	if err != nil {
		t.Fatalf("BuildContinuationPlan video failed: %v", err)
	}
	if plan.Mode != "video" || plan.Route != "video" {
		t.Fatalf("unexpected video route: %#v", plan)
	}
	if !strings.Contains(plan.GenerationPrompt, "motion/story beat") {
		t.Fatalf("video continuation prompt missing motion continuity rules: %s", plan.GenerationPrompt)
	}
}
