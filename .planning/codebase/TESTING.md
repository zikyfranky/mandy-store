# Testing Patterns

**Analysis Date:** 2026-06-05

## Test Framework

**Runner:**
- Not configured — no test runner is installed or configured
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*` files present
- `package.json` defines no `test` script

**Assertion Library:**
- Not applicable — no test framework installed

**Run Commands:**
```bash
# No test commands configured
# To add testing, install and configure a framework (see below)
```

## Current State

This is a freshly scaffolded Next.js project with no test infrastructure. The `package.json` contains only `dev`, `build`, `start`, and `lint` scripts. There are no test files (`*.test.*`, `*.spec.*`) anywhere in the repository.

## Recommended Setup (Next.js App Router conventions)

**For unit/integration tests:** Jest + React Testing Library is the standard Next.js choice.

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom ts-jest
```

Config file location: `jest.config.ts` at project root.

**For end-to-end tests:** Playwright is the Next.js-recommended E2E framework.

```bash
npm install --save-dev @playwright/test
```

Config file location: `playwright.config.ts` at project root.

## Test File Organization

**Recommended Location:**
- Co-located with source: `src/app/page.test.tsx` alongside `src/app/page.tsx`
- Or in a dedicated directory: `src/__tests__/`

**Recommended Naming:**
- Unit/integration: `[component-name].test.tsx` or `[component-name].spec.tsx`
- E2E: `[feature].e2e.ts` or `tests/[feature].spec.ts`

## Test Structure

**Recommended suite pattern for React components:**
```typescript
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home", () => {
  it("renders the page heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });
});
```

## Mocking

**Framework:** Not established

**Recommended patterns for Next.js App Router:**
```typescript
// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

// Mock next/font/google (required for layout tests)
jest.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
```

**What to Mock:**
- `next/image` — does not render in Jest/jsdom without mocking
- `next/font/google` — font loading is a browser/Node API not available in test environments
- External API calls — use `jest.fn()` or `msw` for HTTP mocking

**What NOT to Mock:**
- React itself
- Tailwind CSS (it has no runtime effect in tests)
- Simple utility functions that have no side effects

## Fixtures and Factories

**Test Data:**
- Not established — no fixtures or factory patterns exist
- Recommended location: `src/__tests__/fixtures/` for shared test data

## Coverage

**Requirements:** Not enforced — no coverage thresholds configured

**Add coverage with Jest:**
```bash
npx jest --coverage
```

## Test Types

**Unit Tests:**
- Not present — recommended scope: individual React components and utility functions

**Integration Tests:**
- Not present — recommended scope: page-level renders verifying full component trees

**E2E Tests:**
- Not present — recommended framework: Playwright (`@playwright/test`)

## Adding Tests

When the codebase grows beyond the scaffold, add tests in this priority order:

1. Install Jest + React Testing Library (unit/integration)
2. Add `test` script to `package.json`: `"test": "jest"`
3. Add `jest.config.ts` with `jsdom` environment and `@/*` path alias resolution
4. Co-locate test files with source files under `src/`
5. Add Playwright for E2E coverage of critical user flows

---

*Testing analysis: 2026-06-05*
