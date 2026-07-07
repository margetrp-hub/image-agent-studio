package store

import "testing"

func TestUserPasswordAndStudioDataPersistence(t *testing.T) {
	studioStore := New(t.TempDir())

	user, err := studioStore.CreateUser("Admin@Example.com", "change-me-now", "Admin", RoleAdmin)
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if user.Email != "admin@example.com" {
		t.Fatalf("email was not normalized: %q", user.Email)
	}
	if user.PasswordHash == "change-me-now" || !VerifyPassword(user.PasswordHash, "change-me-now") {
		t.Fatalf("password was not hashed or could not be verified")
	}
	if VerifyPassword(user.PasswordHash, "wrong-password") {
		t.Fatalf("wrong password verified")
	}

	publicUser := Public(user)
	session, err := studioStore.WriteStudioSession(publicUser, "", map[string]any{
		"sessionId": "desk-1",
		"apiKey":    "must-not-persist",
		"nested": map[string]any{
			"accessToken": "must-not-persist",
			"safe":        "ok",
		},
	})
	if err != nil {
		t.Fatalf("WriteStudioSession failed: %v", err)
	}
	if _, ok := session["apiKey"]; ok {
		t.Fatalf("session retained apiKey")
	}

	loadedSession, err := studioStore.ReadStudioSession(publicUser, "desk-1")
	if err != nil {
		t.Fatalf("ReadStudioSession failed: %v", err)
	}
	if loadedSession["sessionId"] != "desk-1" {
		t.Fatalf("unexpected loaded session: %#v", loadedSession)
	}
	nested, ok := loadedSession["nested"].(map[string]any)
	if !ok || nested["safe"] != "ok" {
		t.Fatalf("nested safe data missing: %#v", loadedSession)
	}
	if _, ok := nested["accessToken"]; ok {
		t.Fatalf("nested accessToken persisted")
	}

	record, err := studioStore.AppendHistory(publicUser, map[string]any{
		"id":       "rec-1",
		"prompt":   "hello",
		"password": "must-not-persist",
	}, 10)
	if err != nil {
		t.Fatalf("AppendHistory failed: %v", err)
	}
	if record["id"] != "rec-1" {
		t.Fatalf("unexpected record id: %#v", record)
	}
	if _, ok := record["password"]; ok {
		t.Fatalf("history retained password")
	}

	page, err := studioStore.ListHistory(publicUser, 10, 0)
	if err != nil {
		t.Fatalf("ListHistory failed: %v", err)
	}
	if page.Total != 1 || len(page.Records) != 1 || page.Records[0]["prompt"] != "hello" {
		t.Fatalf("unexpected history page: %#v", page)
	}

	job, duplicate, err := studioStore.CreateJob(publicUser, map[string]any{
		"apiKey": "must-not-persist",
		"request": map[string]any{
			"id":          "job-1",
			"sessionId":   "desk-1",
			"mode":        "image",
			"route":       "generations",
			"providerId":  "newapi-compatible",
			"model":       "gpt-image-2",
			"prompt":      "hello image",
			"fingerprint": "fingerprint-1",
			"apiKey":      "must-not-persist",
		},
	}, 10)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	if duplicate {
		t.Fatalf("first job should not be duplicate")
	}
	if job.Status != JobStatusQueued || job.Stage != JobStatusQueued {
		t.Fatalf("unexpected job state: %#v", job)
	}
	if _, ok := job.Request["apiKey"]; ok {
		t.Fatalf("job request retained apiKey")
	}

	_, duplicate, err = studioStore.CreateJob(publicUser, map[string]any{
		"request": map[string]any{
			"id":          "job-2",
			"sessionId":   "desk-1",
			"fingerprint": "fingerprint-1",
		},
	}, 10)
	if err != nil {
		t.Fatalf("CreateJob duplicate failed: %v", err)
	}
	if !duplicate {
		t.Fatalf("active duplicate job was not detected")
	}

	canceled, found, err := studioStore.CancelJob(publicUser, "job-1")
	if err != nil {
		t.Fatalf("CancelJob failed: %v", err)
	}
	if !found || canceled.Status != JobStatusCanceled {
		t.Fatalf("job was not canceled: found=%v job=%#v", found, canceled)
	}
}

func TestProviderLinksForUser(t *testing.T) {
	studioStore := New(t.TempDir())
	t.Setenv("STUDIO_SHARED_NEWAPI_API_KEY", "must-not-leak")

	admin, err := studioStore.CreateUser("admin@example.com", "change-me-now", "Admin", RoleAdmin)
	if err != nil {
		t.Fatalf("CreateUser admin failed: %v", err)
	}
	creator, err := studioStore.CreateUser("creator@example.com", "change-me-now", "Creator", RoleCreator)
	if err != nil {
		t.Fatalf("CreateUser creator failed: %v", err)
	}

	_, err = studioStore.UpsertProviderLink(ProviderLink{
		ID:           "newapi-shared",
		ProviderType: "newapi-compatible",
		Label:        "Shared NewAPI",
		Enabled:      true,
		BaseURL:      "https://newapi.example.com/v1/",
		SecretEnv:    "STUDIO_SHARED_NEWAPI_API_KEY",
		AllowedRoles: []string{RoleCreator},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink creator link failed: %v", err)
	}
	_, err = studioStore.UpsertProviderLink(ProviderLink{
		ID:           "admin-only",
		ProviderType: "openai-compatible",
		Label:        "Admin OpenAI",
		Enabled:      true,
		BaseURL:      "https://api.example.com/v1",
		SecretEnv:    "STUDIO_SHARED_OPENAI_API_KEY",
		AllowedRoles: []string{RoleAdmin},
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink admin link failed: %v", err)
	}
	_, err = studioStore.UpsertProviderLink(ProviderLink{
		ID:           "disabled",
		ProviderType: "sub2api-compatible",
		Label:        "Disabled",
		Enabled:      false,
		BaseURL:      "https://sub.example.com/v1",
		SecretEnv:    "STUDIO_SHARED_SUB2API_API_KEY",
	})
	if err != nil {
		t.Fatalf("UpsertProviderLink disabled link failed: %v", err)
	}

	creatorLinks, err := studioStore.ListProviderLinksForUser(Public(creator))
	if err != nil {
		t.Fatalf("ListProviderLinksForUser creator failed: %v", err)
	}
	if len(creatorLinks) != 1 || creatorLinks[0].ID != "newapi-shared" {
		t.Fatalf("unexpected creator links: %#v", creatorLinks)
	}
	if creatorLinks[0].BaseURL != "https://newapi.example.com/v1" || creatorLinks[0].ModelBaseURL != "https://newapi.example.com/v1" {
		t.Fatalf("provider URLs were not normalized: %#v", creatorLinks[0])
	}
	publicLink := PublicProvider(creatorLinks[0])
	if !publicLink.SecretConfigured {
		t.Fatalf("public provider did not report configured secret")
	}

	adminLinks, err := studioStore.ListProviderLinksForUser(Public(admin))
	if err != nil {
		t.Fatalf("ListProviderLinksForUser admin failed: %v", err)
	}
	if len(adminLinks) != 1 || adminLinks[0].ID != "admin-only" {
		t.Fatalf("unexpected admin links: %#v", adminLinks)
	}
	if _, found, err := studioStore.GetProviderLinkForUser(Public(creator), "admin-only"); err != nil || found {
		t.Fatalf("creator should not read admin-only provider: found=%v err=%v", found, err)
	}
}
