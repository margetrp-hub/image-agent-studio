// Package jobevents provides an in-memory event stream for generation jobs.
package jobevents

import (
	"sync"
	"time"
)

// EventType identifies the kind of job event.
type EventType string

const (
	// EventTypeHeartbeat can be published by transports that need keepalive events.
	EventTypeHeartbeat EventType = "heartbeat"
)

// Event is one sequenced event for a user-owned job.
type Event struct {
	Sequence    uint64    `json:"sequence"`
	UserID      string    `json:"userId"`
	JobID       string    `json:"jobId"`
	Type        EventType `json:"type"`
	Data        any       `json:"data,omitempty"`
	PublishedAt time.Time `json:"publishedAt"`
}

// Stream stores bounded replay history and fans events out to subscribers.
// Sequences and replay limits are scoped to each user/job pair.
type Stream struct {
	mu               sync.Mutex
	replayCapacity   int
	subscriberBuffer int
	streams          map[streamKey]*streamState
}

type streamKey struct {
	userID string
	jobID  string
}

type streamState struct {
	nextSequence uint64
	replay       []Event
	subscribers  map[uint64]chan Event
	nextID       uint64
}

// New creates an event stream. Negative capacities are treated as zero.
func New(replayCapacity, subscriberBuffer int) *Stream {
	if replayCapacity < 0 {
		replayCapacity = 0
	}
	if subscriberBuffer < 0 {
		subscriberBuffer = 0
	}

	return &Stream{
		replayCapacity:   replayCapacity,
		subscriberBuffer: subscriberBuffer,
		streams:          make(map[streamKey]*streamState),
	}
}

// Publish assigns the next sequence and delivers an event without waiting for
// slow subscribers. A subscriber whose channel is full misses that live event.
func (s *Stream) Publish(userID, jobID string, eventType EventType, data any) Event {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := streamKey{userID: userID, jobID: jobID}
	state := s.state(key)
	state.nextSequence++
	event := Event{
		Sequence:    state.nextSequence,
		UserID:      userID,
		JobID:       jobID,
		Type:        eventType,
		Data:        data,
		PublishedAt: time.Now().UTC(),
	}

	state.appendReplay(event, s.replayCapacity)
	for _, subscriber := range state.subscribers {
		select {
		case subscriber <- event:
		default:
		}
	}

	return event
}

// Subscribe returns replay events newer than afterSequence followed by live
// events. The unsubscribe function is safe to call more than once and closes
// the returned channel.
func (s *Stream) Subscribe(userID, jobID string, afterSequence uint64) (<-chan Event, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := streamKey{userID: userID, jobID: jobID}
	state := s.state(key)
	replay := state.eventsAfter(afterSequence)
	channel := make(chan Event, len(replay)+s.subscriberBuffer)
	for _, event := range replay {
		channel <- event
	}

	state.nextID++
	subscriberID := state.nextID
	state.subscribers[subscriberID] = channel

	var once sync.Once
	unsubscribe := func() {
		once.Do(func() {
			s.mu.Lock()
			defer s.mu.Unlock()

			state, ok := s.streams[key]
			if !ok {
				return
			}
			if subscriber, ok := state.subscribers[subscriberID]; ok {
				delete(state.subscribers, subscriberID)
				close(subscriber)
			}
		})
	}

	return channel, unsubscribe
}

func (s *Stream) state(key streamKey) *streamState {
	state, ok := s.streams[key]
	if !ok {
		state = &streamState{subscribers: make(map[uint64]chan Event)}
		s.streams[key] = state
	}
	return state
}

func (s *streamState) appendReplay(event Event, capacity int) {
	if capacity == 0 {
		return
	}
	if len(s.replay) == capacity {
		copy(s.replay, s.replay[1:])
		s.replay[len(s.replay)-1] = event
		return
	}
	s.replay = append(s.replay, event)
}

func (s *streamState) eventsAfter(sequence uint64) []Event {
	events := make([]Event, 0, len(s.replay))
	for _, event := range s.replay {
		if event.Sequence > sequence {
			events = append(events, event)
		}
	}
	return events
}
