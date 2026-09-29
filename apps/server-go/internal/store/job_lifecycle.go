package store

import (
	"errors"
	"time"
)

var (
	ErrJobNotRetryable = errors.New("JOB_NOT_RETRYABLE")
	ErrJobRetryActive  = errors.New("JOB_RETRY_ALREADY_ACTIVE")
)

// ClaimJob atomically moves a queued job into dispatching. A second caller can
// observe the current job but cannot dispatch it again.
func (s *Store) ClaimJob(user PublicUser, jobID string) (GenerationJob, bool, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	jobID = cleanID(jobID)
	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, false, err
	}
	for index := range jobs {
		if jobs[index].ID != jobID {
			continue
		}
		if jobs[index].Status != JobStatusQueued {
			return jobs[index], true, false, nil
		}
		now := time.Now().UTC()
		jobs[index].Status = JobStatusDispatching
		jobs[index].Stage = JobStatusDispatching
		jobs[index].UpdatedAt = now
		jobs[index].CompletedAt = nil
		jobs[index].Error = nil
		if jobs[index].Attempt < 1 {
			jobs[index].Attempt = 1
		}
		return jobs[index], true, true, writeJSON(s.jobsPath(user.ID), jobs)
	}
	return GenerationJob{}, false, false, nil
}

// RetryJob creates a new durable attempt. It never rewinds or mutates the
// terminal record, so audit history and upstream-cost investigation stay clear.
func (s *Store) RetryJob(user PublicUser, jobID string, jobLimit int) (GenerationJob, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	jobID = cleanID(jobID)
	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, err
	}
	var source *GenerationJob
	for index := range jobs {
		if jobs[index].ID == jobID {
			source = &jobs[index]
			break
		}
	}
	if source == nil {
		return GenerationJob{}, false, nil
	}
	if source.Status != JobStatusFailed && source.Status != JobStatusCanceled {
		return GenerationJob{}, true, ErrJobNotRetryable
	}
	for _, existing := range jobs {
		if existing.RetryOf == source.ID && jobIsActive(existing.Status) {
			return existing, true, ErrJobRetryActive
		}
	}

	request := cloneMap(source.Request)
	if request == nil {
		request = map[string]any{}
	}
	now := time.Now().UTC()
	attempt := source.Attempt + 1
	if attempt < 2 {
		attempt = 2
	}
	retry := generationJobFromRequest(request)
	retry.ID = newID("job")
	retry.Attempt = attempt
	retry.RetryOf = source.ID
	retry.Status = JobStatusQueued
	retry.Stage = JobStatusQueued
	retry.Request = request
	retry.Request["id"] = retry.ID
	retry.Request["attempt"] = attempt
	retry.Request["retryOf"] = source.ID
	retry.ResultURLs = []string{}
	retry.CreatedAt = now
	retry.UpdatedAt = now

	next := append([]GenerationJob{retry}, jobs...)
	if jobLimit <= 0 || jobLimit > 1000 {
		jobLimit = 120
	}
	if len(next) > jobLimit {
		next = next[:jobLimit]
	}
	return retry, true, writeJSON(s.jobsPath(user.ID), next)
}

// RecoverInterruptedJobs preserves queued work and closes ambiguous in-flight
// work after a process restart. Retrying is explicit because an upstream may
// already have accepted the original request.
func (s *Store) RecoverInterruptedJobs() ([]GenerationJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	recovered := make([]GenerationJob, 0)
	for _, user := range users {
		var jobs []GenerationJob
		path := s.jobsPath(user.ID)
		if err := readJSON(path, &jobs); err != nil {
			return nil, err
		}
		changed := false
		for index := range jobs {
			switch jobs[index].Status {
			case JobStatusDispatching, JobStatusUpstream, JobStatusSaving:
				previous := jobs[index].Status
				jobs[index].Status = JobStatusFailed
				jobs[index].Stage = JobStatusFailed
				jobs[index].UpdatedAt = now
				jobs[index].CompletedAt = &now
				jobs[index].RecoveryCount++
				jobs[index].Error = map[string]any{
					"code":                 "JOB_INTERRUPTED_BY_RESTART",
					"message":              "The server restarted while the upstream result was unresolved.",
					"previousStatus":       previous,
					"retryable":            true,
					"upstreamOutcomeKnown": false,
				}
				recovered = append(recovered, jobs[index])
				changed = true
			}
		}
		if changed {
			if err := writeJSON(path, jobs); err != nil {
				return nil, err
			}
		}
	}
	return recovered, nil
}

func cloneMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	clone := make(map[string]any, len(source))
	for key, value := range source {
		switch nested := value.(type) {
		case map[string]any:
			clone[key] = cloneMap(nested)
		case []any:
			items := make([]any, len(nested))
			copy(items, nested)
			clone[key] = items
		default:
			clone[key] = value
		}
	}
	return clone
}
