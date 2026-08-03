package store

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	creativeproject "github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/project"
	"github.com/margetrp-hub/image-agent-studio/apps/server-go/internal/providerconnections"
)

const (
	RoleAdmin            = "admin"
	RoleCreator          = "creator"
	StatusActive         = "active"
	StatusPaused         = "paused"
	JobStatusQueued      = "queued"
	JobStatusDispatching = "dispatching"
	JobStatusUpstream    = "upstream"
	JobStatusSaving      = "saving"
	JobStatusCompleted   = "completed"
	JobStatusFailed      = "failed"
	JobStatusCanceled    = "canceled"
)

type Store struct {
	root string
	mu   sync.Mutex
}

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"displayName"`
	Role         string    `json:"role"`
	Status       string    `json:"status"`
	PasswordHash string    `json:"passwordHash"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type PublicUser struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Session struct {
	Token     string    `json:"token"`
	UserID    string    `json:"userId"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type ProviderLink struct {
	ID             string    `json:"id"`
	ProviderType   string    `json:"providerType"`
	Label          string    `json:"label"`
	Enabled        bool      `json:"enabled"`
	BaseURL        string    `json:"baseUrl"`
	ModelBaseURL   string    `json:"modelBaseUrl"`
	AccountMode    string    `json:"accountMode"`
	SecretEnv      string    `json:"secretEnv"`
	AccessTokenEnv string    `json:"accessTokenEnv"`
	SharedEmail    string    `json:"sharedEmail"`
	AllowedRoles   []string  `json:"allowedRoles"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type PublicProviderLink struct {
	ID                    string    `json:"id"`
	ProviderType          string    `json:"providerType"`
	Label                 string    `json:"label"`
	Enabled               bool      `json:"enabled"`
	BaseURL               string    `json:"baseUrl"`
	ModelBaseURL          string    `json:"modelBaseUrl"`
	AccountMode           string    `json:"accountMode"`
	SecretConfigured      bool      `json:"secretConfigured"`
	AccessTokenConfigured bool      `json:"accessTokenConfigured"`
	SharedEmail           string    `json:"sharedEmail"`
	AllowedRoles          []string  `json:"allowedRoles"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

type UserAsset struct {
	Digest    string    `json:"digest"`
	Filename  string    `json:"filename,omitempty"`
	MediaType string    `json:"mediaType,omitempty"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

type HistoryPage struct {
	Records    []map[string]any `json:"records"`
	Total      int              `json:"total"`
	NextOffset any              `json:"nextOffset"`
}

type GenerationJob struct {
	ID          string         `json:"id"`
	SessionID   string         `json:"sessionId"`
	Status      string         `json:"status"`
	Stage       string         `json:"stage"`
	Mode        string         `json:"mode"`
	Route       string         `json:"route"`
	ProviderID  string         `json:"providerId"`
	Model       string         `json:"model"`
	Prompt      string         `json:"prompt"`
	Fingerprint string         `json:"fingerprint"`
	Request     map[string]any `json:"request,omitempty"`
	Error       map[string]any `json:"error,omitempty"`
	ResultURLs  []string       `json:"resultUrls"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	CompletedAt *time.Time     `json:"completedAt,omitempty"`
}

type JobPage struct {
	Jobs       []GenerationJob `json:"jobs"`
	Total      int             `json:"total"`
	NextOffset any             `json:"nextOffset"`
}

func New(root string) *Store {
	return &Store{root: root}
}

func (s *Store) UserCount() (int, error) {
	users, err := s.ListUsers()
	if err != nil {
		return 0, err
	}
	return len(users), nil
}

func (s *Store) ListUsers() ([]User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (s *Store) CreateUser(email, password, displayName, role string) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return User{}, err
	}

	email = normalizeEmail(email)
	if email == "" {
		return User{}, errors.New("EMAIL_REQUIRED")
	}
	if len(password) < 8 {
		return User{}, errors.New("PASSWORD_TOO_SHORT")
	}
	for _, user := range users {
		if normalizeEmail(user.Email) == email {
			return User{}, errors.New("EMAIL_ALREADY_EXISTS")
		}
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}

	now := time.Now().UTC()
	user := User{
		ID:           newID("usr"),
		Email:        email,
		DisplayName:  strings.TrimSpace(displayName),
		Role:         normalizeRole(role),
		Status:       StatusActive,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	users = append(users, user)
	return user, writeJSON(s.usersPath(), users)
}

func (s *Store) UpdateUser(id string, patch map[string]any) (User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return User{}, err
	}
	for index := range users {
		if users[index].ID != id {
			continue
		}
		if value, ok := patch["displayName"].(string); ok {
			users[index].DisplayName = strings.TrimSpace(value)
		}
		if value, ok := patch["role"].(string); ok {
			users[index].Role = normalizeRole(value)
		}
		if value, ok := patch["status"].(string); ok {
			users[index].Status = normalizeStatus(value)
		}
		if value, ok := patch["password"].(string); ok && value != "" {
			if len(value) < 8 {
				return User{}, errors.New("PASSWORD_TOO_SHORT")
			}
			hash, err := HashPassword(value)
			if err != nil {
				return User{}, err
			}
			users[index].PasswordHash = hash
		}
		users[index].UpdatedAt = time.Now().UTC()
		return users[index], writeJSON(s.usersPath(), users)
	}
	return User{}, errors.New("USER_NOT_FOUND")
}

func (s *Store) Login(email, password string) (Session, PublicUser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return Session{}, PublicUser{}, err
	}

	for _, user := range users {
		if normalizeEmail(user.Email) != normalizeEmail(email) {
			continue
		}
		if user.Status != StatusActive {
			return Session{}, PublicUser{}, errors.New("USER_DISABLED")
		}
		if !VerifyPassword(user.PasswordHash, password) {
			return Session{}, PublicUser{}, errors.New("INVALID_CREDENTIALS")
		}
		session := Session{
			Token:     randomToken(),
			UserID:    user.ID,
			CreatedAt: time.Now().UTC(),
			ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour),
		}
		var sessions []Session
		if err := readJSON(s.sessionsPath(), &sessions); err != nil {
			return Session{}, PublicUser{}, err
		}
		sessions = append(activeSessions(sessions), session)
		return session, Public(user), writeJSON(s.sessionsPath(), sessions)
	}
	return Session{}, PublicUser{}, errors.New("INVALID_CREDENTIALS")
}

func (s *Store) Authenticate(token string) (PublicUser, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var sessions []Session
	if err := readJSON(s.sessionsPath(), &sessions); err != nil {
		return PublicUser{}, false, err
	}
	var users []User
	if err := readJSON(s.usersPath(), &users); err != nil {
		return PublicUser{}, false, err
	}

	now := time.Now().UTC()
	for _, session := range sessions {
		if session.Token != token || session.ExpiresAt.Before(now) {
			continue
		}
		for _, user := range users {
			if user.ID == session.UserID && user.Status == StatusActive {
				return Public(user), true, nil
			}
		}
	}
	return PublicUser{}, false, nil
}

func (s *Store) Logout(token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var sessions []Session
	if err := readJSON(s.sessionsPath(), &sessions); err != nil {
		return err
	}
	next := sessions[:0]
	for _, session := range sessions {
		if session.Token != token {
			next = append(next, session)
		}
	}
	return writeJSON(s.sessionsPath(), next)
}

func (s *Store) ListProviderLinks() ([]ProviderLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var links []ProviderLink
	if err := readJSON(s.providerLinksPath(), &links); err != nil {
		return nil, err
	}
	return links, nil
}

func (s *Store) ListProviderLinksForUser(user PublicUser) ([]ProviderLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var links []ProviderLink
	if err := readJSON(s.providerLinksPath(), &links); err != nil {
		return nil, err
	}
	out := make([]ProviderLink, 0, len(links))
	for _, link := range links {
		if ProviderLinkAllowsUser(link, user) {
			out = append(out, normalizeProviderLink(link))
		}
	}
	return out, nil
}

func (s *Store) GetProviderLinkForUser(user PublicUser, providerID string) (ProviderLink, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	providerID = cleanID(strings.ToLower(strings.TrimSpace(providerID)))
	var links []ProviderLink
	if err := readJSON(s.providerLinksPath(), &links); err != nil {
		return ProviderLink{}, false, err
	}
	for _, link := range links {
		link = normalizeProviderLink(link)
		if link.ID == providerID && ProviderLinkAllowsUser(link, user) {
			return link, true, nil
		}
	}
	return ProviderLink{}, false, nil
}

func (s *Store) UpsertProviderLink(link ProviderLink) (ProviderLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	link = normalizeProviderLink(link)
	if link.ID == "" {
		return ProviderLink{}, errors.New("PROVIDER_LINK_ID_REQUIRED")
	}
	if !providerTypeAllowed(link.ProviderType) {
		return ProviderLink{}, errors.New("PROVIDER_TYPE_NOT_SUPPORTED")
	}

	var links []ProviderLink
	if err := readJSON(s.providerLinksPath(), &links); err != nil {
		return ProviderLink{}, err
	}

	now := time.Now().UTC()
	link.UpdatedAt = now
	for index := range links {
		if links[index].ID == link.ID {
			link.CreatedAt = links[index].CreatedAt
			if link.CreatedAt.IsZero() {
				link.CreatedAt = now
			}
			links[index] = link
			return link, writeJSON(s.providerLinksPath(), links)
		}
	}
	link.CreatedAt = now
	links = append(links, link)
	return link, writeJSON(s.providerLinksPath(), links)
}

func (s *Store) ListProviderConnections(user PublicUser) ([]providerconnections.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connections, err := s.readProviderConnections(user)
	if err != nil {
		return nil, err
	}
	sort.Slice(connections, func(left, right int) bool {
		return connections[left].UpdatedAt.After(connections[right].UpdatedAt)
	})
	return connections, nil
}

func (s *Store) GetProviderConnection(user PublicUser, connectionID string) (providerconnections.Connection, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connections, err := s.readProviderConnections(user)
	if err != nil {
		return providerconnections.Connection{}, false, err
	}
	connectionID = providerconnections.CleanID(connectionID)
	for _, connection := range connections {
		if connection.ID == connectionID {
			return connection, true, nil
		}
	}
	return providerconnections.Connection{}, false, nil
}

func (s *Store) CreateProviderConnection(user PublicUser, connection providerconnections.Connection) (providerconnections.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connection = providerconnections.Normalize(connection)
	connection.OwnerID = user.ID
	if err := providerconnections.Validate(connection); err != nil {
		return providerconnections.Connection{}, err
	}
	connections, err := s.readProviderConnections(user)
	if err != nil {
		return providerconnections.Connection{}, err
	}
	for _, existing := range connections {
		if existing.ID == connection.ID {
			return providerconnections.Connection{}, errors.New("PROVIDER_CONNECTION_ALREADY_EXISTS")
		}
	}
	now := time.Now().UTC()
	connection.CreatedAt = now
	connection.UpdatedAt = now
	connections = append(connections, connection)
	return connection, writeJSON(s.providerConnectionsPath(user.ID), connections)
}

func (s *Store) UpdateProviderConnection(user PublicUser, connectionID string, connection providerconnections.Connection) (providerconnections.Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	connections, err := s.readProviderConnections(user)
	if err != nil {
		return providerconnections.Connection{}, err
	}
	connectionID = providerconnections.CleanID(connectionID)
	for index, existing := range connections {
		if existing.ID != connectionID {
			continue
		}
		connection = providerconnections.Normalize(connection)
		connection.ID = existing.ID
		connection.OwnerID = user.ID
		connection.CreatedAt = existing.CreatedAt
		connection.UpdatedAt = time.Now().UTC()
		if err := providerconnections.Validate(connection); err != nil {
			return providerconnections.Connection{}, err
		}
		connections[index] = connection
		return connection, writeJSON(s.providerConnectionsPath(user.ID), connections)
	}
	return providerconnections.Connection{}, errors.New("PROVIDER_CONNECTION_NOT_FOUND")
}

func (s *Store) DeleteProviderConnection(user PublicUser, connectionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	connections, err := s.readProviderConnections(user)
	if err != nil {
		return err
	}
	connectionID = providerconnections.CleanID(connectionID)
	next := make([]providerconnections.Connection, 0, len(connections))
	found := false
	for _, connection := range connections {
		if connection.ID == connectionID {
			found = true
			continue
		}
		next = append(next, connection)
	}
	if !found {
		return errors.New("PROVIDER_CONNECTION_NOT_FOUND")
	}
	return writeJSON(s.providerConnectionsPath(user.ID), next)
}

func (s *Store) readProviderConnections(user PublicUser) ([]providerconnections.Connection, error) {
	var connections []providerconnections.Connection
	if err := readJSON(s.providerConnectionsPath(user.ID), &connections); err != nil {
		return nil, err
	}
	for index := range connections {
		connections[index] = providerconnections.Normalize(connections[index])
		if connections[index].OwnerID != user.ID {
			return nil, errors.New("PROVIDER_CONNECTION_OWNER_MISMATCH")
		}
		if err := providerconnections.Validate(connections[index]); err != nil {
			return nil, err
		}
	}
	return connections, nil
}

func (s *Store) ListUserAssets(user PublicUser) ([]UserAsset, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var items []UserAsset
	if err := readJSON(s.userAssetsPath(user.ID), &items); err != nil {
		return nil, err
	}
	sort.Slice(items, func(left, right int) bool {
		return items[left].CreatedAt.After(items[right].CreatedAt)
	})
	return items, nil
}

func (s *Store) AttachUserAsset(user PublicUser, item UserAsset) (UserAsset, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.Digest = strings.ToLower(strings.TrimSpace(item.Digest))
	if len(item.Digest) != sha256.Size*2 {
		return UserAsset{}, errors.New("ASSET_DIGEST_INVALID")
	}
	if _, err := hex.DecodeString(item.Digest); err != nil {
		return UserAsset{}, errors.New("ASSET_DIGEST_INVALID")
	}
	item.Filename = strings.TrimSpace(item.Filename)
	item.MediaType = strings.TrimSpace(item.MediaType)
	if item.Size < 0 {
		return UserAsset{}, errors.New("ASSET_SIZE_INVALID")
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now().UTC()
	}

	var items []UserAsset
	if err := readJSON(s.userAssetsPath(user.ID), &items); err != nil {
		return UserAsset{}, err
	}
	for _, existing := range items {
		if existing.Digest == item.Digest {
			return existing, nil
		}
	}
	items = append(items, item)
	return item, writeJSON(s.userAssetsPath(user.ID), items)
}

func (s *Store) UserCanAccessAsset(user PublicUser, digest string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	digest = strings.ToLower(strings.TrimSpace(digest))
	var items []UserAsset
	if err := readJSON(s.userAssetsPath(user.ID), &items); err != nil {
		return false, err
	}
	for _, item := range items {
		if item.Digest == digest {
			return true, nil
		}
	}
	return false, nil
}

func (s *Store) ListProjects(user PublicUser) ([]creativeproject.Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.projectsDir(user.ID))
	if errors.Is(err, os.ErrNotExist) {
		return []creativeproject.Project{}, nil
	}
	if err != nil {
		return nil, err
	}

	projects := make([]creativeproject.Project, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		var item creativeproject.Project
		if err := readJSON(filepath.Join(s.projectsDir(user.ID), entry.Name()), &item); err != nil {
			return nil, err
		}
		if item.OwnerID != user.ID {
			return nil, errors.New("PROJECT_OWNER_MISMATCH")
		}
		if err := item.Validate(); err != nil {
			return nil, err
		}
		projects = append(projects, item)
	}
	sort.Slice(projects, func(left, right int) bool {
		return projects[left].UpdatedAt.After(projects[right].UpdatedAt)
	})
	return projects, nil
}

func (s *Store) GetProject(user PublicUser, projectID string) (creativeproject.Project, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readProject(user, projectID)
}

func (s *Store) CreateProject(user PublicUser, item creativeproject.Project) (creativeproject.Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = cleanID(item.ID)
	if item.ID == "" {
		item.ID = newID("prj")
	}
	if _, found, err := s.readProject(user, item.ID); err != nil {
		return creativeproject.Project{}, err
	} else if found {
		return creativeproject.Project{}, errors.New("PROJECT_ALREADY_EXISTS")
	}

	now := time.Now().UTC()
	item.OwnerID = user.ID
	item.Status = creativeproject.ProjectStatusDraft
	item.CreatedAt = now
	item.UpdatedAt = now
	item.ArchivedAt = nil
	if err := item.Validate(); err != nil {
		return creativeproject.Project{}, err
	}
	return item, writeJSON(s.projectPath(user.ID, item.ID), item)
}

func (s *Store) UpdateProject(user PublicUser, projectID string, item creativeproject.Project) (creativeproject.Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, found, err := s.readProject(user, projectID)
	if err != nil {
		return creativeproject.Project{}, err
	}
	if !found {
		return creativeproject.Project{}, errors.New("PROJECT_NOT_FOUND")
	}
	item.ID = existing.ID
	item.OwnerID = existing.OwnerID
	item.CreatedAt = existing.CreatedAt
	item.UpdatedAt = time.Now().UTC()
	if item.Status == "" {
		item.Status = existing.Status
	}
	if !creativeproject.CanTransitionProject(existing.Status, item.Status) {
		return creativeproject.Project{}, errors.New("PROJECT_STATUS_TRANSITION_NOT_ALLOWED")
	}
	if item.Status == creativeproject.ProjectStatusArchived && item.ArchivedAt == nil {
		archivedAt := item.UpdatedAt
		item.ArchivedAt = &archivedAt
	}
	if item.Status != creativeproject.ProjectStatusArchived {
		item.ArchivedAt = nil
	}
	if err := item.Validate(); err != nil {
		return creativeproject.Project{}, err
	}
	return item, writeJSON(s.projectPath(user.ID, item.ID), item)
}

func (s *Store) ArchiveProject(user PublicUser, projectID string) (creativeproject.Project, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, found, err := s.readProject(user, projectID)
	if err != nil {
		return creativeproject.Project{}, err
	}
	if !found {
		return creativeproject.Project{}, errors.New("PROJECT_NOT_FOUND")
	}
	if err := item.Transition(creativeproject.ProjectStatusArchived, time.Now().UTC()); err != nil {
		return creativeproject.Project{}, err
	}
	return item, writeJSON(s.projectPath(user.ID, item.ID), item)
}

func (s *Store) readProject(user PublicUser, projectID string) (creativeproject.Project, bool, error) {
	projectID = cleanID(projectID)
	if projectID == "" {
		return creativeproject.Project{}, false, nil
	}
	path := s.projectPath(user.ID, projectID)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return creativeproject.Project{}, false, nil
	} else if err != nil {
		return creativeproject.Project{}, false, err
	}
	var item creativeproject.Project
	if err := readJSON(path, &item); err != nil {
		return creativeproject.Project{}, false, err
	}
	if item.OwnerID != user.ID {
		return creativeproject.Project{}, false, errors.New("PROJECT_OWNER_MISMATCH")
	}
	if err := item.Validate(); err != nil {
		return creativeproject.Project{}, false, err
	}
	return item, true, nil
}

func (s *Store) ReadStudioSession(user PublicUser, sessionID string) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var session map[string]any
	if err := readJSON(s.sessionPath(user.ID, sessionID), &session); err != nil {
		return nil, err
	}
	if session == nil {
		return nil, nil
	}
	return session, nil
}

func (s *Store) WriteStudioSession(user PublicUser, sessionID string, session map[string]any) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session == nil {
		session = map[string]any{}
	}
	session = stripSecrets(session)
	if sessionID == "" {
		sessionID, _ = session["sessionId"].(string)
	}
	if sessionID != "" {
		session["sessionId"] = cleanID(sessionID)
	}
	session["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	return session, writeJSON(s.sessionPath(user.ID, sessionID), session)
}

func (s *Store) DeleteStudioSession(user PublicUser, sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	err := os.Remove(s.sessionPath(user.ID, sessionID))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *Store) ListHistory(user PublicUser, limit int, offset int) (HistoryPage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var records []map[string]any
	if err := readJSON(s.recordsPath(user.ID), &records); err != nil {
		return HistoryPage{}, err
	}
	if limit <= 0 || limit > 200 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	total := len(records)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	var next any
	if end < total {
		next = end
	}
	return HistoryPage{
		Records:    records[offset:end],
		Total:      total,
		NextOffset: next,
	}, nil
}

func (s *Store) AppendHistory(user PublicUser, record map[string]any, historyLimit int) (map[string]any, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if record == nil {
		record = map[string]any{}
	}
	record = stripSecrets(record)
	id, _ := record["id"].(string)
	id = cleanID(id)
	if id == "" {
		id = newID("rec")
	}
	record["id"] = id
	if _, ok := record["createdAt"].(string); !ok {
		record["createdAt"] = time.Now().UTC().Format(time.RFC3339)
	}
	record["updatedAt"] = time.Now().UTC().Format(time.RFC3339)

	var records []map[string]any
	if err := readJSON(s.recordsPath(user.ID), &records); err != nil {
		return nil, err
	}
	next := []map[string]any{record}
	for _, item := range records {
		if itemID, _ := item["id"].(string); itemID != id {
			next = append(next, item)
		}
	}
	if historyLimit <= 0 || historyLimit > 1000 {
		historyLimit = 200
	}
	if len(next) > historyLimit {
		next = next[:historyLimit]
	}
	return record, writeJSON(s.recordsPath(user.ID), next)
}

func (s *Store) DeleteHistory(user PublicUser, recordID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	recordID = cleanID(recordID)
	if recordID == "" {
		return errors.New("RECORD_ID_REQUIRED")
	}
	var records []map[string]any
	if err := readJSON(s.recordsPath(user.ID), &records); err != nil {
		return err
	}
	next := records[:0]
	for _, item := range records {
		if itemID, _ := item["id"].(string); itemID != recordID {
			next = append(next, item)
		}
	}
	return writeJSON(s.recordsPath(user.ID), next)
}

func (s *Store) ClearHistory(user PublicUser) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeJSON(s.recordsPath(user.ID), []map[string]any{})
}

func (s *Store) ListJobs(user PublicUser, sessionID string, limit int, offset int) (JobPage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return JobPage{}, err
	}
	filtered := make([]GenerationJob, 0, len(jobs))
	for _, job := range jobs {
		if sessionID == "" || job.SessionID == sessionID {
			filtered = append(filtered, job)
		}
	}
	if limit <= 0 || limit > 200 {
		limit = 40
	}
	if offset < 0 {
		offset = 0
	}
	total := len(filtered)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	var next any
	if end < total {
		next = end
	}
	return JobPage{Jobs: filtered[offset:end], Total: total, NextOffset: next}, nil
}

func (s *Store) CreateJob(user PublicUser, body map[string]any, jobLimit int) (GenerationJob, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	request, _ := body["request"].(map[string]any)
	request = stripSecrets(request)
	if request == nil {
		request = map[string]any{}
	}

	job := generationJobFromRequest(request)
	if job.ID == "" {
		job.ID = newID("job")
	}
	now := time.Now().UTC()
	job.Status = JobStatusQueued
	job.Stage = JobStatusQueued
	job.Request = request
	job.CreatedAt = now
	job.UpdatedAt = now

	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, err
	}
	if job.Fingerprint != "" {
		for _, existing := range jobs {
			if existing.SessionID == job.SessionID && existing.Fingerprint == job.Fingerprint && jobIsActive(existing.Status) {
				return existing, true, nil
			}
		}
	}

	next := append([]GenerationJob{job}, jobs...)
	if jobLimit <= 0 || jobLimit > 1000 {
		jobLimit = 120
	}
	if len(next) > jobLimit {
		next = next[:jobLimit]
	}
	return job, false, writeJSON(s.jobsPath(user.ID), next)
}

func (s *Store) GetJob(user PublicUser, jobID string) (GenerationJob, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	jobID = cleanID(jobID)
	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, err
	}
	for _, job := range jobs {
		if job.ID == jobID {
			return job, true, nil
		}
	}
	return GenerationJob{}, false, nil
}

func (s *Store) CancelJob(user PublicUser, jobID string) (GenerationJob, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	jobID = cleanID(jobID)
	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, err
	}
	now := time.Now().UTC()
	for index := range jobs {
		if jobs[index].ID != jobID {
			continue
		}
		if jobIsActive(jobs[index].Status) {
			jobs[index].Status = JobStatusCanceled
			jobs[index].Stage = JobStatusCanceled
			jobs[index].UpdatedAt = now
			jobs[index].CompletedAt = &now
			jobs[index].Error = map[string]any{
				"code":    "JOB_CANCELED",
				"message": "The job was canceled by the user.",
			}
		}
		return jobs[index], true, writeJSON(s.jobsPath(user.ID), jobs)
	}
	return GenerationJob{}, false, nil
}

func (s *Store) TransitionJob(user PublicUser, jobID, nextStatus string, resultURLs []string, jobError map[string]any) (GenerationJob, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	jobID = cleanID(jobID)
	var jobs []GenerationJob
	if err := readJSON(s.jobsPath(user.ID), &jobs); err != nil {
		return GenerationJob{}, false, err
	}
	now := time.Now().UTC()
	for index := range jobs {
		if jobs[index].ID != jobID {
			continue
		}
		if !canTransitionJob(jobs[index].Status, nextStatus) {
			return GenerationJob{}, true, errors.New("JOB_STATUS_TRANSITION_NOT_ALLOWED")
		}
		jobs[index].Status = nextStatus
		jobs[index].Stage = nextStatus
		jobs[index].UpdatedAt = now
		jobs[index].ResultURLs = append([]string(nil), resultURLs...)
		if jobError != nil {
			jobs[index].Error = stripSecrets(jobError)
		} else {
			jobs[index].Error = nil
		}
		if nextStatus == JobStatusCompleted || nextStatus == JobStatusFailed || nextStatus == JobStatusCanceled {
			jobs[index].CompletedAt = &now
		} else {
			jobs[index].CompletedAt = nil
		}
		return jobs[index], true, writeJSON(s.jobsPath(user.ID), jobs)
	}
	return GenerationJob{}, false, nil
}

func Public(user User) PublicUser {
	return PublicUser{
		ID:          user.ID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		Role:        user.Role,
		Status:      user.Status,
		CreatedAt:   user.CreatedAt,
		UpdatedAt:   user.UpdatedAt,
	}
}

func PublicProvider(link ProviderLink) PublicProviderLink {
	return PublicProviderLink{
		ID:                    link.ID,
		ProviderType:          link.ProviderType,
		Label:                 link.Label,
		Enabled:               link.Enabled,
		BaseURL:               link.BaseURL,
		ModelBaseURL:          link.ModelBaseURL,
		AccountMode:           link.AccountMode,
		SecretConfigured:      link.SecretEnv != "" && os.Getenv(link.SecretEnv) != "",
		AccessTokenConfigured: link.AccessTokenEnv != "" && os.Getenv(link.AccessTokenEnv) != "",
		SharedEmail:           link.SharedEmail,
		AllowedRoles:          append([]string(nil), link.AllowedRoles...),
		CreatedAt:             link.CreatedAt,
		UpdatedAt:             link.UpdatedAt,
	}
}

func ProviderLinkAllowsUser(link ProviderLink, user PublicUser) bool {
	if !link.Enabled || user.Status != StatusActive {
		return false
	}
	role := normalizeRole(user.Role)
	if len(link.AllowedRoles) == 0 {
		return true
	}
	for _, allowed := range link.AllowedRoles {
		if normalizeRole(allowed) == role {
			return true
		}
	}
	return false
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	iterations := 120000
	key := pbkdf2Key([]byte(password), salt, iterations, 32)
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", iterations, base64.RawURLEncoding.EncodeToString(salt), base64.RawURLEncoding.EncodeToString(key)), nil
}

func VerifyPassword(encoded string, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	var iterations int
	if _, err := fmt.Sscanf(parts[1], "%d", &iterations); err != nil || iterations < 10000 {
		return false
	}
	salt, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	expected, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	actual := pbkdf2Key([]byte(password), salt, iterations, len(expected))
	return hmac.Equal(actual, expected)
}

func pbkdf2Key(password, salt []byte, iterations int, keyLen int) []byte {
	hashLen := sha256.Size
	blocks := (keyLen + hashLen - 1) / hashLen
	out := make([]byte, 0, blocks*hashLen)
	for block := 1; block <= blocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iterations; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeRole(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case RoleAdmin:
		return RoleAdmin
	default:
		return RoleCreator
	}
}

func normalizeStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case StatusPaused:
		return StatusPaused
	default:
		return StatusActive
	}
}

func normalizeProviderLink(link ProviderLink) ProviderLink {
	link.ID = strings.ToLower(strings.TrimSpace(link.ID))
	link.ProviderType = strings.ToLower(strings.TrimSpace(link.ProviderType))
	link.Label = strings.TrimSpace(link.Label)
	link.BaseURL = strings.TrimRight(strings.TrimSpace(link.BaseURL), "/")
	link.ModelBaseURL = strings.TrimRight(strings.TrimSpace(link.ModelBaseURL), "/")
	link.AccountMode = strings.ToLower(strings.TrimSpace(link.AccountMode))
	link.SecretEnv = strings.TrimSpace(link.SecretEnv)
	link.AccessTokenEnv = strings.TrimSpace(link.AccessTokenEnv)
	link.SharedEmail = normalizeEmail(link.SharedEmail)
	if link.AccountMode == "" {
		link.AccountMode = "shared-api-key"
	}
	if link.ModelBaseURL == "" {
		link.ModelBaseURL = link.BaseURL
	}
	if len(link.AllowedRoles) == 0 {
		link.AllowedRoles = []string{RoleAdmin, RoleCreator}
	}
	for index, role := range link.AllowedRoles {
		link.AllowedRoles[index] = normalizeRole(role)
	}
	return link
}

func providerTypeAllowed(value string) bool {
	switch value {
	case "newapi-compatible", "sub2api-compatible", "openai-compatible", "xai-compatible":
		return true
	default:
		return false
	}
}

func stripSecrets(value map[string]any) map[string]any {
	out := make(map[string]any, len(value))
	for key, item := range value {
		lowerKey := strings.ToLower(key)
		if lowerKey == "apikey" || lowerKey == "api_key" || lowerKey == "token" || lowerKey == "accesstoken" || lowerKey == "refreshtoken" || lowerKey == "password" {
			continue
		}
		switch nested := item.(type) {
		case map[string]any:
			out[key] = stripSecrets(nested)
		case []any:
			out[key] = stripSecretList(nested)
		default:
			out[key] = item
		}
	}
	return out
}

func stripSecretList(items []any) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		if nested, ok := item.(map[string]any); ok {
			out = append(out, stripSecrets(nested))
			continue
		}
		out = append(out, item)
	}
	return out
}

func generationJobFromRequest(request map[string]any) GenerationJob {
	return GenerationJob{
		ID:          cleanID(stringFromMap(request, "id")),
		SessionID:   cleanID(stringFromMap(request, "sessionId")),
		Mode:        stringFromMap(request, "mode"),
		Route:       stringFromMap(request, "route"),
		ProviderID:  stringFromMap(request, "providerId"),
		Model:       stringFromMap(request, "model"),
		Prompt:      stringFromMap(request, "prompt"),
		Fingerprint: stringFromMap(request, "fingerprint"),
		ResultURLs:  []string{},
	}
}

func stringFromMap(source map[string]any, key string) string {
	value, _ := source[key].(string)
	return strings.TrimSpace(value)
}

func jobIsActive(status string) bool {
	switch status {
	case "queued", "dispatching", "gateway", "upstream", "image", "saving":
		return true
	default:
		return false
	}
}

func canTransitionJob(current, next string) bool {
	if current == next {
		return true
	}
	if next == JobStatusCanceled {
		return jobIsActive(current)
	}
	if next == JobStatusFailed {
		return current == JobStatusDispatching || current == JobStatusUpstream || current == JobStatusSaving
	}
	switch current {
	case JobStatusQueued:
		return next == JobStatusDispatching
	case JobStatusDispatching:
		return next == JobStatusUpstream
	case JobStatusUpstream:
		return next == JobStatusSaving || next == JobStatusCompleted
	case JobStatusSaving:
		return next == JobStatusCompleted
	default:
		return false
	}
}

func cleanID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
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

func activeSessions(sessions []Session) []Session {
	now := time.Now().UTC()
	out := make([]Session, 0, len(sessions))
	for _, session := range sessions {
		if session.ExpiresAt.After(now) {
			out = append(out, session)
		}
	}
	return out
}

func randomToken() string {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(data)
}

func newID(prefix string) string {
	data := make([]byte, 16)
	if _, err := rand.Read(data); err != nil {
		panic(err)
	}
	return prefix + "_" + hex.EncodeToString(data)
}

func readJSON(file string, target any) error {
	body, err := os.ReadFile(file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	return json.Unmarshal(body, target)
}

func writeJSON(file string, value any) error {
	if err := os.MkdirAll(filepath.Dir(file), 0o750); err != nil {
		return err
	}
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp := file + ".tmp"
	if err := os.WriteFile(tmp, append(body, '\n'), 0o640); err != nil {
		return err
	}
	return os.Rename(tmp, file)
}

func (s *Store) usersPath() string {
	return filepath.Join(s.root, "studio-go", "auth", "users.json")
}

func (s *Store) sessionsPath() string {
	return filepath.Join(s.root, "studio-go", "auth", "sessions.json")
}

func (s *Store) providerLinksPath() string {
	return filepath.Join(s.root, "studio-go", "config", "provider-links.json")
}

func (s *Store) providerConnectionsPath(userID string) string {
	return filepath.Join(s.userDataDir(userID), "provider-connections.json")
}

func (s *Store) userAssetsPath(userID string) string {
	return filepath.Join(s.userDataDir(userID), "assets.json")
}

func (s *Store) userKey(userID string) string {
	sum := sha256.Sum256([]byte("studio:" + userID))
	return hex.EncodeToString(sum[:])
}

func (s *Store) userDataDir(userID string) string {
	return filepath.Join(s.root, "users", s.userKey(userID))
}

func (s *Store) sessionPath(userID string, sessionID string) string {
	sessionID = cleanID(sessionID)
	if sessionID == "" {
		return filepath.Join(s.userDataDir(userID), "session.json")
	}
	return filepath.Join(s.userDataDir(userID), "sessions", sessionID+".json")
}

func (s *Store) recordsPath(userID string) string {
	return filepath.Join(s.userDataDir(userID), "records.json")
}

func (s *Store) jobsPath(userID string) string {
	return filepath.Join(s.userDataDir(userID), "jobs.json")
}

func (s *Store) projectsDir(userID string) string {
	return filepath.Join(s.userDataDir(userID), "projects")
}

func (s *Store) projectPath(userID, projectID string) string {
	return filepath.Join(s.projectsDir(userID), cleanID(projectID)+".json")
}
