package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/provider"
)

const maxVideoBytes = 256 << 20

type VideoResult struct {
	Body      []byte
	MediaType string
	TaskID    string
}

type VideoOptions struct {
	ClientRequestID     string
	PollInterval        time.Duration
	MaxTransientRetries int
	OnProgress          func(status string)
}

type videoTask struct {
	ID     string
	Status string
	URL    string
	Error  string
}

func ExecuteVideo(ctx context.Context, plan provider.DispatchPlan, bearerToken string, client *http.Client, options VideoOptions) (VideoResult, error) {
	if err := validateVideoPlan(plan); err != nil {
		return VideoResult{}, err
	}
	if strings.TrimSpace(bearerToken) == "" {
		return VideoResult{}, &Error{Code: "EXECUTOR_BEARER_TOKEN_REQUIRED"}
	}
	if options.PollInterval <= 0 {
		options.PollInterval = 4 * time.Second
	}
	if options.MaxTransientRetries <= 0 {
		options.MaxTransientRetries = 150
	}
	client = noRedirectClient(client)

	var payload map[string]any
	var err error
	if plan.Transport == provider.AdapterOpenAIVideos {
		payload, err = requestMultipart(ctx, client, plan.Endpoint, plan.Body, bearerToken, options.ClientRequestID)
	} else {
		payload, err = requestJSON(ctx, client, http.MethodPost, plan.Endpoint, plan.Body, bearerToken, options.ClientRequestID)
	}
	if err != nil {
		return VideoResult{}, err
	}
	task := normalizeVideoTask(payload)
	if task.ID == "" {
		return VideoResult{}, &Error{Code: "VIDEO_TASK_ID_MISSING"}
	}
	if options.OnProgress != nil {
		options.OnProgress(task.Status)
	}

	transientFailures := 0
	for task.Status != "completed" && task.Status != "failed" {
		if err := waitContext(ctx, options.PollInterval); err != nil {
			return VideoResult{}, &Error{Code: "EXECUTOR_CONTEXT_CANCELED", cause: err}
		}
		retrieveURL := replaceTaskID(plan.RetrieveEndpoint, task.ID)
		payload, err = requestJSON(ctx, client, http.MethodGet, retrieveURL, nil, bearerToken, options.ClientRequestID)
		if err != nil {
			var executionError *Error
			if errors.As(err, &executionError) && transientVideoStatus(executionError.UpstreamStatus) && transientFailures < options.MaxTransientRetries {
				transientFailures++
				if options.OnProgress != nil {
					options.OnProgress("retrying")
				}
				continue
			}
			return VideoResult{}, err
		}
		transientFailures = 0
		next := normalizeVideoTask(payload)
		if next.ID == "" {
			next.ID = task.ID
		}
		task = next
		if options.OnProgress != nil {
			options.OnProgress(task.Status)
		}
	}
	if task.Status == "failed" {
		return VideoResult{}, &Error{Code: "VIDEO_GENERATION_FAILED", UpstreamBody: safeBody([]byte(task.Error), bearerToken)}
	}

	contentURL := strings.TrimSpace(task.URL)
	if contentURL == "" {
		contentURL = replaceTaskID(plan.ContentEndpoint, task.ID)
	}
	contentURL, err = resolveVideoURL(plan.Endpoint, contentURL)
	if err != nil {
		return VideoResult{}, &Error{Code: "VIDEO_GENERATION_RETURNED_NO_VIDEO", cause: err}
	}
	body, mediaType, err := downloadVideo(ctx, client, contentURL, plan.Endpoint, bearerToken, options.ClientRequestID)
	if err != nil {
		return VideoResult{}, err
	}
	return VideoResult{Body: body, MediaType: mediaType, TaskID: task.ID}, nil
}

func requestMultipart(ctx context.Context, client *http.Client, endpoint string, fields map[string]any, token, requestID string) (map[string]any, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if value == nil {
			continue
		}
		if err := writer.WriteField(key, fmt.Sprint(value)); err != nil {
			return nil, &Error{Code: "EXECUTOR_REQUEST_BODY_INVALID", cause: err}
		}
	}
	if err := writer.Close(); err != nil {
		return nil, &Error{Code: "EXECUTOR_REQUEST_BODY_INVALID", cause: err}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, &body)
	if err != nil {
		return nil, &Error{Code: "EXECUTOR_REQUEST_INVALID", cause: err}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	setRequestAffinityHeaders(req, requestID)
	return doJSONRequest(ctx, client, req, token)
}

func validateVideoPlan(plan provider.DispatchPlan) error {
	if plan.Method != http.MethodPost || plan.Route != "video" || (plan.Transport != provider.AdapterOpenAIVideos && plan.Transport != provider.AdapterXAIVideos && plan.Transport != provider.AdapterNewAPITaskVideo) || plan.RetrieveEndpoint == "" {
		return &Error{Code: "EXECUTOR_PLAN_NOT_ALLOWED"}
	}
	if !plan.SecretConfigured {
		return &Error{Code: "EXECUTOR_CREDENTIAL_NOT_CONFIGURED"}
	}
	for _, endpoint := range []string{plan.Endpoint, strings.ReplaceAll(plan.RetrieveEndpoint, "{id}", "task"), strings.ReplaceAll(plan.ContentEndpoint, "{id}", "task")} {
		if endpoint == "" {
			continue
		}
		parsed, err := url.Parse(endpoint)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
			return &Error{Code: "EXECUTOR_ENDPOINT_INVALID"}
		}
	}
	return nil
}

func requestJSON(ctx context.Context, client *http.Client, method, endpoint string, body map[string]any, token, requestID string) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return nil, &Error{Code: "EXECUTOR_REQUEST_BODY_INVALID", cause: err}
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, &Error{Code: "EXECUTOR_REQUEST_INVALID", cause: err}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	setRequestAffinityHeaders(req, requestID)
	return doJSONRequest(ctx, client, req, token)
}

func doJSONRequest(ctx context.Context, client *http.Client, req *http.Request, token string) (map[string]any, error) {
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, &Error{Code: "EXECUTOR_CONTEXT_CANCELED", cause: ctx.Err()}
		}
		return nil, &Error{Code: "EXECUTOR_UPSTREAM_REQUEST_FAILED", cause: err}
	}
	defer resp.Body.Close()
	responseBody, err := readLimited(resp.Body, maxResponseBytes)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, &Error{Code: "EXECUTOR_UPSTREAM_STATUS", UpstreamStatus: resp.StatusCode, UpstreamBody: safeBody(responseBody, token)}
	}
	var payload map[string]any
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		return nil, &Error{Code: "EXECUTOR_UPSTREAM_RESPONSE_INVALID", cause: err}
	}
	return payload, nil
}

func downloadVideo(ctx context.Context, client *http.Client, endpoint, providerEndpoint, token, requestID string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, "", &Error{Code: "EXECUTOR_REQUEST_INVALID", cause: err}
	}
	req.Header.Set("Accept", "video/mp4,application/octet-stream")
	if sameOrigin(endpoint, providerEndpoint) {
		req.Header.Set("Authorization", "Bearer "+token)
		setRequestAffinityHeaders(req, requestID)
	}
	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, "", &Error{Code: "EXECUTOR_CONTEXT_CANCELED", cause: ctx.Err()}
		}
		return nil, "", &Error{Code: "EXECUTOR_UPSTREAM_REQUEST_FAILED", cause: err}
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		responseBody, _ := readLimited(resp.Body, maxErrorBodyBytes)
		return nil, "", &Error{Code: "EXECUTOR_UPSTREAM_STATUS", UpstreamStatus: resp.StatusCode, UpstreamBody: safeBody(responseBody, token)}
	}
	body, err := readLimited(resp.Body, maxVideoBytes)
	if err != nil {
		return nil, "", err
	}
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	if mediaType == "" || mediaType == "application/octet-stream" {
		mediaType = "video/mp4"
	}
	if mediaType != "video/mp4" && mediaType != "video/webm" && mediaType != "video/quicktime" {
		return nil, "", &Error{Code: "VIDEO_ASSET_FORMAT_UNSUPPORTED"}
	}
	return body, mediaType, nil
}

func normalizeVideoTask(payload map[string]any) videoTask {
	source := payload
	if nested, ok := payload["data"].(map[string]any); ok {
		source = nested
	}
	id := firstString(source, "request_id", "requestId", "task_id", "taskId", "id", "video_id", "videoId")
	status := normalizeVideoStatus(firstString(source, "status"))
	video, _ := source["video"].(map[string]any)
	result, _ := source["result"].(map[string]any)
	videoURL := firstString(source, "url", "video_url", "videoUrl", "output_url", "outputUrl", "result_url", "resultUrl")
	if videoURL == "" {
		videoURL = firstString(video, "url", "video_url", "videoUrl")
	}
	if videoURL == "" {
		videoURL = firstString(result, "url", "video_url", "videoUrl")
	}
	errorText := ""
	if value, ok := source["error"].(string); ok {
		errorText = value
	} else if value, ok := source["error"].(map[string]any); ok {
		errorText = firstString(value, "message", "error", "code")
	}
	return videoTask{ID: id, Status: status, URL: videoURL, Error: errorText}
}

func normalizeVideoStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "completed", "succeeded", "success", "done", "finished":
		return "completed"
	case "failed", "fail", "error", "canceled", "cancelled":
		return "failed"
	case "processing", "running", "generating", "in_progress", "in-progress":
		return "in_progress"
	default:
		if strings.TrimSpace(value) == "" {
			return "queued"
		}
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func firstString(source map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := source[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func replaceTaskID(template, taskID string) string {
	return strings.ReplaceAll(template, "{id}", url.PathEscape(taskID))
}

func resolveVideoURL(base, value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", errors.New("video URL is empty")
	}
	baseURL, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	target, err := url.Parse(value)
	if err != nil {
		return "", err
	}
	target = baseURL.ResolveReference(target)
	if (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" || target.User != nil {
		return "", fmt.Errorf("invalid video URL")
	}
	return target.String(), nil
}

func sameOrigin(left, right string) bool {
	a, errA := url.Parse(left)
	b, errB := url.Parse(right)
	return errA == nil && errB == nil && strings.EqualFold(a.Scheme, b.Scheme) && strings.EqualFold(a.Host, b.Host)
}

func setRequestAffinityHeaders(req *http.Request, requestID string) {
	if strings.TrimSpace(requestID) == "" {
		return
	}
	req.Header.Set("X-Client-Request-ID", requestID)
	req.Header.Set("X-Request-ID", requestID)
}

func transientVideoStatus(status int) bool {
	switch status {
	case 404, 408, 409, 425, 429, 500, 502, 503, 504:
		return true
	default:
		return false
	}
}

func waitContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func noRedirectClient(client *http.Client) *http.Client {
	if client == nil {
		client = http.DefaultClient
	}
	copy := *client
	copy.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &copy
}
