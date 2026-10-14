import { NextResponse } from "next/server";

// Installed shells use this stable route; the form can change independently.
export function GET() {
  return NextResponse.redirect("https://docs.google.com/forms/d/e/1FAIpQLSfpX2tVx485Q0ybdNH_t48_-Z_WY0ldx3VhhkUeGKIXQ2N9fg/viewform?usp=publish-editor", 307);
}
