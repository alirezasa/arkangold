export interface StandardIntegrationResponse<T = unknown> {
  success: boolean;
  status: string;
  code: string;
  message: string;
  data: T | null;
  provider: string;
  providerRequestId?: string;
  requestId: string;
}
