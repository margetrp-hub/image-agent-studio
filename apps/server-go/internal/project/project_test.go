package project

import (
	"errors"
	"testing"
	"time"
)

func TestProjectValidateAcceptsCreativeAggregate(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	project := validProject(now)

	if err := project.Validate(); err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
}

func TestProjectValidateRejectsBrokenAggregateRelationships(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name   string
		mutate func(*Project)
		field  string
		code   string
	}{
		{
			name: "duplicate scene order",
			mutate: func(project *Project) {
				project.Scenes = append(project.Scenes, Scene{ID: "scene-2", Order: 1, Title: "Second"})
			},
			field: "scenes[1].order",
			code:  "DUPLICATE",
		},
		{
			name: "shot belongs to another scene",
			mutate: func(project *Project) {
				project.Scenes[0].Shots[0].SceneID = "scene-other"
			},
			field: "scenes[0].shots[0].sceneId",
			code:  "MISMATCH",
		},
		{
			name: "ready shot has no prompt",
			mutate: func(project *Project) {
				project.Scenes[0].Shots[0].Prompt = " "
			},
			field: "scenes[0].shots[0].prompt",
			code:  "REQUIRED_WHEN_READY",
		},
		{
			name: "image has video duration",
			mutate: func(project *Project) {
				project.Scenes[0].Shots[0].MediaType = MediaTypeImage
			},
			field: "scenes[0].shots[0].durationSeconds",
			code:  "NOT_ALLOWED_FOR_IMAGE",
		},
		{
			name: "blank continuity constraint",
			mutate: func(project *Project) {
				project.PromptConstraints.Continuity = append(project.PromptConstraints.Continuity, " ")
			},
			field: "promptConstraints.continuity[1]",
			code:  "BLANK",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			project := validProject(now)
			test.mutate(&project)
			assertValidationError(t, project.Validate(), test.field, test.code)
		})
	}
}

func TestProjectLifecycleArchivesAndRestores(t *testing.T) {
	createdAt := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	project := validProject(createdAt)

	activeAt := createdAt.Add(time.Hour)
	if err := project.Transition(ProjectStatusActive, activeAt); err != nil {
		t.Fatalf("activate failed: %v", err)
	}
	if project.Status != ProjectStatusActive || !project.UpdatedAt.Equal(activeAt) {
		t.Fatalf("unexpected active project: %#v", project)
	}

	archivedAt := activeAt.Add(time.Hour)
	if err := project.Transition(ProjectStatusArchived, archivedAt); err != nil {
		t.Fatalf("archive failed: %v", err)
	}
	if project.ArchivedAt == nil || !project.ArchivedAt.Equal(archivedAt) {
		t.Fatalf("archive timestamp missing: %#v", project)
	}

	restoredAt := archivedAt.Add(time.Hour)
	if err := project.Transition(ProjectStatusActive, restoredAt); err != nil {
		t.Fatalf("restore failed: %v", err)
	}
	if project.ArchivedAt != nil || project.Status != ProjectStatusActive {
		t.Fatalf("unexpected restored project: %#v", project)
	}

	err := project.Transition(ProjectStatusDraft, restoredAt.Add(time.Hour))
	assertValidationError(t, err, "status", "TRANSITION_NOT_ALLOWED")
}

func TestProjectLifecycleRejectsTimeGoingBackwards(t *testing.T) {
	createdAt := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	project := validProject(createdAt)
	assertValidationError(
		t,
		project.Transition(ProjectStatusActive, createdAt.Add(-time.Second)),
		"transitionAt",
		"BEFORE_UPDATED_AT",
	)
	if project.Status != ProjectStatusDraft {
		t.Fatalf("failed transition mutated project: %#v", project)
	}
}

func TestShotLifecycleRequiresPromptAndAllowsReview(t *testing.T) {
	shot := Shot{Status: ShotStatusDraft}
	assertValidationError(t, shot.Transition(ShotStatusReady), "shot.prompt", "REQUIRED_WHEN_READY")

	shot.Prompt = "Slow push-in while preserving the character identity."
	if err := shot.Transition(ShotStatusReady); err != nil {
		t.Fatalf("ready transition failed: %v", err)
	}
	if err := shot.Transition(ShotStatusApproved); err != nil {
		t.Fatalf("approve transition failed: %v", err)
	}
	assertValidationError(t, shot.Transition(ShotStatusDraft), "shot.status", "TRANSITION_NOT_ALLOWED")
}

func TestNewProjectStartsAsDraft(t *testing.T) {
	now := time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC)
	project := New("project-1", "user-1", "Launch film", now)
	if project.Status != ProjectStatusDraft || !project.CreatedAt.Equal(now) || !project.UpdatedAt.Equal(now) {
		t.Fatalf("unexpected new project: %#v", project)
	}
	if err := project.Validate(); err != nil {
		t.Fatalf("new project should validate: %v", err)
	}
}

func validProject(now time.Time) Project {
	project := New("project-1", "user-1", "Launch film", now)
	project.PromptConstraints = PromptConstraints{
		Style:      "Cinematic realism",
		Continuity: []string{"Keep the same lead character and red jacket"},
		Negative:   []string{"No captions or watermarks"},
	}
	project.Story = &StoryDocument{
		ID:       "story-1",
		Title:    "The Last Train",
		Logline:  "A courier races to deliver a final message.",
		Revision: 1,
		Beats: []StoryBeat{
			{ID: "beat-1", Order: 1, Title: "Departure", Summary: "The courier reaches the platform."},
		},
	}
	project.Scenes = []Scene{
		{
			ID:      "scene-1",
			Order:   1,
			Title:   "Station platform",
			Summary: "Rainy night at an old station.",
			PromptConstraints: PromptConstraints{
				Lighting: "Cold moonlight with warm carriage windows",
			},
			Shots: []Shot{
				{
					ID:              "shot-1",
					SceneID:         "scene-1",
					Order:           1,
					Title:           "Platform reveal",
					Prompt:          "A slow push-in toward the courier on the platform.",
					MediaType:       MediaTypeVideo,
					Status:          ShotStatusReady,
					DurationSeconds: 6,
					ReferenceAssetIDs: []string{
						"asset-character",
						"asset-station",
					},
				},
			},
		},
	}
	return project
}

func assertValidationError(t *testing.T, err error, field, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected validation error %s %s", field, code)
	}
	var validationErr *ValidationError
	if !errors.As(err, &validationErr) {
		t.Fatalf("expected ValidationError, got %T: %v", err, err)
	}
	if validationErr.Field != field || validationErr.Code != code {
		t.Fatalf("unexpected validation error: %#v", validationErr)
	}
}
