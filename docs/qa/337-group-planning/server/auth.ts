import { request } from "./state";

/** Stands in for src/lib/auth.ts: the viewer the fixture server was asked for. */
export async function getAuthUserId(): Promise<string | null> {
  return request.userId;
}
