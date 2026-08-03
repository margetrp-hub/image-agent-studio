package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"strings"
)

const KeySize = 32

var (
	ErrInvalidKeySize       = errors.New("secrets: key must be 32 bytes")
	ErrInvalidKeyVersion    = errors.New("secrets: key version is required")
	ErrInvalidVault         = errors.New("secrets: vault is not initialized")
	ErrEmptyPlaintext       = errors.New("secrets: plaintext is empty")
	ErrInvalidEnvelope      = errors.New("secrets: invalid encrypted envelope")
	ErrKeyVersionMismatch   = errors.New("secrets: key version mismatch")
	ErrAuthenticationFailed = errors.New("secrets: authentication failed")
)

type Envelope struct {
	KeyVersion string `json:"keyVersion"`
	Nonce      []byte `json:"nonce"`
	Ciphertext []byte `json:"ciphertext"`
}

type Vault struct {
	keyVersion string
	key        []byte
}

func New(key []byte, keyVersion string) (*Vault, error) {
	if len(key) != KeySize {
		return nil, ErrInvalidKeySize
	}
	keyVersion = strings.TrimSpace(keyVersion)
	if keyVersion == "" {
		return nil, ErrInvalidKeyVersion
	}

	return &Vault{
		keyVersion: keyVersion,
		key:        append([]byte(nil), key...),
	}, nil
}

func (v *Vault) Encrypt(plaintext []byte) (Envelope, error) {
	if len(plaintext) == 0 {
		return Envelope{}, ErrEmptyPlaintext
	}

	gcm, err := v.gcm()
	if err != nil {
		return Envelope{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return Envelope{}, fmt.Errorf("secrets: generate nonce: %w", err)
	}

	return Envelope{
		KeyVersion: v.keyVersion,
		Nonce:      nonce,
		Ciphertext: gcm.Seal(nil, nonce, plaintext, []byte(v.keyVersion)),
	}, nil
}

func (v *Vault) Decrypt(envelope Envelope) ([]byte, error) {
	if strings.TrimSpace(envelope.KeyVersion) == "" || len(envelope.Nonce) == 0 || len(envelope.Ciphertext) == 0 {
		return nil, ErrInvalidEnvelope
	}

	gcm, err := v.gcm()
	if err != nil {
		return nil, err
	}
	if envelope.KeyVersion != v.keyVersion {
		return nil, ErrKeyVersionMismatch
	}
	if len(envelope.Nonce) != gcm.NonceSize() || len(envelope.Ciphertext) < gcm.Overhead() {
		return nil, ErrInvalidEnvelope
	}

	plaintext, err := gcm.Open(nil, envelope.Nonce, envelope.Ciphertext, []byte(envelope.KeyVersion))
	if err != nil {
		return nil, ErrAuthenticationFailed
	}
	return plaintext, nil
}

func (v *Vault) gcm() (cipher.AEAD, error) {
	if v == nil || len(v.key) != KeySize || v.keyVersion == "" {
		return nil, ErrInvalidVault
	}
	block, err := aes.NewCipher(v.key)
	if err != nil {
		return nil, fmt.Errorf("secrets: initialize cipher: %w", err)
	}
	return cipher.NewGCM(block)
}
