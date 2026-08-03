package secrets

import (
	"bytes"
	"encoding/json"
	"errors"
	"testing"
)

func TestVaultRoundTripAndSerialization(t *testing.T) {
	key := bytes.Repeat([]byte{0x42}, KeySize)
	vault, err := New(key, "2026-08")
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	key[0] = 0

	plaintext := []byte("provider-secret-must-not-be-serialized")
	envelope, err := vault.Encrypt(plaintext)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}
	if envelope.KeyVersion != "2026-08" {
		t.Fatalf("unexpected key version: %q", envelope.KeyVersion)
	}
	if len(envelope.Nonce) != 12 {
		t.Fatalf("unexpected nonce size: %d", len(envelope.Nonce))
	}
	if bytes.Contains(envelope.Ciphertext, plaintext) {
		t.Fatal("ciphertext contains plaintext")
	}

	serialized, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	if bytes.Contains(serialized, plaintext) || bytes.Contains(serialized, key) {
		t.Fatalf("serialized envelope leaked secret material: %s", serialized)
	}

	var decoded Envelope
	if err := json.Unmarshal(serialized, &decoded); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}
	decrypted, err := vault.Decrypt(decoded)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}
	if !bytes.Equal(decrypted, plaintext) {
		t.Fatalf("unexpected plaintext: %q", decrypted)
	}
}

func TestEncryptUsesRandomNonce(t *testing.T) {
	vault := newTestVault(t, 0x11, "v1")
	first, err := vault.Encrypt([]byte("same secret"))
	if err != nil {
		t.Fatalf("first Encrypt failed: %v", err)
	}
	second, err := vault.Encrypt([]byte("same secret"))
	if err != nil {
		t.Fatalf("second Encrypt failed: %v", err)
	}
	if bytes.Equal(first.Nonce, second.Nonce) {
		t.Fatal("Encrypt reused a nonce")
	}
	if bytes.Equal(first.Ciphertext, second.Ciphertext) {
		t.Fatal("same plaintext produced identical ciphertext")
	}
}

func TestDecryptRejectsWrongVersionKeyAndTampering(t *testing.T) {
	vault := newTestVault(t, 0x22, "v1")
	envelope, err := vault.Encrypt([]byte("secret"))
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	wrongVersion := envelope
	wrongVersion.KeyVersion = "v2"
	if _, err := vault.Decrypt(wrongVersion); !errors.Is(err, ErrKeyVersionMismatch) {
		t.Fatalf("wrong version error = %v", err)
	}

	wrongKeyVault := newTestVault(t, 0x33, "v1")
	if _, err := wrongKeyVault.Decrypt(envelope); !errors.Is(err, ErrAuthenticationFailed) {
		t.Fatalf("wrong key error = %v", err)
	}

	tampered := envelope
	tampered.Ciphertext = append([]byte(nil), envelope.Ciphertext...)
	tampered.Ciphertext[0] ^= 0xff
	if _, err := vault.Decrypt(tampered); !errors.Is(err, ErrAuthenticationFailed) {
		t.Fatalf("tampered ciphertext error = %v", err)
	}
}

func TestVaultValidationErrors(t *testing.T) {
	if _, err := New(make([]byte, KeySize-1), "v1"); !errors.Is(err, ErrInvalidKeySize) {
		t.Fatalf("short key error = %v", err)
	}
	if _, err := New(make([]byte, KeySize), "  "); !errors.Is(err, ErrInvalidKeyVersion) {
		t.Fatalf("empty key version error = %v", err)
	}

	vault := newTestVault(t, 0x44, "v1")
	if _, err := vault.Encrypt(nil); !errors.Is(err, ErrEmptyPlaintext) {
		t.Fatalf("empty plaintext error = %v", err)
	}

	for _, envelope := range []Envelope{
		{},
		{KeyVersion: "v1", Nonce: []byte{1}, Ciphertext: []byte{1}},
		{KeyVersion: "v1", Nonce: make([]byte, 12), Ciphertext: []byte{1}},
	} {
		if _, err := vault.Decrypt(envelope); !errors.Is(err, ErrInvalidEnvelope) {
			t.Fatalf("invalid envelope error = %v for %#v", err, envelope)
		}
	}

	var nilVault *Vault
	if _, err := nilVault.Encrypt([]byte("secret")); !errors.Is(err, ErrInvalidVault) {
		t.Fatalf("nil vault Encrypt error = %v", err)
	}
	if _, err := nilVault.Decrypt(Envelope{KeyVersion: "v1", Nonce: make([]byte, 12), Ciphertext: make([]byte, 16)}); !errors.Is(err, ErrInvalidVault) {
		t.Fatalf("nil vault Decrypt error = %v", err)
	}
}

func newTestVault(t *testing.T, keyByte byte, keyVersion string) *Vault {
	t.Helper()
	vault, err := New(bytes.Repeat([]byte{keyByte}, KeySize), keyVersion)
	if err != nil {
		t.Fatalf("New failed: %v", err)
	}
	return vault
}
