import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';

import { Logger } from '../utils/Logger';
import { AuthRepository } from '../repositories/AuthRepository';
import { RedisClient } from '../config/redis';
import { EmailService } from './EmailService';

interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone?: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  permissions: string[];
  iat: number;
  exp: number;
}

export class AuthService {
  private logger: Logger;
  private authRepository: AuthRepository;
  private redis: RedisClient;
  private emailService: EmailService;
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN = '15m';
  private readonly REFRESH_TOKEN_EXPIRES_IN = '7d';

  constructor(
    logger: Logger,
    authRepository: AuthRepository,
    redis: RedisClient,
    emailService: EmailService
  ) {
    this.logger = logger;
    this.authRepository = authRepository;
    this.redis = redis;
    this.emailService = emailService;
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
  }

  async login(req: LoginRequest, ip: string, userAgent: string): Promise<{
    success: boolean;
    user?: any;
    token?: string;
    refreshToken?: string;
    requiresTwoFactor?: boolean;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      this.logger.info('Login attempt', { email: req.email, ip });

      // Find user by email
      const user = await this.authRepository.findByEmail(req.email);
      
      if (!user) {
        this.logger.warn('Login failed - user not found', { email: req.email, ip });
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        };
      }

      // Check if account is locked
      if (user.loginAttempts >= 5) {
        const lockoutTime = new Date(user.updatedAt);
        lockoutTime.setMinutes(lockoutTime.getMinutes() + 30);
        
        if (new Date() < lockoutTime) {
          return {
            success: false,
            error: {
              code: 'ACCOUNT_LOCKED',
              message: 'Account is temporarily locked. Please try again later.'
            }
          };
        }
        
        // Reset attempts after lockout period
        await this.authRepository.resetLoginAttempts(user.id);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(req.password, user.passwordHash);
      
      if (!isPasswordValid) {
        await this.authRepository.incrementLoginAttempts(user.id);
        
        this.logger.warn('Login failed - invalid password', { 
          userId: user.id, 
          email: req.email,
          ip 
        });
        
        return {
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password'
          }
        };
      }

      // Check if two-factor authentication is required
      if (user.twoFactorEnabled) {
        if (!req.twoFactorCode) {
          return {
            success: false,
            requiresTwoFactor: true,
            error: {
              code: 'TWO_FACTOR_REQUIRED',
              message: 'Two-factor authentication code required'
            }
          };
        }

        const isTwoFactorValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: req.twoFactorCode,
          window: 2
        });

        if (!isTwoFactorValid) {
          return {
            success: false,
            error: {
              code: 'INVALID_TWO_FACTOR',
              message: 'Invalid two-factor authentication code'
            }
          };
        }
      }

      // Reset login attempts
      await this.authRepository.resetLoginAttempts(user.id);
      await this.authRepository.updateLastLogin(user.id);

      // Generate tokens
      const token = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token in Redis
      await this.redis.set(`refresh_token:${user.id}:${refreshToken}`, 'valid', 7 * 24 * 60 * 60);

      // Log successful login
      await this.authRepository.createAuditLog({
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        resource: 'auth',
        ipAddress: ip,
        userAgent: userAgent,
        correlationId: uuidv4()
      });

      this.logger.info('Login successful', { userId: user.id, email: req.email });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          kycLevel: user.kycLevel,
          verificationStatus: user.verificationStatus,
          permissions: user.permissions
        },
        token,
        refreshToken
      };

    } catch (error) {
      this.logger.error('Login error', { 
        email: req.email, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during login'
        }
      };
    }
  }

  async register(req: RegisterRequest, ip: string, userAgent: string): Promise<{
    success: boolean;
    user?: any;
    token?: string;
    refreshToken?: string;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      this.logger.info('Registration attempt', { email: req.email, ip });

      // Check if email already exists
      const existingUser = await this.authRepository.findByEmail(req.email);
      
      if (existingUser) {
        return {
          success: false,
          error: {
            code: 'EMAIL_EXISTS',
            message: 'Email already registered'
          }
        };
      }

      // Validate password strength
      if (req.password.length < 8) {
        return {
          success: false,
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password must be at least 8 characters long'
          }
        };
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(req.password, salt);

      // Create user
      const user = await this.authRepository.create({
        email: req.email,
        passwordHash,
        salt,
        firstName: req.firstName,
        lastName: req.lastName,
        dateOfBirth: new Date(req.dateOfBirth),
        phone: req.phone,
        kycLevel: 'NONE',
        verificationStatus: 'PENDING',
        permissions: ['PAYMENTS_SEND', 'PAYMENTS_RECEIVE', 'PROFILE_VIEW'],
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Generate verification token
      const verificationToken = uuidv4();
      await this.redis.set(`email_verification:${user.id}`, verificationToken, 24 * 60 * 60);

      // Send verification email
      await this.emailService.sendVerificationEmail(user.email, verificationToken);

      // Generate tokens
      const token = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token
      await this.redis.set(`refresh_token:${user.id}:${refreshToken}`, 'valid', 7 * 24 * 60 * 60);

      // Log registration
      await this.authRepository.createAuditLog({
        userId: user.id,
        action: 'REGISTER_SUCCESS',
        resource: 'auth',
        ipAddress: ip,
        userAgent: userAgent,
        correlationId: uuidv4()
      });

      this.logger.info('Registration successful', { userId: user.id, email: req.email });

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          kycLevel: user.kycLevel,
          verificationStatus: user.verificationStatus,
          permissions: user.permissions
        },
        token,
        refreshToken
      };

    } catch (error) {
      this.logger.error('Registration error', { 
        email: req.email, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred during registration'
        }
      };
    }
  }

  async logout(userId: string, token: string): Promise<{ success: boolean }> {
    try {
      // Add token to blacklist
      await this.redis.set(`blacklist:${token}`, 'revoked', 15 * 60);
      
      // Remove all refresh tokens for user
      const refreshTokens = await this.redis.keys(`refresh_token:${userId}:*`);
      for (const key of refreshTokens) {
        await this.redis.del(key);
      }

      this.logger.info('Logout successful', { userId });
      
      return { success: true };
    } catch (error) {
      this.logger.error('Logout error', { userId, error });
      return { success: false };
    }
  }

  async refreshToken(refreshToken: string): Promise<{
    success: boolean;
    token?: string;
    refreshToken?: string;
    error?: {
      code: string;
      message: string;
    };
  }> {
    try {
      // Verify refresh token exists in Redis
      const exists = await this.redis.get(`refresh_token:${refreshToken}`);
      
      if (!exists) {
        return {
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token'
          }
        };
      }

      // Verify JWT
      const decoded = jwt.verify(refreshToken, this.JWT_SECRET) as TokenPayload;
      
      // Get user
      const user = await this.authRepository.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found or inactive'
          }
        };
      }

      // Generate new tokens
      const newToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // Update Redis
      await this.redis.del(`refresh_token:${refreshToken}`);
      await this.redis.set(`refresh_token:${user.id}:${newRefreshToken}`, 'valid', 7 * 24 * 60 * 60);

      return {
        success: true,
        token: newToken,
        refreshToken: newRefreshToken
      };

    } catch (error) {
      this.logger.error('Token refresh error', { error });
      
      return {
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token'
        }
      };
    }
  }

  async verifyEmail(userId: string, token: string): Promise<{ success: boolean; message?: string }> {
    try {
      const storedToken = await this.redis.get(`email_verification:${userId}`);
      
      if (!storedToken || storedToken !== token) {
        return { success: false, message: 'Invalid or expired verification token' };
      }

      await this.authRepository.updateEmailVerified(userId, true);
      await this.redis.del(`email_verification:${userId}`);

      this.logger.info('Email verified', { userId });
      
      return { success: true, message: 'Email verified successfully' };
    } catch (error) {
      this.logger.error('Email verification error', { userId, error });
      return { success: false, message: 'Verification failed' };
    }
  }

  async enableTwoFactor(userId: string): Promise<{
    success: boolean;
    secret?: string;
    qrCodeUrl?: string;
    error?: string;
  }> {
    try {
      const user = await this.authRepository.findById(userId);
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const secret = speakeasy.generateSecret({
        name: `FintechPlatform:${user.email}`,
        length: 32
      });

      // Store temporary secret
      await this.redis.set(`2fa_setup:${userId}`, secret.base32, 10 * 60);

      const qrCodeUrl = speakeasy.otpauthURL({
        secret: secret.base32,
        label: user.email,
        issuer: 'FintechPlatform',
        encoding: 'base32'
      });

      return {
        success: true,
        secret: secret.base32,
        qrCodeUrl
      };

    } catch (error) {
      this.logger.error('2FA setup error', { userId, error });
      return { success: false, error: 'Failed to setup two-factor authentication' };
    }
  }

  async confirmTwoFactor(userId: string, code: string): Promise<{ success: boolean; message?: string }> {
    try {
      const tempSecret = await this.redis.get(`2fa_setup:${userId}`);
      
      if (!tempSecret) {
        return { success: false, message: 'Two-factor setup expired' };
      }

      const isValid = speakeasy.totp.verify({
        secret: tempSecret,
        encoding: 'base32',
        token: code,
        window: 2
      });

      if (!isValid) {
        return { success: false, message: 'Invalid verification code' };
      }

      await this.authRepository.updateTwoFactor(userId, true, tempSecret);
      await this.redis.del(`2fa_setup:${userId}`);

      this.logger.info('2FA enabled', { userId });
      
      return { success: true, message: 'Two-factor authentication enabled' };

    } catch (error) {
      this.logger.error('2FA confirmation error', { userId, error });
      return { success: false, message: 'Failed to enable two-factor authentication' };
    }
  }

  async disableTwoFactor(userId: string, code: string): Promise<{ success: boolean; message?: string }> {
    try {
      const user = await this.authRepository.findById(userId);
      
      if (!user || !user.twoFactorEnabled) {
        return { success: false, message: 'Two-factor authentication is not enabled' };
      }

      const isValid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2
      });

      if (!isValid) {
        return { success: false, message: 'Invalid two-factor code' };
      }

      await this.authRepository.updateTwoFactor(userId, false, null);

      this.logger.info('2FA disabled', { userId });
      
      return { success: true, message: 'Two-factor authentication disabled' };

    } catch (error) {
      this.logger.error('2FA disable error', { userId, error });
      return { success: false, message: 'Failed to disable two-factor authentication' };
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const user = await this.authRepository.findById(userId);
      
      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      
      if (!isValid) {
        return { success: false, message: 'Current password is incorrect' };
      }

      // Validate new password
      if (newPassword.length < 8) {
        return { success: false, message: 'New password must be at least 8 characters' };
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      await this.authRepository.updatePassword(userId, passwordHash, salt);

      // Invalidate all existing sessions
      const refreshTokens = await this.redis.keys(`refresh_token:${userId}:*`);
      for (const key of refreshTokens) {
        await this.redis.del(key);
      }

      this.logger.info('Password changed', { userId });
      
      return { success: true, message: 'Password changed successfully' };

    } catch (error) {
      this.logger.error('Password change error', { userId, error });
      return { success: false, message: 'Failed to change password' };
    }
  }

  async requestPasswordReset(email: string): Promise<{ success: boolean; message?: string }> {
    try {
      const user = await this.authRepository.findByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists
        return { success: true, message: 'If the email exists, a reset link has been sent' };
      }

      const resetToken = uuidv4();
      await this.redis.set(`password_reset:${user.id}`, resetToken, 60 * 60); // 1 hour

      await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      this.logger.info('Password reset requested', { userId: user.id });
      
      return { success: true, message: 'If the email exists, a reset link has been sent' };

    } catch (error) {
      this.logger.error('Password reset request error', { email, error });
      return { success: false, message: 'Failed to process request' };
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    try {
      // Find user by reset token
      const keys = await this.redis.keys('password_reset:*');
      let userId: string | null = null;

      for (const key of keys) {
        const storedToken = await this.redis.get(key);
        if (storedToken === token) {
          userId = key.replace('password_reset:', '');
          break;
        }
      }

      if (!userId) {
        return { success: false, message: 'Invalid or expired reset token' };
      }

      // Validate password
      if (newPassword.length < 8) {
        return { success: false, message: 'Password must be at least 8 characters' };
      }

      // Hash new password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      await this.authRepository.updatePassword(userId, passwordHash, salt);
      await this.redis.del(`password_reset:${userId}`);

      // Invalidate all sessions
      const refreshTokens = await this.redis.keys(`refresh_token:${userId}:*`);
      for (const key of refreshTokens) {
        await this.redis.del(key);
      }

      this.logger.info('Password reset completed', { userId });
      
      return { success: true, message: 'Password reset successfully' };

    } catch (error) {
      this.logger.error('Password reset error', { error });
      return { success: false, message: 'Failed to reset password' };
    }
  }

  async validateToken(token: string): Promise<{
    valid: boolean;
    user?: any;
    error?: string;
  }> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return { valid: false, error: 'Token has been revoked' };
      }

      // Verify JWT
      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      // Get user
      const user = await this.authRepository.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return { valid: false, error: 'User not found or inactive' };
      }

      return {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          permissions: user.permissions,
          kycLevel: user.kycLevel,
          verificationStatus: user.verificationStatus
        }
      };

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token has expired' };
      }
      
      return { valid: false, error: 'Invalid token' };
    }
  }

  private generateAccessToken(user: any): string {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        permissions: user.permissions
      },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );
  }

  private generateRefreshToken(user: any): string {
    return jwt.sign(
      {
        userId: user.id,
        type: 'refresh'
      },
      this.JWT_SECRET,
      { expiresIn: this.REFRESH_TOKEN_EXPIRES_IN }
    );
  }
}
