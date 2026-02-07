package com.fintech.wallet.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Wallet entity representing a user's wallet with multiple currency balances
 */
public class Wallet {
    private String id;
    private String userId;
    private Map<String, WalletBalance> balances;
    private boolean isActive;
    private Instant createdAt;
    private Instant updatedAt;
    private AtomicLong version;

    public Wallet() {
        this.balances = new ConcurrentHashMap<>();
        this.isActive = true;
        this.version = new AtomicLong(1);
    }

    public Wallet(String userId) {
        this();
        this.id = generateWalletId();
        this.userId = userId;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public Wallet(String id, String userId, Map<String, WalletBalance> balances, 
                  boolean isActive, Instant createdAt, Instant updatedAt, long version) {
        this.id = id;
        this.userId = userId;
        this.balances = new ConcurrentHashMap<>(balances);
        this.isActive = isActive;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.version = new AtomicLong(version);
    }

    // Getters and Setters
    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Map<String, WalletBalance> getBalances() {
        return new HashMap<>(balances);
    }

    public void setBalances(Map<String, WalletBalance> balances) {
        this.balances = new ConcurrentHashMap<>(balances);
    }

    public boolean isActive() {
        return isActive;
    }

    public void setActive(boolean active) {
        isActive = active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public long getVersion() {
        return version.get();
    }

    public void setVersion(long version) {
        this.version.set(version);
    }

    // Business Logic Methods

    /**
     * Get balance for a specific currency
     */
    public WalletBalance getBalance(String currency) {
        return balances.getOrDefault(currency, new WalletBalance(currency));
    }

    /**
     * Get available balance for a specific currency
     */
    public BigDecimal getAvailableBalance(String currency) {
        WalletBalance balance = getBalance(currency);
        return balance.getAvailable();
    }

    /**
     * Get held balance for a specific currency
     */
    public BigDecimal getHeldBalance(String currency) {
        WalletBalance balance = getBalance(currency);
        return balance.getHeld();
    }

    /**
     * Get total balance for a specific currency
     */
    public BigDecimal getTotalBalance(String currency) {
        WalletBalance balance = getBalance(currency);
        return balance.getTotal();
    }

    /**
     * Credit available balance (atomic operation)
     */
    public synchronized void creditAvailable(String currency, BigDecimal amount, String referenceId) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Credit amount must be positive");
        }

        WalletBalance balance = balances.computeIfAbsent(currency, WalletBalance::new);
        balance.creditAvailable(amount);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("CREDIT_AVAILABLE", currency, amount, referenceId);
    }

    /**
     * Debit available balance (atomic operation)
     */
    public synchronized void debitAvailable(String currency, BigDecimal amount, String referenceId) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Debit amount must be positive");
        }

        WalletBalance balance = balances.get(currency);
        if (balance == null || balance.getAvailable().compareTo(amount) < 0) {
            throw new InsufficientFundsException(
                String.format("Insufficient funds. Available: %s %s, Required: %s %s", 
                    balance != null ? balance.getAvailable() : BigDecimal.ZERO, 
                    currency, amount, currency));
        }

        balance.debitAvailable(amount);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("DEBIT_AVAILABLE", currency, amount.negate(), referenceId);
    }

    /**
     * Hold funds (move from available to held)
     */
    public synchronized void holdFunds(String currency, BigDecimal amount, String holdId, String reason) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Hold amount must be positive");
        }

        WalletBalance balance = balances.get(currency);
        if (balance == null || balance.getAvailable().compareTo(amount) < 0) {
            throw new InsufficientFundsException(
                String.format("Insufficient funds to hold. Available: %s %s, Required: %s %s", 
                    balance != null ? balance.getAvailable() : BigDecimal.ZERO, 
                    currency, amount, currency));
        }

        balance.holdFunds(amount, holdId, reason);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("HOLD_FUNDS", currency, amount, holdId);
    }

    /**
     * Release held funds (move from held to available)
     */
    public synchronized void releaseHeldFunds(String currency, BigDecimal amount, String holdId) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Release amount must be positive");
        }

        WalletBalance balance = balances.get(currency);
        if (balance == null || balance.getHeld().compareTo(amount) < 0) {
            throw new InsufficientFundsException(
                String.format("Insufficient held funds to release. Held: %s %s, Required: %s %s", 
                    balance != null ? balance.getHeld() : BigDecimal.ZERO, 
                    currency, amount, currency));
        }

        balance.releaseHeldFunds(amount, holdId);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("RELEASE_HELD_FUNDS", currency, amount, holdId);
    }

    /**
     * Add pending funds (awaiting confirmation)
     */
    public synchronized void addPending(String currency, BigDecimal amount, String referenceId) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Pending amount must be positive");
        }

        WalletBalance balance = balances.computeIfAbsent(currency, WalletBalance::new);
        balance.addPending(amount);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("ADD_PENDING", currency, amount, referenceId);
    }

    /**
     * Confirm pending funds (move from pending to available)
     */
    public synchronized void confirmPending(String currency, BigDecimal amount, String referenceId) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Confirmation amount must be positive");
        }

        WalletBalance balance = balances.get(currency);
        if (balance == null || balance.getPending().compareTo(amount) < 0) {
            throw new InsufficientFundsException(
                String.format("Insufficient pending funds to confirm. Pending: %s %s, Required: %s %s", 
                    balance != null ? balance.getPending() : BigDecimal.ZERO, 
                    currency, amount, currency));
        }

        balance.confirmPending(amount);
        balance.setLastUpdated(Instant.now());
        
        updateVersion();
        logBalanceChange("CONFIRM_PENDING", currency, amount, referenceId);
    }

    /**
     * Check if wallet has sufficient available balance
     */
    public boolean hasSufficientBalance(String currency, BigDecimal amount) {
        WalletBalance balance = getBalance(currency);
        return balance.getAvailable().compareTo(amount) >= 0;
    }

    /**
     * Get all currencies with non-zero balances
     */
    public Set<String> getActiveCurrencies() {
        Set<String> currencies = new HashSet<>();
        for (Map.Entry<String, WalletBalance> entry : balances.entrySet()) {
            if (entry.getValue().getTotal().compareTo(BigDecimal.ZERO) > 0) {
                currencies.add(entry.getKey());
            }
        }
        return currencies;
    }

    /**
     * Calculate total value across all currencies (in base currency)
     */
    public BigDecimal getTotalValue(String baseCurrency, ExchangeRateProvider rateProvider) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<String, WalletBalance> entry : balances.entrySet()) {
            String currency = entry.getKey();
            BigDecimal balance = entry.getValue().getTotal();
            
            if (currency.equals(baseCurrency)) {
                total = total.add(balance);
            } else {
                BigDecimal rate = rateProvider.getExchangeRate(currency, baseCurrency);
                total = total.add(balance.multiply(rate));
            }
        }
        return total;
    }

    /**
     * Optimistic lock check
     */
    public boolean isVersion(long expectedVersion) {
        return this.version.get() == expectedVersion;
    }

    /**
     * Increment version for optimistic locking
     */
    private void updateVersion() {
        this.version.incrementAndGet();
        this.updatedAt = Instant.now();
    }

    /**
     * Generate unique wallet ID
     */
    private String generateWalletId() {
        return "wallet_" + UUID.randomUUID().toString().replace("-", "");
    }

    /**
     * Log balance changes for audit purposes
     */
    private void logBalanceChange(String operation, String currency, BigDecimal amount, String referenceId) {
        // This would integrate with the audit service
        System.out.printf("[%s] Wallet %s: %s %s %s (Ref: %s)%n", 
            Instant.now(), id, operation, amount, currency, referenceId);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Wallet wallet = (Wallet) o;
        return Objects.equals(id, wallet.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return String.format("Wallet{id='%s', userId='%s', balances=%s, isActive=%s, version=%d}", 
            id, userId, balances, isActive, version.get());
    }

    // Custom exception
    public static class InsufficientFundsException extends RuntimeException {
        public InsufficientFundsException(String message) {
            super(message);
        }
    }

    // Interface for exchange rate provider
    public interface ExchangeRateProvider {
        BigDecimal getExchangeRate(String fromCurrency, String toCurrency);
    }
}
