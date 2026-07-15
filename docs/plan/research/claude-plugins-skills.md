# Claude Code Plugin/Skill Ecosystem Research — July 2026

## Marketplaces

| Marketplace | Add command | Notes |
|---|---|---|
| **claude-plugins-official** (anthropics/claude-plugins-official) | Pre-registered by default; else `/plugin marketplace add anthropics/claude-plugins-official` | Official Anthropic-managed directory. ~101+ plugins (33 Anthropic-built incl. LSPs + 68+ partner plugins: GitHub, Playwright, Supabase, Figma, Vercel, Linear, Sentry, Stripe, Firebase). Browse via `/plugin` → Discover tab, or claude.com/plugins |
| **claude-plugins-community** (anthropics/claude-plugins-community) | `/plugin marketplace add anthropics/claude-plugins-community` | Third-party plugins that passed Anthropic's automated validation/safety screening |
| **anthropics/claude-code** (demo marketplace) | `/plugin marketplace add anthropics/claude-code` | Example/demo plugins incl. `ralph-wiggum` (original ralph loop demo) |
| **anthropics/skills** (Agent Skills) | `/plugin marketplace add anthropics/skills` | Official Agent Skills repo (webapp-testing, mcp-builder, skill-creator, docx/pdf/pptx/xlsx, canvas-design) — user already has as `anthropic-skills` |
| **obra/superpowers-marketplace** | `/plugin marketplace add obra/superpowers-marketplace` | Largest community skill library (~40.9k stars); full SDLC. User has it |
| **thedotmack/claude-mem** | `/plugin marketplace add thedotmack/claude-mem` | Persistent cross-session memory. User has it |
| Directories (not marketplaces) | — | hesreallyhim/awesome-claude-code (~36.8k stars), claudepluginhub.com, claude.com/plugins |

## Plugins by build phase

### Full-stack Next.js + Supabase + Stripe
- **supabase** — `/plugin install supabase@claude-plugins-official` — DB ops, auth, storage, realtime, migrations, SQL, postgres best-practices. (HAVE; MCP needs `/mcp` auth)
- **vercel** — `/plugin install vercel@claude-plugins-official` — deploys, env sync, Next.js/react/shadcn skills. (HAVE)
- **stripe** — `/plugin install stripe@claude-plugins-official` — payments integration + Stripe MCP (docs search, API tools). **GAP — install for Phase 8**
- **github** — `/plugin install github@claude-plugins-official` — GitHub MCP: issues, PRs, reviews, Actions monitoring. **GAP — install Phase 0**
- **context7** — version-specific docs injected into context. (HAVE)
- **neon** — alternative Postgres. (skip — using Supabase)
- **v0** — `/plugin install v0@claude-plugins-official` — Vercel AI UI generation. (optional, Phase 7)
- **typescript-lsp** — `/plugin install typescript-lsp@claude-plugins-official` — real TS diagnostics/go-to-def. **GAP — install Phase 0**

### Testing / QA
- **playwright** — `/plugin install playwright@claude-plugins-official` — browser automation MCP. **GAP — install Phase 0**
- **webapp-testing** (skill in anthropic-skills) — Playwright local webapp testing. (HAVE)
- **snapshot** — `/plugin install snapshot@claude-plugins-official` — visual regression testing. (optional, Phase 7)
- **chrome-devtools-mcp** — live Chrome control, perf traces. (optional, Phase 7/9 perf)

### Code quality / security
- **security-guidance** — `/plugin install security-guidance@claude-plugins-official` — reviews ~25 vulnerability classes as code is written. **GAP — install Phase 0**; also built-in `/security-review` command + anthropics/claude-code-security-review GitHub Action for CI
- **code-review** — multi-agent PR review. (HAVE)
- **feature-dev** — 7-phase guided feature workflow. (HAVE)
- **code-simplifier** — refactor for clarity. (HAVE)

### Frontend/UI polish
- **frontend-design** — distinctive production-grade UI, anti-generic. (HAVE)
- **figma** — design files → code. (HAVE; needs MCP auth)
- **tweakcn** (tweakcn.com) — visual shadcn theme editor (web tool, not plugin)

### Long autonomous builds
- **ralph-loop** — Stop-hook loop until completion promise. (HAVE)
- **superpowers** — brainstorming/TDD/worktrees/verification. (HAVE)
- **claude-mem** — cross-session memory. (HAVE)
- **hookify** — `/plugin install hookify@claude-plugins-official` — create hooks conversationally. (optional)
- **commit-commands** — git commit workflow. (optional)

## MCP servers
- Supabase MCP: `claude mcp add --transport http supabase "https://mcp.supabase.com/mcp"` (project-scoping + read-only flags)
- Stripe MCP: `claude mcp add --transport http stripe https://mcp.stripe.com` (OAuth)
- GitHub MCP: via github plugin or github/github-mcp-server
- Playwright MCP: `claude mcp add playwright -- npx @playwright/mcp@latest`
- shadcn MCP: `npx shadcn@latest mcp init --client claude` — browse/search/install components across registries
- Scope tip: `claude mcp add --scope project …` writes shareable `.mcp.json`

## Uninterruptable-build recipe (2026 consensus)
1. **Permission allowlist** in settings.json — `"permissions": {"allow": ["Bash(npm run *)", "Bash(git commit *)", "Edit"], "deny": ["Read(.env*)", "Bash(rm -rf *)"], "defaultMode": "acceptEdits"}` — NOT --dangerously-skip-permissions (only in disposable containers). New 2026 "auto" mode = model-classifier approves intent-aligned actions.
2. **PreToolUse deny-hooks** for destructive commands (rm -rf, force-push, DROP TABLE, .env reads) — hold even in bypassPermissions.
3. **Stop hook loop** (ralph-loop) with objective completion promise (tests green). Check `stop_hook_active` to avoid infinite blocking.
4. **PostToolUse hooks** — auto-typecheck/lint after edits.
5. **CLAUDE.md** — architecture/conventions the loop re-reads; survives compaction. `/init`, `#` to append, `@path` imports.
6. **claude-mem** — session continuity across restarts/compaction.
7. **Checkpointing/rewind** — Esc Esc or `/rewind`; complements git.
8. **Subagents** — isolated context windows prevent exhaustion on long builds.
9. **Background: `claude --bg`, `claude -p` headless (CI), `/loop`, Routines (cloud cron).**
10. **Git worktrees** for parallel sessions.

Key gaps to install: **stripe**, **playwright**, **typescript-lsp**, **security-guidance**, **github** plugins + **shadcn MCP**.

(Full source list: code.claude.com/docs hooks/permissions, anthropics/claude-plugins-official, docs.stripe.com/mcp, supabase.com/docs/guides/ai-tools/mcp, ui.shadcn.com/docs/mcp)
