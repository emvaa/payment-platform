package models

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// EventType represents the type of ledger event
type EventType string

const (
	Debit     EventType = "DEBIT"
	Credit    EventType = "CREDIT"
	Hold      EventType = "HOLD"
	Release   EventType = "RELEASE"
	Reversal  EventType = "REVERSAL"
	Adjustment EventType = "ADJUSTMENT"
)

// Money represents a monetary amount with currency
type Money struct {
	Amount    float64 `json:"amount"`
	Currency  string  `json:"currency"`
	Precision int     `json:"precision"`
}

// LedgerEvent represents an immutable ledger event
type LedgerEvent struct {
	ID           string                 `json:"id"`
	Type         EventType              `json:"type"`
	Amount       Money                  `json:"amount"`
	Currency     string                 `json:"currency"`
	AccountID    string                 `json:"accountId"`
	PaymentID    *string                `json:"paymentId,omitempty"`
	ReferenceID  *string                `json:"referenceId,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
	Metadata     map[string]interface{} `json:"metadata"`
	Signature    string                 `json:"signature"`
	Version      int64                  `json:"version"`
	CorrelationID string                `json:"correlationId"`
}

// NewLedgerEvent creates a new ledger event with required fields
func NewLedgerEvent(eventType EventType, amount Money, accountID string, correlationID string) *LedgerEvent {
	return &LedgerEvent{
		ID:            generateEventID(),
		Type:          eventType,
		Amount:        amount,
		Currency:      amount.Currency,
		AccountID:     accountID,
		Timestamp:     time.Now().UTC(),
		Metadata:      make(map[string]interface{}),
		Version:       1,
		CorrelationID: correlationID,
	}
}

// WithPaymentID sets the payment ID for the event
func (e *LedgerEvent) WithPaymentID(paymentID string) *LedgerEvent {
	e.PaymentID = &paymentID
	return e
}

// WithReferenceID sets the reference ID for the event
func (e *LedgerEvent) WithReferenceID(referenceID string) *LedgerEvent {
	e.ReferenceID = &referenceID
	return e
}

// WithMetadata adds metadata to the event
func (e *LedgerEvent) WithMetadata(key string, value interface{}) *LedgerEvent {
	if e.Metadata == nil {
		e.Metadata = make(map[string]interface{})
	}
	e.Metadata[key] = value
	return e
}

// WithVersion sets the version of the event
func (e *LedgerEvent) WithVersion(version int64) *LedgerEvent {
	e.Version = version
	return e
}

// Sign generates a cryptographic signature for the event
func (e *LedgerEvent) Sign(privateKey string) error {
	// Create a canonical representation of the event for signing
	eventData := map[string]interface{}{
		"id":            e.ID,
		"type":          string(e.Type),
		"amount":        e.Amount,
		"currency":      e.Currency,
		"accountId":     e.AccountID,
		"paymentId":     e.PaymentID,
		"referenceId":   e.ReferenceID,
		"timestamp":     e.Timestamp.Unix(),
		"metadata":      e.Metadata,
		"version":       e.Version,
		"correlationId": e.CorrelationID,
	}

	// Convert to JSON bytes
	jsonBytes, err := json.Marshal(eventData)
	if err != nil {
		return fmt.Errorf("failed to marshal event for signing: %w", err)
	}

	// Create SHA-256 hash and combine with private key for signature
	hash := sha256.Sum256(jsonBytes)
	combined := fmt.Sprintf("%s:%s", hex.EncodeToString(hash[:]), privateKey)
	signatureHash := sha256.Sum256([]byte(combined))
	
	e.Signature = hex.EncodeToString(signatureHash[:])
	return nil
}

// Verify verifies the cryptographic signature of the event
func (e *LedgerEvent) Verify(publicKey string) bool {
	if e.Signature == "" {
		return false
	}

	// Recreate the canonical representation
	eventData := map[string]interface{}{
		"id":            e.ID,
		"type":          string(e.Type),
		"amount":        e.Amount,
		"currency":      e.Currency,
		"accountId":     e.AccountID,
		"paymentId":     e.PaymentID,
		"referenceId":   e.ReferenceID,
		"timestamp":     e.Timestamp.Unix(),
		"metadata":      e.Metadata,
		"version":       e.Version,
		"correlationId": e.CorrelationID,
	}

	jsonBytes, err := json.Marshal(eventData)
	if err != nil {
		return false
	}

	hash := sha256.Sum256(jsonBytes)
	combined := fmt.Sprintf("%s:%s", hex.EncodeToString(hash[:]), publicKey)
	expectedSignatureHash := sha256.Sum256([]byte(combined))
	expectedSignature := hex.EncodeToString(expectedSignatureHash[:])

	return e.Signature == expectedSignature
}

// ToJSON converts the event to JSON bytes
func (e *LedgerEvent) ToJSON() ([]byte, error) {
	return json.Marshal(e)
}

// LedgerEventFromJSON creates a LedgerEvent from JSON bytes
func LedgerEventFromJSON(jsonBytes []byte) (*LedgerEvent, error) {
	var event LedgerEvent
	err := json.Unmarshal(jsonBytes, &event)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal ledger event: %w", err)
	}
	return &event, nil
}

// Validate validates the ledger event
func (e *LedgerEvent) Validate() error {
	if e.ID == "" {
		return fmt.Errorf("event ID is required")
	}

	if e.Type == "" {
		return fmt.Errorf("event type is required")
	}

	if e.Amount.Amount <= 0 {
		return fmt.Errorf("amount must be greater than 0")
	}

	if e.Currency == "" {
		return fmt.Errorf("currency is required")
	}

	if e.AccountID == "" {
		return fmt.Errorf("account ID is required")
	}

	if e.CorrelationID == "" {
		return fmt.Errorf("correlation ID is required")
	}

	if e.Timestamp.IsZero() {
		return fmt.Errorf("timestamp is required")
	}

	if e.Version <= 0 {
		return fmt.Errorf("version must be greater than 0")
	}

	// Validate event type
	validTypes := map[EventType]bool{
		Debit:      true,
		Credit:     true,
		Hold:       true,
		Release:    true,
		Reversal:   true,
		Adjustment: true,
	}

	if !validTypes[e.Type] {
		return fmt.Errorf("invalid event type: %s", e.Type)
	}

	return nil
}

// IsDebit returns true if the event is a debit event
func (e *LedgerEvent) IsDebit() bool {
	return e.Type == Debit
}

// IsCredit returns true if the event is a credit event
func (e *LedgerEvent) IsCredit() bool {
	return e.Type == Credit
}

// IsHold returns true if the event is a hold event
func (e *LedgerEvent) IsHold() bool {
	return e.Type == Hold
}

// IsRelease returns true if the event is a release event
func (e *LedgerEvent) IsRelease() bool {
	return e.Type == Release
}

// IsReversal returns true if the event is a reversal event
func (e *LedgerEvent) IsReversal() bool {
	return e.Type == Reversal
}

// IsAdjustment returns true if the event is an adjustment event
func (e *LedgerEvent) IsAdjustment() bool {
	return e.Type == Adjustment
}

// AffectsBalance returns true if the event affects the account balance
func (e *LedgerEvent) AffectsBalance() bool {
	return e.IsDebit() || e.IsCredit() || e.IsAdjustment()
}

// AffectsHolds returns true if the event affects holds
func (e *LedgerEvent) AffectsHolds() bool {
	return e.IsHold() || e.IsRelease()
}

// String returns a string representation of the event
func (e *LedgerEvent) String() string {
	return fmt.Sprintf("LedgerEvent{ID: %s, Type: %s, Amount: %.2f %s, AccountID: %s, Timestamp: %s}",
		e.ID, e.Type, e.Amount.Amount, e.Currency, e.AccountID, e.Timestamp.Format(time.RFC3339))
}

// generateEventID generates a unique event ID
func generateEventID() string {
	return fmt.Sprintf("evt_%s_%s", time.Now().Format("20060102150405"), uuid.New().String()[:8])
}
