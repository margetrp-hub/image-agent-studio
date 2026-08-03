package jobevents

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestSubscriptionsAreIsolatedAndSequencesArePerJob(t *testing.T) {
	stream := New(4, 2)
	firstEvents, unsubscribeFirst := stream.Subscribe("user-1", "job-1", 0)
	defer unsubscribeFirst()
	secondEvents, unsubscribeSecond := stream.Subscribe("user-2", "job-1", 0)
	defer unsubscribeSecond()

	first := stream.Publish("user-1", "job-1", "progress", map[string]any{"percent": 25})
	second := stream.Publish("user-1", "job-1", "progress", map[string]any{"percent": 50})
	other := stream.Publish("user-2", "job-1", "progress", nil)

	if first.Sequence != 1 || second.Sequence != 2 || other.Sequence != 1 {
		t.Fatalf("unexpected per-job sequences: first=%d second=%d other=%d", first.Sequence, second.Sequence, other.Sequence)
	}
	if got := receive(t, firstEvents); got.UserID != "user-1" || got.JobID != "job-1" || got.Sequence != 1 {
		t.Fatalf("unexpected first event: %#v", got)
	}
	if got := receive(t, firstEvents); got.Sequence != 2 {
		t.Fatalf("unexpected second event: %#v", got)
	}
	if got := receive(t, secondEvents); got.UserID != "user-2" || got.Sequence != 1 {
		t.Fatalf("unexpected isolated event: %#v", got)
	}
	assertNoEvent(t, secondEvents)
}

func TestSubscribeReplaysOnlyBoundedEventsAfterSequence(t *testing.T) {
	stream := New(3, 1)
	for index := 1; index <= 5; index++ {
		stream.Publish("user-1", "job-1", "progress", index)
	}
	stream.Publish("user-1", "job-2", "progress", "unrelated")

	events, unsubscribe := stream.Subscribe("user-1", "job-1", 3)
	defer unsubscribe()

	for _, want := range []uint64{4, 5} {
		if got := receive(t, events); got.Sequence != want {
			t.Fatalf("replayed sequence = %d, want %d", got.Sequence, want)
		}
	}
	assertNoEvent(t, events)

	allRetained, unsubscribeAll := stream.Subscribe("user-1", "job-1", 0)
	defer unsubscribeAll()
	for _, want := range []uint64{3, 4, 5} {
		if got := receive(t, allRetained); got.Sequence != want {
			t.Fatalf("retained sequence = %d, want %d", got.Sequence, want)
		}
	}
	assertNoEvent(t, allRetained)
}

func TestPublishDoesNotBlockOnSlowSubscriber(t *testing.T) {
	stream := New(0, 1)
	events, unsubscribe := stream.Subscribe("user-1", "job-1", 0)
	defer unsubscribe()

	stream.Publish("user-1", "job-1", "progress", 1)
	done := make(chan struct{})
	go func() {
		stream.Publish("user-1", "job-1", "progress", 2)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Publish blocked on a full subscriber channel")
	}
	if got := receive(t, events); got.Data != 1 {
		t.Fatalf("buffered event data = %#v, want 1", got.Data)
	}
	assertNoEvent(t, events)
}

func TestUnsubscribeIsIdempotentAndClosesChannel(t *testing.T) {
	stream := New(1, 1)
	events, unsubscribe := stream.Subscribe("user-1", "job-1", 0)

	unsubscribe()
	unsubscribe()
	if _, open := <-events; open {
		t.Fatal("subscription channel remained open")
	}

	stream.Publish("user-1", "job-1", "completed", nil)
	if _, open := <-events; open {
		t.Fatal("unsubscribed channel received another event")
	}
}

func TestHeartbeatEventIsJSONReady(t *testing.T) {
	stream := New(1, 1)
	event := stream.Publish("user-1", "job-1", EventTypeHeartbeat, nil)

	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	text := string(encoded)
	if event.PublishedAt.IsZero() || !strings.Contains(text, `"type":"heartbeat"`) || strings.Contains(text, `"data"`) {
		t.Fatalf("heartbeat event is not transport-ready: event=%#v json=%s", event, text)
	}
}

func receive(t *testing.T, events <-chan Event) Event {
	t.Helper()
	select {
	case event, open := <-events:
		if !open {
			t.Fatal("subscription closed before event arrived")
		}
		return event
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
		return Event{}
	}
}

func assertNoEvent(t *testing.T, events <-chan Event) {
	t.Helper()
	select {
	case event, open := <-events:
		if !open {
			t.Fatal("subscription closed unexpectedly")
		}
		t.Fatalf("unexpected event: %#v", event)
	case <-time.After(20 * time.Millisecond):
	}
}
