# ROME — project instructions

@Memory.md

## Language (hard rule)
- Talk to the user in **Russian**.
- Write **all code in English**: identifiers, comments, commit messages, logs, error strings, config keys, file names.
- User-facing UI copy follows the product's language requirement; if unspecified, ask once.

## Documentation check (Context7)
- Before using any library, framework, SDK, API or CLI, verify current docs via Context7 MCP:
  `resolve-library-id` -> `query-docs` (tools `mcp__plugin_context7-plugin_context7__*`).
- Do this even for well-known libraries; training data may be stale. Applies to setup, API syntax, config, migrations, library-specific debugging.
- Skip only for pure logic with no library dependency. If Context7 has no coverage, fall back to the official docs site (see Research).
- State the library version the code targets.

## Research and scraping
- Find information yourself. Open sites and inspect them in a real browser with **Playwright** (`playwright-skill` plugin) instead of guessing from memory.
- Scraper choice (all installed globally; pick the lightest that works):
  - Single page to clean markdown, search, structured extract: **Firecrawl MCP** (`mcp__firecrawl__*`).
  - Anti-bot / protected pages, adaptive selectors: **Scrapling**.
  - JS-heavy pages to LLM-ready markdown: **Crawl4AI** (`crawl4ai-doctor` verifies install).
  - Large crawls with queues, retries, proxies: **Crawlee** (npm) or **Scrapy** (Python pipelines).
  - Learn rules from a few examples, small jobs: **autoscraper**.
  - Static text-only pages: `lightpanda` MCP is the cheapest first try.
- Respect robots.txt, rate limits and site terms. Never scrape personal data or paywalled content without authorization.

## Frontend / UX-UI
- Apply base UX/UI principles on every interface: clear **visual hierarchy** (size, weight, contrast, spacing), one primary action per view, consistent spacing scale, readable type scale, WCAG AA contrast, visible focus states, real empty/loading/error states, mobile-first responsive layout, 44px touch targets, motion that explains and respects `prefers-reduced-motion`.
- Build UI with the **design-taste-frontend** skill (`.claude/skills/design-taste-frontend`, from Leonxlnx/taste-skill). Invoke it before writing any new page or component.
- Check and improve UI with **impeccable** (`.claude/skills/impeccable`, from pbakaus/impeccable):
  - Run `/impeccable init` once to set up design context.
  - Hooks scan every edited UI file and run a deep pass on Stop. Fix findings before reporting done.
  - Manual scan: `npx impeccable detect <dir-or-url>` (exit 2 = findings).
- Avoid generic AI-slop look: default Inter-everywhere, purple gradients, nested cards, identical card grids, emoji as icons.
- Verify visually: open the running page with Playwright, screenshot desktop + mobile, check before declaring done.

## Memory
- `Memory.md` (project root) is the cross-session memory. It is imported above, so it loads every session.
- Update it when: a decision is made, a convention is set, a task finishes or is left half-done, a non-obvious pitfall is found.
- Keep it short (target under 150 lines). Replace stale entries, do not append forever. No secrets or tokens.

## Context budget
- Auto-compact window is **200k** tokens (`autoCompactWindow` in `.claude/settings.json`). Do not rely on a bigger window.
- Keep context small: search with Grep/Glob before reading, read file ranges not whole files, delegate wide exploration to a subagent, run `/compact` between unrelated tasks.

## Working rules
- Make surgical changes; match surrounding code style. Verify before claiming done (run build/tests/browser).
- Ask only when blocked on a decision that is the user's to make; otherwise pick a sensible default and say so.
- Confirm before destructive or outward-facing actions (delete, force-push, publish, deploy).
