/** An external integration is not configured or not reachable; mapped to HTTP 503. */
export class IntegrationUnavailableError extends Error {
  status = 503;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
