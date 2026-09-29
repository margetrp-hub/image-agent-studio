package store

import "testing"

func TestRetryJobCreatesAuditableAttempt(t *testing.T) {
	studioStore := New(t.TempDir())
	user, err := studioStore.CreateUser("retry@example.com", "change-me-now", "Retry", RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	publicUser := Public(user)
	job, _, err := studioStore.CreateJob(publicUser, map[string]any{"request": map[string]any{
		"id": "attempt-one", "sessionId": "project-one", "mode": "image", "route": "generations",
		"providerId": "provider-one", "model": "gpt-image-2", "prompt": "A precise prompt.",
	}}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	claimed, _, didClaim, err := studioStore.ClaimJob(publicUser, job.ID)
	if err != nil || !didClaim || claimed.Status != JobStatusDispatching {
		t.Fatalf("ClaimJob failed: claimed=%v job=%#v err=%v", didClaim, claimed, err)
	}
	failed, _, err := studioStore.TransitionJob(publicUser, job.ID, JobStatusFailed, nil, map[string]any{"code": "UPSTREAM_FAILED"})
	if err != nil || failed.Status != JobStatusFailed {
		t.Fatalf("TransitionJob failed: %#v err=%v", failed, err)
	}

	retry, found, err := studioStore.RetryJob(publicUser, job.ID, 10)
	if err != nil || !found {
		t.Fatalf("RetryJob failed: found=%v err=%v", found, err)
	}
	if retry.ID == job.ID || retry.Attempt != 2 || retry.RetryOf != job.ID || retry.Status != JobStatusQueued {
		t.Fatalf("unexpected retry: %#v", retry)
	}
	if retry.Request["id"] != retry.ID || retry.Request["retryOf"] != job.ID || retry.Request["attempt"] != 2 {
		t.Fatalf("retry request metadata missing: %#v", retry.Request)
	}
	original, _, _ := studioStore.GetJob(publicUser, job.ID)
	if original.Status != JobStatusFailed || original.Attempt != 1 {
		t.Fatalf("retry mutated original attempt: %#v", original)
	}
}

func TestClaimJobPreventsDuplicateDispatch(t *testing.T) {
	studioStore := New(t.TempDir())
	user, _ := studioStore.CreateUser("claim@example.com", "change-me-now", "Claim", RoleCreator)
	publicUser := Public(user)
	job, _, _ := studioStore.CreateJob(publicUser, map[string]any{"request": map[string]any{"id": "claim-once"}}, 10)

	_, _, firstClaim, err := studioStore.ClaimJob(publicUser, job.ID)
	if err != nil || !firstClaim {
		t.Fatalf("first claim failed: %v", err)
	}
	current, found, secondClaim, err := studioStore.ClaimJob(publicUser, job.ID)
	if err != nil || !found || secondClaim || current.Status != JobStatusDispatching {
		t.Fatalf("duplicate claim was not rejected: found=%v claimed=%v job=%#v err=%v", found, secondClaim, current, err)
	}
}

func TestRecoverInterruptedJobsMarksOutcomeUnknown(t *testing.T) {
	studioStore := New(t.TempDir())
	user, _ := studioStore.CreateUser("recover@example.com", "change-me-now", "Recover", RoleCreator)
	publicUser := Public(user)
	job, _, _ := studioStore.CreateJob(publicUser, map[string]any{"request": map[string]any{"id": "recover-one"}}, 10)
	_, _, _, _ = studioStore.ClaimJob(publicUser, job.ID)
	_, _, _ = studioStore.TransitionJob(publicUser, job.ID, JobStatusUpstream, nil, nil)

	recovered, err := studioStore.RecoverInterruptedJobs()
	if err != nil || len(recovered) != 1 {
		t.Fatalf("RecoverInterruptedJobs failed: %#v err=%v", recovered, err)
	}
	current, _, _ := studioStore.GetJob(publicUser, job.ID)
	if current.Status != JobStatusFailed || current.RecoveryCount != 1 || current.Error["code"] != "JOB_INTERRUPTED_BY_RESTART" || current.Error["retryable"] != true {
		t.Fatalf("unexpected recovered job: %#v", current)
	}
}
