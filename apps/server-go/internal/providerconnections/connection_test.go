package providerconnections

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/secrets"
)

func TestCredentialsRoundTripAndPublicViewDoNotLeakSecrets(t *testing.T) {
	vault, err := secrets.New(bytes.Repeat([]byte{0x51}, secrets.KeySize), "v1")
	if err != nil {
		t.Fatalf("New vault failed: %v", err)
	}
	envelope, err := Seal(vault, "user-1", "connection-1", Credentials{APIKey: "api-secret", AccessToken: "access-secret"})
	if err != nil {
		t.Fatalf("Seal failed: %v", err)
	}
	connection := Normalize(Connection{
		ID: "connection-1", OwnerID: "user-1", ProviderType: "newapi-compatible",
		Label: "Personal NewAPI", Enabled: true, BaseURL: "https://example.com/v1",
		APIKeyConfigured: true, AccessTokenConfigured: true, Credentials: envelope,
	})
	if err := Validate(connection); err != nil {
		t.Fatalf("Validate failed: %v", err)
	}
	opened, err := Open(vault, connection)
	if err != nil || opened.APIKey != "api-secret" || opened.AccessToken != "access-secret" {
		t.Fatalf("Open returned %#v, %v", opened, err)
	}
	publicBody, _ := json.Marshal(Public(connection))
	if strings.Contains(string(publicBody), "api-secret") || strings.Contains(string(publicBody), "access-secret") || strings.Contains(string(publicBody), "ciphertext") {
		t.Fatalf("public connection leaked credentials: %s", publicBody)
	}
}

func TestCredentialsAreBoundToOwnerAndConnection(t *testing.T) {
	vault, _ := secrets.New(bytes.Repeat([]byte{0x42}, secrets.KeySize), "v1")
	envelope, err := Seal(vault, "user-1", "connection-1", Credentials{APIKey: "secret"})
	if err != nil {
		t.Fatalf("Seal failed: %v", err)
	}
	connection := Connection{ID: "connection-1", OwnerID: "user-2", Credentials: envelope}
	if _, err := Open(vault, connection); err != ErrCredentialOwner {
		t.Fatalf("owner mismatch error = %v", err)
	}
	connection.OwnerID = "user-1"
	connection.ID = "connection-2"
	if _, err := Open(vault, connection); err != ErrCredentialConnection {
		t.Fatalf("connection mismatch error = %v", err)
	}
}
