To start this server cleanly - docker-compose up --build app

POST - http://localhost:3000/crud

{
"prompt": "i want to add into entity users email mysoude@villy.com, name John Cena, password_hash noasfoj21, phone_number- 8372975632"
}

// Obviously all the fields should be your database fields and ENTITY should be your "table name".

## Runtime configuration (env vars)

You can control server port and AI routing via environment variables.

- `PORT` — port the Node server listens on (default `5050`).
- `AI_MODE` — `'proxy'` (default) or `'direct'`. If `proxy`, frontends should call the local `/api/ai` endpoint and the server will forward to the external AI. If `direct`, frontends will call the `AI_DIRECT_URL` directly.
- `AI_DIRECT_URL` — when `AI_MODE=direct`, the client will POST to this URL (default `http://localhost:7860/large`).
- `HF_DEFAULT_MODEL` — model identifier used by server-side HuggingFace proxy when applicable.

Examples (PowerShell):

```powershell
$env:PORT = '5050';
$env:AI_MODE = 'proxy';
node .\\server.js
```

## Orchestration Guide

For step-by-step instructions on designing and building orchestrations (non-technical friendly), including a worked example for an insurance claims triage workflow, see the guide:

- **Orchestration Guide:** [docs/ORCHESTRATION_GUIDE.md](docs/ORCHESTRATION_GUIDE.md)

The guide includes taxonomy and rules examples, sample payloads, and a walkthrough for creating workflows in the builder UI.
