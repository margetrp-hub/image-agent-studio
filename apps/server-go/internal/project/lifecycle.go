package project

import "time"

func CanTransitionProject(from, to ProjectStatus) bool {
	if from == to {
		return validProjectStatus(from)
	}
	switch from {
	case ProjectStatusDraft:
		return to == ProjectStatusActive || to == ProjectStatusArchived
	case ProjectStatusActive:
		return to == ProjectStatusArchived
	case ProjectStatusArchived:
		return to == ProjectStatusActive
	default:
		return false
	}
}

func (p *Project) Transition(to ProjectStatus, at time.Time) error {
	if p == nil {
		return validationError("project", "REQUIRED")
	}
	if at.IsZero() {
		return validationError("transitionAt", "REQUIRED")
	}
	if !p.UpdatedAt.IsZero() && at.Before(p.UpdatedAt) {
		return validationError("transitionAt", "BEFORE_UPDATED_AT")
	}
	if !CanTransitionProject(p.Status, to) {
		return validationError("status", "TRANSITION_NOT_ALLOWED")
	}
	if p.Status == to {
		return p.Validate()
	}

	next := *p
	next.Status = to
	next.UpdatedAt = at
	if to == ProjectStatusArchived {
		next.ArchivedAt = &at
	} else {
		next.ArchivedAt = nil
	}
	if err := next.Validate(); err != nil {
		return err
	}
	*p = next
	return nil
}

func CanTransitionShot(from, to ShotStatus) bool {
	if from == to {
		return validShotStatus(from)
	}
	switch from {
	case ShotStatusDraft:
		return to == ShotStatusReady
	case ShotStatusReady:
		return to == ShotStatusDraft || to == ShotStatusApproved
	case ShotStatusApproved:
		return to == ShotStatusReady
	default:
		return false
	}
}

func (s *Shot) Transition(to ShotStatus) error {
	if s == nil {
		return validationError("shot", "REQUIRED")
	}
	if !CanTransitionShot(s.Status, to) {
		return validationError("shot.status", "TRANSITION_NOT_ALLOWED")
	}
	if to != ShotStatusDraft && blank(s.Prompt) {
		return validationError("shot.prompt", "REQUIRED_WHEN_READY")
	}
	s.Status = to
	return nil
}
