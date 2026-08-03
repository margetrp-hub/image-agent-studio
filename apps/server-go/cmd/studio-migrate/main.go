package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/migration"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("studio-migrate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	source := flags.String("source", os.Getenv("STUDIO_DATA_DIR"), "legacy STUDIO_DATA_DIR")
	assetRoot := flags.String("asset-root", "", "target content-addressed asset root (default: <source>/studio-go/assets)")
	apply := flags.Bool("apply", false, "write imported assets; the default is dry-run")
	maxBytes := flags.Int64("max-asset-bytes", 0, "maximum bytes per asset (default: 10 GiB)")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "unexpected positional arguments")
		return 2
	}

	report, err := migration.Run(context.Background(), migration.Options{
		SourceRoot:    *source,
		AssetRoot:     *assetRoot,
		Apply:         *apply,
		MaxAssetBytes: *maxBytes,
	})
	if err != nil {
		_ = json.NewEncoder(stderr).Encode(map[string]string{"error": err.Error()})
		return 1
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(report); err != nil {
		fmt.Fprintf(stderr, "encode migration report: %v\n", err)
		return 1
	}
	return 0
}
