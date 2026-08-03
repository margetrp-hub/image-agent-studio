package project

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	maxNameLength        = 160
	maxDescriptionLength = 4000
	maxPromptLength      = 20000
	maxConstraintLength  = 2000
	maxConstraintItems   = 64
)

type ValidationError struct {
	Field string
	Code  string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Code)
}

func validationError(field, code string) error {
	return &ValidationError{Field: field, Code: code}
}

func (p Project) Validate() error {
	if blank(p.ID) {
		return validationError("id", "REQUIRED")
	}
	if blank(p.OwnerID) {
		return validationError("ownerId", "REQUIRED")
	}
	if err := validateRequiredText("name", p.Name, maxNameLength); err != nil {
		return err
	}
	if textLength(p.Description) > maxDescriptionLength {
		return validationError("description", "TOO_LONG")
	}
	if !validProjectStatus(p.Status) {
		return validationError("status", "INVALID")
	}
	if p.CreatedAt.IsZero() {
		return validationError("createdAt", "REQUIRED")
	}
	if p.UpdatedAt.IsZero() {
		return validationError("updatedAt", "REQUIRED")
	}
	if p.UpdatedAt.Before(p.CreatedAt) {
		return validationError("updatedAt", "BEFORE_CREATED_AT")
	}
	if p.Status == ProjectStatusArchived && p.ArchivedAt == nil {
		return validationError("archivedAt", "REQUIRED_WHEN_ARCHIVED")
	}
	if p.Status != ProjectStatusArchived && p.ArchivedAt != nil {
		return validationError("archivedAt", "ONLY_ALLOWED_WHEN_ARCHIVED")
	}
	if p.ArchivedAt != nil && p.ArchivedAt.Before(p.CreatedAt) {
		return validationError("archivedAt", "BEFORE_CREATED_AT")
	}
	if err := p.PromptConstraints.Validate("promptConstraints"); err != nil {
		return err
	}
	if p.Story != nil {
		if err := p.Story.Validate(); err != nil {
			return err
		}
	}
	return validateScenes(p.Scenes)
}

func (s StoryDocument) Validate() error {
	if blank(s.ID) {
		return validationError("story.id", "REQUIRED")
	}
	if err := validateRequiredText("story.title", s.Title, maxNameLength); err != nil {
		return err
	}
	if textLength(s.Logline) > maxDescriptionLength || textLength(s.Synopsis) > maxPromptLength {
		return validationError("story", "CONTENT_TOO_LONG")
	}
	if s.Revision < 1 {
		return validationError("story.revision", "MUST_BE_POSITIVE")
	}

	ids := make(map[string]struct{}, len(s.Beats))
	orders := make(map[int]struct{}, len(s.Beats))
	for index, beat := range s.Beats {
		field := fmt.Sprintf("story.beats[%d]", index)
		if blank(beat.ID) {
			return validationError(field+".id", "REQUIRED")
		}
		if _, exists := ids[beat.ID]; exists {
			return validationError(field+".id", "DUPLICATE")
		}
		ids[beat.ID] = struct{}{}
		if beat.Order < 1 {
			return validationError(field+".order", "MUST_BE_POSITIVE")
		}
		if _, exists := orders[beat.Order]; exists {
			return validationError(field+".order", "DUPLICATE")
		}
		orders[beat.Order] = struct{}{}
		if err := validateRequiredText(field+".title", beat.Title, maxNameLength); err != nil {
			return err
		}
		if textLength(beat.Summary) > maxDescriptionLength {
			return validationError(field+".summary", "TOO_LONG")
		}
	}
	return nil
}

func (c PromptConstraints) Validate(field string) error {
	if field == "" {
		field = "promptConstraints"
	}
	texts := []struct {
		name  string
		value string
	}{
		{"goal", c.Goal},
		{"subject", c.Subject},
		{"setting", c.Setting},
		{"composition", c.Composition},
		{"style", c.Style},
		{"lighting", c.Lighting},
		{"camera", c.Camera},
	}
	for _, text := range texts {
		if textLength(text.value) > maxConstraintLength {
			return validationError(field+"."+text.name, "TOO_LONG")
		}
	}
	lists := []struct {
		name   string
		values []string
	}{
		{"continuity", c.Continuity},
		{"negative", c.Negative},
		{"technical", c.Technical},
	}
	for _, list := range lists {
		if len(list.values) > maxConstraintItems {
			return validationError(field+"."+list.name, "TOO_MANY_ITEMS")
		}
		for index, value := range list.values {
			itemField := fmt.Sprintf("%s.%s[%d]", field, list.name, index)
			if blank(value) {
				return validationError(itemField, "BLANK")
			}
			if textLength(value) > maxConstraintLength {
				return validationError(itemField, "TOO_LONG")
			}
		}
	}
	return nil
}

func validateScenes(scenes []Scene) error {
	sceneIDs := make(map[string]struct{}, len(scenes))
	sceneOrders := make(map[int]struct{}, len(scenes))
	shotIDs := make(map[string]struct{})
	for index, scene := range scenes {
		field := fmt.Sprintf("scenes[%d]", index)
		if blank(scene.ID) {
			return validationError(field+".id", "REQUIRED")
		}
		if _, exists := sceneIDs[scene.ID]; exists {
			return validationError(field+".id", "DUPLICATE")
		}
		sceneIDs[scene.ID] = struct{}{}
		if scene.Order < 1 {
			return validationError(field+".order", "MUST_BE_POSITIVE")
		}
		if _, exists := sceneOrders[scene.Order]; exists {
			return validationError(field+".order", "DUPLICATE")
		}
		sceneOrders[scene.Order] = struct{}{}
		if err := validateRequiredText(field+".title", scene.Title, maxNameLength); err != nil {
			return err
		}
		if textLength(scene.Summary) > maxDescriptionLength {
			return validationError(field+".summary", "TOO_LONG")
		}
		if err := scene.PromptConstraints.Validate(field + ".promptConstraints"); err != nil {
			return err
		}
		if err := validateShots(field, scene, shotIDs); err != nil {
			return err
		}
	}
	return nil
}

func validateShots(sceneField string, scene Scene, shotIDs map[string]struct{}) error {
	orders := make(map[int]struct{}, len(scene.Shots))
	for index, shot := range scene.Shots {
		field := fmt.Sprintf("%s.shots[%d]", sceneField, index)
		if blank(shot.ID) {
			return validationError(field+".id", "REQUIRED")
		}
		if _, exists := shotIDs[shot.ID]; exists {
			return validationError(field+".id", "DUPLICATE")
		}
		shotIDs[shot.ID] = struct{}{}
		if shot.SceneID != scene.ID {
			return validationError(field+".sceneId", "MISMATCH")
		}
		if shot.Order < 1 {
			return validationError(field+".order", "MUST_BE_POSITIVE")
		}
		if _, exists := orders[shot.Order]; exists {
			return validationError(field+".order", "DUPLICATE")
		}
		orders[shot.Order] = struct{}{}
		if err := validateRequiredText(field+".title", shot.Title, maxNameLength); err != nil {
			return err
		}
		if textLength(shot.Intent) > maxDescriptionLength || textLength(shot.Prompt) > maxPromptLength {
			return validationError(field, "CONTENT_TOO_LONG")
		}
		if !validMediaType(shot.MediaType) {
			return validationError(field+".mediaType", "INVALID")
		}
		if !validShotStatus(shot.Status) {
			return validationError(field+".status", "INVALID")
		}
		if shot.Status != ShotStatusDraft && blank(shot.Prompt) {
			return validationError(field+".prompt", "REQUIRED_WHEN_READY")
		}
		if shot.MediaType == MediaTypeVideo && shot.DurationSeconds <= 0 {
			return validationError(field+".durationSeconds", "MUST_BE_POSITIVE_FOR_VIDEO")
		}
		if shot.MediaType == MediaTypeImage && shot.DurationSeconds != 0 {
			return validationError(field+".durationSeconds", "NOT_ALLOWED_FOR_IMAGE")
		}
		if err := shot.PromptConstraints.Validate(field + ".promptConstraints"); err != nil {
			return err
		}
		assets := make(map[string]struct{}, len(shot.ReferenceAssetIDs))
		for assetIndex, assetID := range shot.ReferenceAssetIDs {
			assetField := fmt.Sprintf("%s.referenceAssetIds[%d]", field, assetIndex)
			if blank(assetID) {
				return validationError(assetField, "BLANK")
			}
			if _, exists := assets[assetID]; exists {
				return validationError(assetField, "DUPLICATE")
			}
			assets[assetID] = struct{}{}
		}
	}
	return nil
}

func validateRequiredText(field, value string, maxLength int) error {
	if blank(value) {
		return validationError(field, "REQUIRED")
	}
	if textLength(value) > maxLength {
		return validationError(field, "TOO_LONG")
	}
	return nil
}

func blank(value string) bool {
	return strings.TrimSpace(value) == ""
}

func textLength(value string) int {
	return utf8.RuneCountInString(value)
}

func validProjectStatus(status ProjectStatus) bool {
	return status == ProjectStatusDraft || status == ProjectStatusActive || status == ProjectStatusArchived
}

func validShotStatus(status ShotStatus) bool {
	return status == ShotStatusDraft || status == ShotStatusReady || status == ShotStatusApproved
}

func validMediaType(mediaType MediaType) bool {
	return mediaType == MediaTypeImage || mediaType == MediaTypeVideo
}
