import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { UnauthorizedError } from "./auth";
import { IntegrationUnavailableError } from "./services/tatum";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
      }
      if (buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
        throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.");
  }
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  const maxBytes = 2_000_000;
  if (Number(req.headers.get("content-length")) > maxBytes) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Request body must be under 2 MB");
  }
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "BODY_TOO_LARGE", "Request body must be under 2 MB");
      }
      chunks.push(value);
    }
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Check the submitted values", parsed.error.flatten());
  }
  return parsed.data;
}

function checkOrigin(req: NextRequest) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return;
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "ORIGIN_MISMATCH", "Cross-origin write rejected");
  }
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host") ?? new URL(req.url).host;
  try {
    const originUrl = new URL(origin);
    if (!["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== host) {
      throw new ApiError(403, "ORIGIN_MISMATCH", "Cross-origin write rejected");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "ORIGIN_MISMATCH", "Invalid origin");
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function api<T>(
  handler: (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<T | Response>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      checkOrigin(req);
      const result = await handler(req, context);
      if (result instanceof Response) {
        result.headers.set("Cache-Control", "private, no-store");
        return result;
      }
      return jsonResponse(result, { status: 200 });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return jsonResponse({ error: error.message, code: error.code }, { status: 401 });
      }
      if (error instanceof IntegrationUnavailableError) {
        return jsonResponse({ error: error.message, code: error.code }, { status: error.status });
      }
      if (error instanceof ApiError) {
        return jsonResponse({ error: error.message, code: error.code, details: error.details }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return jsonResponse({ error: "Check the submitted values", code: "VALIDATION_ERROR", details: error.flatten() }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      const knownNotFound = /not found/i.test(message);
      console.error("[api]", error);
      return jsonResponse(
        { error: process.env.NODE_ENV === "production" ? (knownNotFound ? "Record not found" : "Something went wrong. Please try again.") : message, code: knownNotFound ? "NOT_FOUND" : "INTERNAL_ERROR" },
        { status: knownNotFound ? 404 : 500 },
      );
    }
  };
}

export function assertOwned<T extends { userId: string }>(record: T | null, userId: string): T {
  if (!record || record.userId !== userId) throw new ApiError(404, "NOT_FOUND", "Record not found");
  return record;
}
