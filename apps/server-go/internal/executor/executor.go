package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
)

const (
	maxResponseBytes  = 32 << 20
	maxErrorBodyBytes = 4 << 10
)

type Image struct {
	URL     string `json:"url,omitempty"`
	B64JSON string `json:"b64_json,omitempty"`
}

type Result struct {
	Images []Image `json:"data"`
}

var markdownImagePattern = regexp.MustCompile(`!\[[^\]]*\]\((data:image/[^;\s)]+;base64,([A-Za-z0-9+/=\s]+)|https?://[^\s)]+)\)`)

type Error struct {
	Code           string `json:"code"`
	UpstreamStatus int    `json:"upstreamStatus,omitempty"`
	UpstreamBody   string `json:"upstreamBody,omitempty"`
	cause          error
}

func (e *Error) Error() string {
	if e.UpstreamStatus != 0 {
		return fmt.Sprintf("%s: upstream status %d", e.Code, e.UpstreamStatus)
	}
	return e.Code
}

func (e *Error) Unwrap() error {
	return e.cause
}

func Execute(ctx context.Context, plan provider.DispatchPlan, bearerToken string, client *http.Client) (Result, error) {
	if err := validatePlan(plan); err != nil {
		return Result{}, err
	}
	bearerToken = strings.TrimSpace(bearerToken)
	if bearerToken == "" {
		return Result{}, &Error{Code: "EXECUTOR_BEARER_TOKEN_REQUIRED"}
	}

	body, err := json.Marshal(plan.Body)
	if err != nil {
		return Result{}, &Error{Code: "EXECUTOR_REQUEST_BODY_INVALID", cause: err}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, plan.Endpoint, bytes.NewReader(body))
	if err != nil {
		return Result{}, &Error{Code: "EXECUTOR_REQUEST_INVALID", cause: err}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	if client == nil {
		client = http.DefaultClient
	}
	effectiveClient := *client
	effectiveClient.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	resp, err := effectiveClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Result{}, &Error{Code: "EXECUTOR_CONTEXT_CANCELED", cause: ctx.Err()}
		}
		return Result{}, &Error{Code: "EXECUTOR_UPSTREAM_REQUEST_FAILED", cause: err}
	}
	defer resp.Body.Close()

	responseBody, err := readLimited(resp.Body, maxResponseBytes)
	if err != nil {
		return Result{}, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return Result{}, &Error{
			Code:           "EXECUTOR_UPSTREAM_STATUS",
			UpstreamStatus: resp.StatusCode,
			UpstreamBody:   safeBody(responseBody, bearerToken),
		}
	}

	var payload struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return Result{}, &Error{Code: "EXECUTOR_UPSTREAM_RESPONSE_INVALID", cause: err}
	}
	result := Result{Images: make([]Image, 0, len(payload.Data))}
	for _, item := range payload.Data {
		image := Image{URL: strings.TrimSpace(item.URL), B64JSON: strings.TrimSpace(item.B64JSON)}
		if image.URL != "" || image.B64JSON != "" {
			result.Images = append(result.Images, image)
		}
	}
	if plan.Transport == provider.AdapterOpenAIChatImage {
		for _, choice := range payload.Choices {
			result.Images = append(result.Images, imagesFromChatContent(choice.Message.Content)...)
		}
	}
	if len(result.Images) == 0 {
		return Result{}, &Error{Code: "EXECUTOR_UPSTREAM_RESPONSE_EMPTY"}
	}
	return result, nil
}

func validatePlan(plan provider.DispatchPlan) error {
	if plan.Method != http.MethodPost || plan.Route != "generations" {
		return &Error{Code: "EXECUTOR_PLAN_NOT_ALLOWED"}
	}
	allowedSuffix := ""
	switch plan.Transport {
	case provider.AdapterOpenAIImages, provider.AdapterXAIImages:
		allowedSuffix = "/images/generations"
	case provider.AdapterOpenAIChatImage:
		allowedSuffix = "/chat/completions"
	default:
		return &Error{Code: "EXECUTOR_PLAN_NOT_ALLOWED"}
	}
	if !plan.SecretConfigured {
		return &Error{Code: "EXECUTOR_CREDENTIAL_NOT_CONFIGURED"}
	}
	endpoint, err := url.Parse(plan.Endpoint)
	if err != nil || (endpoint.Scheme != "http" && endpoint.Scheme != "https") || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return &Error{Code: "EXECUTOR_ENDPOINT_INVALID"}
	}
	if !strings.HasSuffix(strings.TrimRight(endpoint.EscapedPath(), "/"), allowedSuffix) {
		return &Error{Code: "EXECUTOR_PLAN_NOT_ALLOWED"}
	}
	return nil
}

func imagesFromChatContent(content any) []Image {
	var texts []string
	switch value := content.(type) {
	case string:
		texts = append(texts, value)
	case []any:
		for _, part := range value {
			item, ok := part.(map[string]any)
			if !ok {
				continue
			}
			if text, ok := item["text"].(string); ok {
				texts = append(texts, text)
			}
		}
	}

	var images []Image
	for _, text := range texts {
		for _, match := range markdownImagePattern.FindAllStringSubmatch(text, -1) {
			value := strings.TrimSpace(match[1])
			if strings.HasPrefix(value, "data:image/") {
				images = append(images, Image{B64JSON: strings.Join(strings.Fields(match[2]), "")})
			} else {
				images = append(images, Image{URL: value})
			}
		}
	}
	return images
}

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, &Error{Code: "EXECUTOR_UPSTREAM_READ_FAILED", cause: err}
	}
	if int64(len(body)) > limit {
		return nil, &Error{Code: "EXECUTOR_UPSTREAM_RESPONSE_TOO_LARGE"}
	}
	return body, nil
}

func safeBody(body []byte, bearerToken string) string {
	text := string(body)
	if bearerToken != "" {
		text = strings.ReplaceAll(text, bearerToken, "[REDACTED]")
	}
	if len(text) > maxErrorBodyBytes {
		text = text[:maxErrorBodyBytes]
	}
	return strings.TrimSpace(text)
}

var _ error = (*Error)(nil)
