package providerconnections

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/secrets"
)

var (
	ErrIDRequired           = errors.New("PROVIDER_CONNECTION_ID_REQUIRED")
	ErrOwnerRequired        = errors.New("PROVIDER_CONNECTION_OWNER_REQUIRED")
	ErrTypeNotSupported     = errors.New("PROVIDER_TYPE_NOT_SUPPORTED")
	ErrBaseURLRequired      = errors.New("PROVIDER_BASE_URL_REQUIRED")
	ErrSecretRequired       = errors.New("PROVIDER_CONNECTION_SECRET_REQUIRED")
	ErrSecretUnavailable    = errors.New("PROVIDER_CONNECTION_SECRET_UNAVAILABLE")
	ErrCredentialOwner      = errors.New("PROVIDER_CONNECTION_CREDENTIAL_OWNER_MISMATCH")
	ErrCredentialConnection = errors.New("PROVIDER_CONNECTION_CREDENTIAL_ID_MISMATCH")
)

type Connection struct {
	ID                    string           `json:"id"`
	OwnerID               string           `json:"ownerId"`
	ProviderType          string           `json:"providerType"`
	Label                 string           `json:"label"`
	Enabled               bool             `json:"enabled"`
	BaseURL               string           `json:"baseUrl"`
	ModelBaseURL          string           `json:"modelBaseUrl"`
	AccountMode           string           `json:"accountMode"`
	APIKeyConfigured      bool             `json:"apiKeyConfigured"`
	AccessTokenConfigured bool             `json:"accessTokenConfigured"`
	Credentials           secrets.Envelope `json:"credentials"`
	CreatedAt             time.Time        `json:"createdAt"`
	UpdatedAt             time.Time        `json:"updatedAt"`
}

type PublicConnection struct {
	ID                    string    `json:"id"`
	ProviderType          string    `json:"providerType"`
	Label                 string    `json:"label"`
	Enabled               bool      `json:"enabled"`
	BaseURL               string    `json:"baseUrl"`
	ModelBaseURL          string    `json:"modelBaseUrl"`
	AccountMode           string    `json:"accountMode"`
	APIKeyConfigured      bool      `json:"apiKeyConfigured"`
	AccessTokenConfigured bool      `json:"accessTokenConfigured"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

type Input struct {
	ID           string  `json:"id"`
	ProviderType string  `json:"providerType"`
	Label        string  `json:"label"`
	Enabled      bool    `json:"enabled"`
	BaseURL      string  `json:"baseUrl"`
	ModelBaseURL string  `json:"modelBaseUrl"`
	AccountMode  string  `json:"accountMode"`
	APIKey       *string `json:"apiKey"`
	AccessToken  *string `json:"accessToken"`
}

type Credentials struct {
	APIKey      string
	AccessToken string
}

type credentialPayload struct {
	OwnerID      string `json:"ownerId"`
	ConnectionID string `json:"connectionId"`
	APIKey       string `json:"apiKey,omitempty"`
	AccessToken  string `json:"accessToken,omitempty"`
}

func NewID() string {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		panic(err)
	}
	return "pcn_" + hex.EncodeToString(data)
}

func Normalize(connection Connection) Connection {
	connection.ID = CleanID(connection.ID)
	connection.OwnerID = strings.TrimSpace(connection.OwnerID)
	connection.ProviderType = strings.ToLower(strings.TrimSpace(connection.ProviderType))
	connection.Label = strings.TrimSpace(connection.Label)
	connection.BaseURL = strings.TrimRight(strings.TrimSpace(connection.BaseURL), "/")
	connection.ModelBaseURL = strings.TrimRight(strings.TrimSpace(connection.ModelBaseURL), "/")
	connection.AccountMode = strings.ToLower(strings.TrimSpace(connection.AccountMode))
	if connection.ModelBaseURL == "" {
		connection.ModelBaseURL = connection.BaseURL
	}
	if connection.AccountMode == "" {
		connection.AccountMode = "personal-api-key"
	}
	return connection
}

func Validate(connection Connection) error {
	connection = Normalize(connection)
	if connection.ID == "" {
		return ErrIDRequired
	}
	if connection.OwnerID == "" {
		return ErrOwnerRequired
	}
	if !ProviderTypeAllowed(connection.ProviderType) {
		return ErrTypeNotSupported
	}
	if !validURL(connection.BaseURL) || !validURL(connection.ModelBaseURL) {
		return ErrBaseURLRequired
	}
	if !connection.APIKeyConfigured && !connection.AccessTokenConfigured {
		return ErrSecretRequired
	}
	if strings.TrimSpace(connection.Credentials.KeyVersion) == "" || len(connection.Credentials.Nonce) == 0 || len(connection.Credentials.Ciphertext) == 0 {
		return ErrSecretUnavailable
	}
	return nil
}

func Seal(vault *secrets.Vault, ownerID, connectionID string, credentials Credentials) (secrets.Envelope, error) {
	payload := credentialPayload{
		OwnerID:      strings.TrimSpace(ownerID),
		ConnectionID: CleanID(connectionID),
		APIKey:       strings.TrimSpace(credentials.APIKey),
		AccessToken:  strings.TrimSpace(credentials.AccessToken),
	}
	if payload.OwnerID == "" {
		return secrets.Envelope{}, ErrOwnerRequired
	}
	if payload.ConnectionID == "" {
		return secrets.Envelope{}, ErrIDRequired
	}
	if payload.APIKey == "" && payload.AccessToken == "" {
		return secrets.Envelope{}, ErrSecretRequired
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return secrets.Envelope{}, ErrSecretUnavailable
	}
	envelope, err := vault.Encrypt(body)
	if err != nil {
		return secrets.Envelope{}, ErrSecretUnavailable
	}
	return envelope, nil
}

func Open(vault *secrets.Vault, connection Connection) (Credentials, error) {
	body, err := vault.Decrypt(connection.Credentials)
	if err != nil {
		return Credentials{}, ErrSecretUnavailable
	}
	var payload credentialPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return Credentials{}, ErrSecretUnavailable
	}
	if payload.OwnerID != connection.OwnerID {
		return Credentials{}, ErrCredentialOwner
	}
	if payload.ConnectionID != connection.ID {
		return Credentials{}, ErrCredentialConnection
	}
	credentials := Credentials{
		APIKey:      strings.TrimSpace(payload.APIKey),
		AccessToken: strings.TrimSpace(payload.AccessToken),
	}
	if credentials.APIKey == "" && credentials.AccessToken == "" {
		return Credentials{}, ErrSecretRequired
	}
	return credentials, nil
}

func Public(connection Connection) PublicConnection {
	return PublicConnection{
		ID:                    connection.ID,
		ProviderType:          connection.ProviderType,
		Label:                 connection.Label,
		Enabled:               connection.Enabled,
		BaseURL:               connection.BaseURL,
		ModelBaseURL:          connection.ModelBaseURL,
		AccountMode:           connection.AccountMode,
		APIKeyConfigured:      connection.APIKeyConfigured,
		AccessTokenConfigured: connection.AccessTokenConfigured,
		CreatedAt:             connection.CreatedAt,
		UpdatedAt:             connection.UpdatedAt,
	}
}

func ProviderTypeAllowed(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "newapi-compatible", "sub2api-compatible", "openai-compatible", "xai-compatible":
		return true
	default:
		return false
	}
}

func CleanID(value string) string {
	value = strings.TrimSpace(value)
	var builder strings.Builder
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' || char == '.' {
			builder.WriteRune(char)
		}
	}
	if builder.Len() > 160 {
		return builder.String()[:160]
	}
	return builder.String()
}

func validURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && parsed.Host != ""
}
