package project

import "time"

type ProjectStatus string

const (
	ProjectStatusDraft    ProjectStatus = "draft"
	ProjectStatusActive   ProjectStatus = "active"
	ProjectStatusArchived ProjectStatus = "archived"
)

type ShotStatus string

const (
	ShotStatusDraft    ShotStatus = "draft"
	ShotStatusReady    ShotStatus = "ready"
	ShotStatusApproved ShotStatus = "approved"
)

type MediaType string

const (
	MediaTypeImage MediaType = "image"
	MediaTypeVideo MediaType = "video"
)

// Project is the ownership and isolation boundary for creative work.
type Project struct {
	ID                string            `json:"id"`
	OwnerID           string            `json:"ownerId"`
	WorkspaceID       string            `json:"workspaceId,omitempty"`
	Name              string            `json:"name"`
	Description       string            `json:"description,omitempty"`
	Status            ProjectStatus     `json:"status"`
	PromptConstraints PromptConstraints `json:"promptConstraints,omitempty"`
	Story             *StoryDocument    `json:"story,omitempty"`
	Scenes            []Scene           `json:"scenes,omitempty"`
	CreatedAt         time.Time         `json:"createdAt"`
	UpdatedAt         time.Time         `json:"updatedAt"`
	ArchivedAt        *time.Time        `json:"archivedAt,omitempty"`
}

type StoryDocument struct {
	ID       string      `json:"id"`
	Title    string      `json:"title"`
	Logline  string      `json:"logline,omitempty"`
	Synopsis string      `json:"synopsis,omitempty"`
	Beats    []StoryBeat `json:"beats,omitempty"`
	Revision int         `json:"revision"`
}

type StoryBeat struct {
	ID      string `json:"id"`
	Order   int    `json:"order"`
	Title   string `json:"title"`
	Summary string `json:"summary,omitempty"`
}

type Scene struct {
	ID                string            `json:"id"`
	Order             int               `json:"order"`
	Title             string            `json:"title"`
	Summary           string            `json:"summary,omitempty"`
	PromptConstraints PromptConstraints `json:"promptConstraints,omitempty"`
	Shots             []Shot            `json:"shots,omitempty"`
}

type Shot struct {
	ID                string            `json:"id"`
	SceneID           string            `json:"sceneId"`
	Order             int               `json:"order"`
	Title             string            `json:"title"`
	Intent            string            `json:"intent,omitempty"`
	Prompt            string            `json:"prompt,omitempty"`
	PromptConstraints PromptConstraints `json:"promptConstraints,omitempty"`
	MediaType         MediaType         `json:"mediaType"`
	Status            ShotStatus        `json:"status"`
	DurationSeconds   float64           `json:"durationSeconds,omitempty"`
	ReferenceAssetIDs []string          `json:"referenceAssetIds,omitempty"`
}

// PromptConstraints stores stable creative requirements separately from a
// shot's immediate prompt so callers can inherit project and scene context.
type PromptConstraints struct {
	Goal        string   `json:"goal,omitempty"`
	Subject     string   `json:"subject,omitempty"`
	Setting     string   `json:"setting,omitempty"`
	Composition string   `json:"composition,omitempty"`
	Style       string   `json:"style,omitempty"`
	Lighting    string   `json:"lighting,omitempty"`
	Camera      string   `json:"camera,omitempty"`
	Continuity  []string `json:"continuity,omitempty"`
	Negative    []string `json:"negative,omitempty"`
	Technical   []string `json:"technical,omitempty"`
}

func New(id, ownerID, name string, now time.Time) Project {
	return Project{
		ID:        id,
		OwnerID:   ownerID,
		Name:      name,
		Status:    ProjectStatusDraft,
		CreatedAt: now,
		UpdatedAt: now,
	}
}
