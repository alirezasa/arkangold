export type IntegrationErrorCategory =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'BUSINESS_REJECTION'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * پایه همه خطاهای لایه Integration.
 *
 * هر Adapter (فینوتک، Mock و بعداً بقیه) باید خطاهای خودش (HTTP error, timeout, ...)
 * را به یکی از این دسته‌ها Map کند تا ProviderResolverService بتواند تصمیم بگیرد که
 * آیا رفتن سراغ Provider بعدی (Fallback) منطقی است یا نه.
 *
 * retryable=true فقط برای خطاهای فنی (Timeout، اتصال، RateLimit، خطای سرور Provider) است؛
 * خطاهای Validation/Authentication/Business هیچ‌وقت با تغییر Provider حل نمی‌شوند.
 */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly category: IntegrationErrorCategory,
    public readonly retryable: boolean = false,
    public readonly providerErrorCode?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'VALIDATION_ERROR', false, providerErrorCode);
  }
}

export class AuthenticationError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'AUTHENTICATION_ERROR', false, providerErrorCode);
  }
}

export class AuthorizationError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'AUTHORIZATION_ERROR', false, providerErrorCode);
  }
}

export class TimeoutIntegrationError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'TIMEOUT', true, providerErrorCode);
  }
}

export class ConnectionError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'CONNECTION_ERROR', true, providerErrorCode);
  }
}

export class RateLimitError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'RATE_LIMIT', true, providerErrorCode);
  }
}

export class ProviderError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'PROVIDER_ERROR', true, providerErrorCode);
  }
}

export class InvalidResponseError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'INVALID_RESPONSE', false, providerErrorCode);
  }
}

export class BusinessRejectionError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'BUSINESS_REJECTION', false, providerErrorCode);
  }
}

export class ConfigurationError extends IntegrationError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', false);
  }
}

export class UnknownIntegrationError extends IntegrationError {
  constructor(message: string, providerErrorCode?: string) {
    super(message, 'UNKNOWN_ERROR', false, providerErrorCode);
  }
}
