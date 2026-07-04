# HyNote Email Agent

Persistent-REPL CLI to reply to HyNote Affiliate emails and view stats. Skill-driven agent over a local Hono server backed by Cloudflare D1.

## Setup

```bash
bun install
cp .env.example .env   # fill Cloudflare D1 + provider API keys
bun run db:generate
bun run db:push        # applies schema to remote D1 (needs .env)
```

## Develop

```bash
bun run dev            # runs server + cli via mprocs
```

## Install globally

```bash
cd packages/cli && bun link   # exposes the `hynote` bin on PATH
# then run the server (bun run dev:server) and use `hynote`
```

## Config

- Secrets: `.env` (`CLOUDFLARE_*`, `<PROVIDER>_API_KEY`)
- Non-secret: `~/.bao-auto-mail/config.json` (default provider, model, base_url)
- Templates: `~/.bao-auto-mail/templates/*.md` (variables use `{{firstName}}`)
- Skills: `~/.bao-auto-mail/skills/<name>/SKILL.md`

## Usage

In the REPL: `/reply` + paste an email, `/stats [dimension]`, or type plain text to let the agent route intent.
