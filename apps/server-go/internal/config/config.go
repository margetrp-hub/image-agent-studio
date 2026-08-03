package config

import (
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Host                          string
	Port                          string
	DataDir                       string
	Version                       string
	BootstrapToken                string
	AllowedOrigins                []string
	MasterKey                     string
	MasterKeyVersion              string
	AssetMaxBytes                 int64
	RegistrationEnabled           bool
	AllowPrivateProviderURLs      bool
	ExecutionEnabled              bool
	ExecutionTimeoutSeconds       int64
	VideoExecutionTimeoutSeconds  int64
	VideoPollIntervalMS           int64
	VideoPollMaxTransientFailures int
}

func Load() Config {
	dataDir := env("STUDIO_DATA_DIR", "")
	if dataDir == "" {
		dataDir = filepath.Join(".", ".image-agent-studio-go-data")
	}

	return Config{
		Host:                          env("STUDIO_GO_HOST", env("STUDIO_HISTORY_HOST", "127.0.0.1")),
		Port:                          env("STUDIO_GO_PORT", "8788"),
		DataDir:                       filepath.Clean(dataDir),
		Version:                       env("STUDIO_VERSION", "1.0.0-go-dev"),
		BootstrapToken:                strings.TrimSpace(os.Getenv("STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN")),
		AllowedOrigins:                splitCSV(env("STUDIO_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5205,http://localhost:5205")),
		MasterKey:                     strings.TrimSpace(os.Getenv("STUDIO_MASTER_KEY")),
		MasterKeyVersion:              env("STUDIO_MASTER_KEY_VERSION", "v1"),
		AssetMaxBytes:                 envInt64("STUDIO_ASSET_MAX_BYTES", 256<<20),
		RegistrationEnabled:           envBool("STUDIO_REGISTRATION_ENABLED", true),
		AllowPrivateProviderURLs:      envBool("STUDIO_ALLOW_PRIVATE_PROVIDER_URLS", false),
		ExecutionEnabled:              envBool("STUDIO_GO_EXECUTION_ENABLED", false),
		ExecutionTimeoutSeconds:       envInt64("STUDIO_GO_EXECUTION_TIMEOUT_SECONDS", 300),
		VideoExecutionTimeoutSeconds:  envInt64("STUDIO_VIDEO_EXECUTION_TIMEOUT_SECONDS", 1800),
		VideoPollIntervalMS:           envInt64("STUDIO_VIDEO_POLL_INTERVAL_MS", 4000),
		VideoPollMaxTransientFailures: int(envInt64("STUDIO_VIDEO_POLL_MAX_TRANSIENT_FAILURES", 450)),
	}
}

func (c Config) Address() string {
	return net.JoinHostPort(c.Host, c.Port)
}

func (c Config) MasterKeyBytes() ([]byte, error) {
	value := strings.TrimSpace(c.MasterKey)
	if value == "" {
		return nil, errors.New("STUDIO_MASTER_KEY is required")
	}
	for _, encoding := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.URLEncoding, base64.RawURLEncoding} {
		if decoded, err := encoding.DecodeString(value); err == nil && len(decoded) == 32 {
			return decoded, nil
		}
	}
	if decoded, err := hex.DecodeString(value); err == nil && len(decoded) == 32 {
		return decoded, nil
	}
	return nil, errors.New("STUDIO_MASTER_KEY must encode exactly 32 bytes")
}

func env(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimRight(strings.TrimSpace(part), "/")
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

func envInt64(key string, fallback int64) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(os.Getenv(key)), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}
