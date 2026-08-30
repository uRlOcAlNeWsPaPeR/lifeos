import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (
  req: Request,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

/** Wraps a route handler with consistent JSON error handling. */
export function route(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (status && status >= 400 && status < 600) {
        return NextResponse.json({ error: (err as Error).message }, { status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation failed", issues: err.flatten() },
          { status: 422 },
        );
      }
      console.error("[api] unhandled error:", err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
