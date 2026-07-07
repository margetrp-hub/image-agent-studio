package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/config"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/httpapi"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/store"
)

func main() {
	cfg := config.Load()
	studioStore := store.New(cfg.DataDir)
	server := httpapi.NewServer(cfg, studioStore)

	httpServer := &http.Server{
		Addr:              cfg.Address(),
		Handler:           server,
		ReadHeaderTimeout: 10 * time.Second,
	}

	slog.Info("image-agent-studio go server listening",
		"address", cfg.Address(),
		"dataDir", cfg.DataDir,
		"version", cfg.Version,
	)

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("go server failed", "error", err)
		os.Exit(1)
	}
}
