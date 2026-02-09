import { Logger } from '../utils/Logger';

export class MerchantWebhookService {
  private logger: Logger;
  private baseUrl: string | undefined;

  constructor(logger: Logger) {
    this.logger = logger;
    this.baseUrl = process.env.MERCHANT_WEBHOOK_BASE_URL;
  }

  async sendEvent(merchantId: string, event: string, payload: any): Promise<void> {
    try {
      if (!this.baseUrl) return;
      const url = `${this.baseUrl}/merchants/${merchantId}/webhooks`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Name': 'payment-service',
          'X-Event-Type': event
        },
        body: JSON.stringify({ event, payload })
      });
      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
      }
      this.logger.info('Merchant webhook sent', { merchantId, event });
    } catch (error) {
      this.logger.error('Error sending merchant webhook', {
        merchantId,
        event,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
