import "server-only";
import { NextResponse } from "next/server";

/** Also applied to denials/errors: never let a shared cache retain trip data. */
export function privateMapResponse(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie, Authorization");
  return response;
}

export function mapJson(body: unknown, status = 200): NextResponse {
  return privateMapResponse(NextResponse.json(body, { status }));
}
