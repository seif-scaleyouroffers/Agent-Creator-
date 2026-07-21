# Scale Your Offers — Session Prep Agent

A conversational agent that preps Patrick's Tuesday/Thursday coaching sessions.
You chat with it about the client and what's going on, it asks a few sharp
questions, then generates:

- A **session talking-points plan** (in Patrick's voice) → downloadable as `.docx`
- **Slides**, only when needed → viewed inline in the app (no download)

The voice is hard-coded from real transcripts (`lib/voice-guide.ts`), not
user-editable at runtime — that's intentional, so the output is consistent
regardless of who's using the tool.

## How it works

1. `app/api/chat/route.ts` — the conversational intake. Calls Claude with a
   `finalize_session` tool. The model asks questions until it has enough
   (client, situation, goal, whether slides are needed), then calls the tool.
2. `app/api/generate/route.ts` — once intake is finalized, this drafts the
   actual plan (and slides, if requested) in Patrick's voice using
   `lib/voice-guide.ts` + `lib/curriculum.ts` as context.
3. `app/api/docx/route.ts` — converts the generated plan into a `.docx` file
   using the `docx` npm package.
4. `components/ChatUI.tsx` + `components/SlideViewer.tsx` — the two-pane UI:
   intake on the left, plan/slides on the right.

## Local setup

```bash
npm install
cp .env.example .env.local   # then add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000

## Deploying

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: session prep agent"
git branch -M main
git remote add origin https://github.com/<your-org>/<your-repo>.git
git push -u origin main
```

### 2. Deploy on Vercel

1. Go to https://vercel.com/new and import the GitHub repo.
2. Framework preset: Next.js (auto-detected).
3. Add an Environment Variable:
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy.

That's it — no database, no auth in this version. Anyone with the link can
use it, so if this needs to be private, add password protection at the Vercel
project level (Settings → Deployment Protection) or put it behind your
existing team login.

## Updating the voice

Edit `lib/voice-guide.ts` directly and redeploy (push to `main` — Vercel
redeploys automatically). Keeping it in code instead of a settings screen
means the brand voice can't drift without someone deliberately changing it.

## Updating the curriculum reference

Edit `lib/curriculum.ts` as modules change. This is just context the agent
uses to connect a session to the right framework — it's not shown to end
clients.

## Phase 2 idea: connecting a Google Drive folder

You mentioned wanting the agent to stay in sync with a Drive folder of video
descriptions/transcripts as you add more of them, rather than manually pasting
updates into `voice-guide.ts`. That's a reasonable next step, but it's a
meaningfully bigger piece of infrastructure than this MVP, so it's worth
scoping separately. Two realistic paths:

**A. On-demand read (simpler)**
Add a Google Drive API call (service account with read-only access to a
specific shared folder) inside `app/api/generate/route.ts` that pulls the
latest file contents before drafting. Simple, but re-reads the whole folder
on every generation — fine if the folder stays small.

**B. Synced knowledge base (scales better)**
A scheduled job (Vercel Cron) that periodically reads the Drive folder,
chunks new/changed files, and stores them (e.g. in a vector store or even a
simple JSON blob in Vercel KV/Blob storage) that `generate/route.ts` queries
at request time instead of re-reading Drive live. More setup, but stays fast
and cheap as the folder grows.

Either path needs a Google Cloud project with the Drive API enabled and a
service account granted access to the folder — happy to build either one out
once you've got that set up, or if you'd rather keep it manual for now,
pasting new transcripts into `voice-guide.ts` works fine too.
