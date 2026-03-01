## Project Stack

This is a Next.js + TypeScript app using Supabase (with RLS policies), Clerk auth, and shadcn/ui components. When debugging API issues, always check RLS policies early. When testing shadcn components, be aware of their custom DOM structure (e.g., dual-thumb sliders, Select).

## Working Style

When the user interrupts or rejects an approach, stop immediately, ask what they want instead, and do not continue the previous approach. Prefer minimal, targeted changes over ambitious rewrites.

## Git Workflow

Run `npm run build` before pushing to catch Vercel build errors locally. Common issues: missing Suspense boundaries, Supabase array access patterns, circular dependencies.

## Database Operations

Before adding new items to the database (e.g., gear, garments), check if similar items already exist to avoid duplicates.

## Architecture

All calculations (e.g., clo values, risk assessments, weather processing) should be performed on the API side. Avoid doing calculations on the frontend.

## Dev Server

When starting the dev server, first check if the port (3000) is already in use and kill any stale processes. Also remove any stale lock files before running install commands.
