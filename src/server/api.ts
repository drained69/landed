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

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
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
  try {
    raw = await req.json();
  } catch {
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
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("host");
  try {
    const originUrl = new URL(origin);
    if (host && originUrl.host !== host) {
      throw new ApiError(403, "ORIGIN_MISMATCH", "Cross-origin write rejected");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(403, "ORIGIN_MISMATCH", "Invalid origin");
  }
}

export function api<T>(
  handler: (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<T | Response>,
) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      checkOrigin(req);
      const result = await handler(req, context);
      if (result instanceof Response) return result;
      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
      }
      if (error instanceof IntegrationUnavailableError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
      }
      if (error instanceof ApiError) {
        return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Check the submitted values", code: "VALIDATION_ERROR", details: error.flatten() }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : "Unexpected error";
      const knownNotFound = /not found/i.test(message);
      if (process.env.NODE_ENV !== "production") console.error("[api]", error);
      return NextResponse.json(
        { error: message, code: knownNotFound ? "NOT_FOUND" : "INTERNAL_ERROR" },
        { status: knownNotFound ? 404 : 500 },
      );
    }
  };
}

export function assertOwned<T extends { userId: string }>(record: T | null, userId: string): T {
  if (!record || record.userId !== userId) throw new ApiError(404, "NOT_FOUND", "Record not found");
  return record;
}
