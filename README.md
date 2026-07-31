# LLL Humanize

Developed by LLL Inc.'s dev team — visit us at https://www.live-laugh-love.world

A writing-integrity toolkit with three tools in one page: check for plagiarism,
scan for AI-writing signals, and rewrite text to sound more human.

## Features

- **Plagiarism** — compares two texts for overlapping passages using shingle matching; supports both space-delimited languages and CJK text
- **Detector** — analyzes text for stylometric signals associated with AI writing (sentence-length uniformity, lexical variety, hedge phrases, etc.); deliberately reports signals rather than a verdict, since no reliable verdict exists
- **Humanize** — rewrites text to sound more naturally human-written, with light/medium/strong rewrite strength, via a Cloudflare Pages Function that calls the Anthropic API
- **Multi-language UI**

## Tech

- Frontend: plain HTML/CSS/JS (`index.html`, `app.js`, `plagiarism.js`, `detector.js`, `strings.js`) — plagiarism/detector logic runs entirely client-side
- Backend: Cloudflare Pages Function (`functions/api/humanize.js`) proxying to the Anthropic API for the Humanize feature

## Setup

The Humanize feature requires an Anthropic API key set as a Pages secret:

```bash
npx wrangler pages secret put ANTHROPIC_API_KEY --project-name lll-humanize
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/humanize` | POST | Body: `{ text, strength: "light" \| "medium" \| "strong" }`. Returns `{ rewritten }` |