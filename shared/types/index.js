"use strict";
// Core Types for Fintech Payment Platform
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = exports.NotificationState = exports.WithdrawalState = exports.LedgerEventType = exports.PaymentType = exports.PaymentState = void 0;
var PaymentState;
(function (PaymentState) {
    PaymentState["PENDING"] = "PENDING";
    PaymentState["PROCESSING"] = "PROCESSING";
    PaymentState["COMPLETED"] = "COMPLETED";
    PaymentState["FAILED"] = "FAILED";
    PaymentState["CANCELLED"] = "CANCELLED";
    PaymentState["REFUNDED"] = "REFUNDED";
    PaymentState["EXPIRED"] = "EXPIRED";
    PaymentState["CHARGEBACK"] = "CHARGEBACK";
    PaymentState["PENDING_CONFIRMATION"] = "PENDING_CONFIRMATION";
})(PaymentState || (exports.PaymentState = PaymentState = {}));
var PaymentType;
(function (PaymentType) {
    PaymentType["PAYMENT_LINK"] = "PAYMENT_LINK";
    PaymentType["DIRECT_PAYMENT"] = "DIRECT_PAYMENT";
    PaymentType["WITHDRAWAL"] = "WITHDRAWAL";
    PaymentType["DEPOSIT"] = "DEPOSIT";
    PaymentType["REFUND"] = "REFUND";
    PaymentType["CHARGEBACK"] = "CHARGEBACK";
})(PaymentType || (exports.PaymentType = PaymentType = {}));
var LedgerEventType;
(function (LedgerEventType) {
    LedgerEventType["DEBIT"] = "DEBIT";
    LedgerEventType["CREDIT"] = "CREDIT";
    LedgerEventType["HOLD"] = "HOLD";
    LedgerEventType["RELEASE"] = "RELEASE";
    LedgerEventType["REVERSAL"] = "REVERSAL";
    LedgerEventType["ADJUSTMENT"] = "ADJUSTMENT";
})(LedgerEventType || (exports.LedgerEventType = LedgerEventType = {}));
var WithdrawalState;
(function (WithdrawalState) {
    WithdrawalState["PENDING"] = "PENDING";
    WithdrawalState["PROCESSING"] = "PROCESSING";
    WithdrawalState["APPROVED"] = "APPROVED";
    WithdrawalState["REJECTED"] = "REJECTED";
    WithdrawalState["COMPLETED"] = "COMPLETED";
    WithdrawalState["FAILED"] = "FAILED";
    WithdrawalState["CANCELLED"] = "CANCELLED";
})(WithdrawalState || (exports.WithdrawalState = WithdrawalState = {}));
var NotificationState;
(function (NotificationState) {
    NotificationState["PENDING"] = "PENDING";
    NotificationState["SENT"] = "SENT";
    NotificationState["DELIVERED"] = "DELIVERED";
    NotificationState["FAILED"] = "FAILED";
    NotificationState["CANCELLED"] = "CANCELLED";
})(NotificationState || (exports.NotificationState = NotificationState = {}));
// Event Types for Message Queue
var EventType;
(function (EventType) {
    EventType["PAYMENT_CREATED"] = "PAYMENT_CREATED";
    EventType["PAYMENT_UPDATED"] = "PAYMENT_UPDATED";
    EventType["PAYMENT_COMPLETED"] = "PAYMENT_COMPLETED";
    EventType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    EventType["WALLET_BALANCE_CHANGED"] = "WALLET_BALANCE_CHANGED";
    EventType["LEDGER_EVENT_CREATED"] = "LEDGER_EVENT_CREATED";
    EventType["FRAUD_ASSESSMENT_COMPLETED"] = "FRAUD_ASSESSMENT_COMPLETED";
    EventType["USER_VERIFICATION_CHANGED"] = "USER_VERIFICATION_CHANGED";
    EventType["WITHDRAWAL_REQUESTED"] = "WITHDRAWAL_REQUESTED";
    EventType["WITHDRAWAL_COMPLETED"] = "WITHDRAWAL_COMPLETED";
    EventType["NOTIFICATION_SENT"] = "NOTIFICATION_SENT";
})(EventType || (exports.EventType = EventType = {}));
//# sourceMappingURL=index.js.map