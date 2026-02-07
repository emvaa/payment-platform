import winston from 'winston';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  paymentId?: string;
  requestId?: string;
  [key: string]: any;
}

export class Logger {
  private logger: winston.Logger;

  constructor(serviceName: string) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: serviceName,
        version: process.env.APP_VERSION || '1.0.0'
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      ]
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  http(message: string, context?: LogContext): void {
    this.logger.http(message, context);
  }

  verbose(message: string, context?: LogContext): void {
    this.logger.verbose(message, context);
  }

  silly(message: string, context?: LogContext): void {
    this.logger.silly(message, context);
  }

  // Structured logging methods
  logRequest(method: string, url: string, statusCode: number, responseTime: number, context?: LogContext): void {
    this.http(`${method} ${url}`, {
      statusCode,
      responseTime,
      ...context
    });
  }

  logPaymentEvent(event: string, paymentId: string, context?: LogContext): void {
    this.info(event, {
      paymentId,
      ...context
    });
  }

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      stack: error.stack,
      ...context
    });
  }

  logPerformance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation}`, {
      duration,
      ...context
    });
  }

  logSecurity(event: string, context?: LogContext): void {
    this.warn(`Security: ${event}`, context);
  }

  logBusiness(event: string, context?: LogContext): void {
    this.info(`Business: ${event}`, context);
  }
}
