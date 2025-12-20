# Copilot / AI Agent Instructions for Sentinel Bot

Purpose: Give an AI coding agent the minimal, actionable knowledge to be productive in this repository.

## Quick summary

- Project: Node.js Discord bot (Sentinel). Entry points: `index.js` (single-process), `shard.js` (ShardingManager), `cluster.js` (ClusterManager).
- DB: SQLite at `data/Sentinel.db` (see `utils/database.js`) with WAL and performance PRAGMAs.
- Commands: `commands/` contains Slash commands (`data` = `SlashCommandBuilder`, `execute` function). Events: `events/` modules expose `{ name, once, execute }`.
- Scripts: `npm run dev` (single-process), `npm start` (sharded), `npm run cluster` (cluster manager), `npm test` (Jest), `npm run format` (Prettier).

## Important patterns & conventions (do not change without tests)

- CommonJS modules (`module.exports`). Keep imports with `require()`.
- Slash command pattern: export `data` (SlashCommandBuilder) and `async execute(interaction)`. Example: `commands/ping.js`.
- Events: export `{ name, once, execute }`. `index.js` registers events and wraps `execute(..., client)` in try/catch and logs errors
  (see `events/ready.js` for initialization flow).
- Command registration is per-guild (see `utils/registerCommands.js`):
  - First clears global commands (prevents duplicates)
  - Registers commands in small batches with timeouts to avoid hangs and rate limits
- Sharding/cluster responsibilities:
  - `shard.js` sets `USING_SHARDING=true` in spawned processes.
  - Only shard 0 (or non-sharded mode) performs global tasks (dashboard startup, snapshot scheduler, token scanner, Top.gg posting, etc.). See `events/ready.js` where shard checks are performed.
  - For cluster mode use `npm run cluster` (uses `discord-hybrid-sharding`).
- Secrets & env: Use `.env` (example: `.env.example`). Required: `DISCORD_TOKEN`, `OWNER_ID`, `CLIENT_ID`, `CLIENT_SECRET` for dashboard. Optional integrations: `TOPGG_TOKEN`, `DISCORDBOTLIST_TOKEN`, `VOIDBOTS_TOKEN`, `REDIS_URL`, `PORT`, `DASHBOARD_URL`.

## Runtime & debugging tips

- Local dev: copy `.env.example` -> `.env`, fill `DISCORD_TOKEN`, then `npm run dev` to run `index.js` (single-shard) or `npm start` for `shard.js`.
- Enable more logger output by setting `NODE_ENV=development` (logger.debug is gated on it). Some managers use `DEBUG=true` for extra debug output.
- If a token leak is detected, repo has a safety pattern: presence of a `.TOKEN_LEAK_SHUTDOWN` file prevents shards/clusters from respawning and forces manual remediation (see `shard.js` / `cluster.js` death handlers).
- Registering commands can time out; `registerCommands` uses timeouts and batches to avoid hanging the `ready` event—if debugging missing commands, check that registration did not fail or time out.

## Data & external integrations to be aware of

- Database: `utils/database.js` (SQLite) — uses WAL, PRAGMA tuning, migrations and prepared statement cache. Backups live in `backups/`.
- Caching: Redis is optional (see `utils/redisCache.js`). Code falls back to in-memory cache when Redis is unavailable.
- 3rd-party integrations: Top.gg, Discord Bot List, VoidBots, BotsOnDiscord, etc. They only initialize if related env tokens exist.
- Dashboard: `dashboard/server.js` is started automatically by shard 0 or in non-sharded startup. It reads `PORT` and `DASHBOARD_URL` env values.

## Tests & formatting

- Tests: Jest (`npm test`). Tests live under `tests/` (examples: `heatSystem.test.js`). Keep tests small and focused and mock network/Discord interactions.
- Formatting: Prettier (`npm run format`, `npm run format:check`). Prefer Prettier formatting style used across the repo.

## Common tasks for contributor agents

- Add a new slash command:
  1. Create `commands/mycommand.js` exporting `data` (SlashCommandBuilder) and `async execute(interaction)`.
  2. Add unit tests in `tests/` mocking Discord client where appropriate.
  3. Run `npm test` and `npm run format`.
- Add an event: create `events/myEvent.js` with `{ name, once, execute }` and ensure error handling is applied in the event call site.
- Schema or DB changes: add a migration in `utils/database.js` (follow existing patterns), add tests, and ensure backups / migrations run on startup.

## Where to look for authoritative examples

- Command: `commands/ping.js`
- Ready/startup lifecycle and shard-aware behavior: `events/ready.js` and `index.js`
- Sharding/cluster managers: `shard.js`, `cluster.js`
- Command registration: `utils/registerCommands.js` (batching + per-guild strategy)
- Logging conventions: `utils/logger.js` (use `logger.info/error/warn/success/debug`)
- DB schema & performance tuning: `utils/database.js`

---

If anything here is unclear or you'd like more detail for a specific area (deployment, adding a complex integration, testing strategy), tell me which part and I’ll iterate the doc.
