/** An external integration is not configured or not reachable; mapped to HTTP 503. */
export class IntegrationUnavailableError extends Error {
  status = 503;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Tatum's free plan allows 3 requests/second; back off and retry a rate-limited call. */
export async function fetchWithRateLimitRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt >= retries) return response;
    await new Promise((resolve) => setTimeout(resolve, 1100 * (attempt + 1)));
  }
}
