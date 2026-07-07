package config

import (
	"net"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Host           string
	Port           string
	DataDir        string
	Version        string
	BootstrapToken string
	AllowedOrigins []string
}

func Load() Config {
	dataDir := env("STUDIO_DATA_DIR", "")
	if dataDir == "" {
		dataDir = filepath.Join(".", ".image-agent-studio-go-data")
	}

	return Config{
		Host:           env("STUDIO_GO_HOST", env("STUDIO_HISTORY_HOST", "127.0.0.1")),
		Port:           env("STUDIO_GO_PORT", "8788"),
		DataDir:        filepath.Clean(dataDir),
		Version:        env("STUDIO_VERSION", "1.0.0-go-dev"),
		BootstrapToken: strings.TrimSpace(os.Getenv("STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN")),
		AllowedOrigins: splitCSV(env("STUDIO_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5205,http://localhost:5205")),
	}
}

func (c Config) Address() string {
	return net.JoinHostPort(c.Host, c.Port)
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
