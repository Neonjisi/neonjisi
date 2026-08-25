# Next.js & ECC Development Rules

## 1. Environment & Architecture
- Framework: Next.js 15+ (App Router) with TypeScript
- Component Strategy: Default to Server Components. Use 'use client' only when state, effects, or browser APIs are required.
- File Structure: Place routes inside the `app/` directory (e.g., `app/page.tsx`, `app/layout.tsx`).

## 2. Coding Standards & Constraints
- Immutability: Always treat state and objects as immutable. Return new copies.
- Component Size: Keep components under 200-400 lines. Break them down into smaller sub-components if they exceed 500 lines.
- Error Handling: Use standard Next.js error boundaries (`error.tsx`) and handle client/server exceptions gracefully.
- Absolute Imports: Use `@/*` paths defined in tsconfig for importing components and hooks.

## 3. Build & Test Commands
- Development: `npm run dev` (or `pnpm dev` / `yarn dev`)
- Production Build: `npm run build`
- Lint Check: `npm run lint`
- Test: `npm run test` (ECC /tdd-workflow standard)

## 4. ECC Workflow Integration
- Always run `npm run build` or `npm run lint` before completing an implementation to ensure no TypeScript or compilation errors exist.
- Before modifying complex routing, use `/ecc:plan` to outline server actions and component boundaries.
