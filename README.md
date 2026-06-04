# WRAITH

WRAITH is an autonomous red team simulation for testing counter-UAS asset placement against adaptive attacker swarm behavior. The application lets a user place defense assets, generate terrain, run an evolving drone swarm attack, and review an AI-generated battle debrief.

The project is split into:

- `frontend/`: React, TypeScript, Vite, Tailwind CSS, PixiJS, and Zustand.
- `backend/`: FastAPI simulation server with WebSocket updates, evolutionary attack generation, terrain generation, and AI-assisted debriefing.

## Project Overview

WRAITH models a top-down battlefield environment where attacker drones attempt to reach an objective while user-placed defense assets attempt to disrupt or disable them.

Core features include:

- Interactive placement, movement, and removal of jammer, interceptor, and spoofer assets.
- Adjustable imported defense asset specifications.
- Natural-language terrain prompt generation.
- Real-time swarm visualization with map coordinates and terrain overlays.
- Evolution engine for adaptive attacker tactics.
- LLM reasoning and AI-generated battle debriefs.
- Separate landing, simulation, and debrief views.

## Setup

### Prerequisites

- Node.js and npm
- Python 3.13+
- `uv` for backend dependency management
- An OpenRouter API key for AI features

Create `backend/.env`:

```bash
OPENROUTER_API_KEY=your_openrouter_key
ENV=development
```

Install and run the backend:

```bash
cd backend
uv sync
uv run uvicorn main:app --host 127.0.0.1 --port 8001
```

Health check:

```bash
curl http://127.0.0.1:8001/health
```

Expected response:

```json
{"status":"operational","system":"WRAITH"}
```

Create `frontend/.env`:

```bash
VITE_API_URL=http://127.0.0.1:8001
VITE_WS_URL=ws://127.0.0.1:8001
```

Install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, usually:

```txt
http://localhost:5173
```

## Usage

1. Open the landing page.
2. Optionally import custom defense asset specs as JSON.
3. Click `Start Simulation`.
4. Add jammer, interceptor, and spoofer assets on the map.
5. Optionally enter a terrain prompt such as `terrain like Kabul, Afghanistan`.
6. Click `Run Defense`.
7. Watch the attacker swarm and evolution engine run.
8. Click `End Simulation`, or wait for the battle to finish.
9. Open the AI battle debrief.

### Import Specs Format

Import specs as a JSON array:

```json
[
  {
    "name": "Example Jammer",
    "type": "jammer",
    "radius": 120,
    "effectiveness": 0.82,
    "latency_ms": 250
  },
  {
    "name": "Example Interceptor",
    "type": "interceptor",
    "radius": 65,
    "reload_time": 2.0,
    "effectiveness": 0.76
  }
]
```

Supported `type` values:

- `jammer`
- `interceptor`
- `spoofer`

Supported range aliases:

- `radius`
- `range_m`

Supported reload aliases:

- `reload_time`
- `reload_s`

Supported effectiveness aliases:

- `effectiveness`
- `pk`

## Production Notes

The frontend can be deployed to Vercel. The backend should run as a persistent FastAPI process because the simulation uses WebSockets.

The current no-domain deployment option uses Caddy with `sslip.io` to provide HTTPS and WSS for the DigitalOcean backend.

## AI Usage Disclosure

WRAITH uses AI in two places:

- The evolution engine can request LLM-guided attacker strategy mutations.
- The debrief page uses an LLM to generate an after-action summary from battle state, terrain, defense asset placement, and attacker strategy data.

The backend routes AI calls through OpenRouter using model aliases in `backend/ai_client.py`. AI output is used for simulation analysis and recommendations, not for real-world operational decision-making without human review.

AI tools were also used during development to assist with code generation, debugging, copywriting, and documentation.

## Development Checks

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
cd backend
uv run python -m compileall -q .
```

## Acknowledgements

Built with React, Vite, PixiJS, FastAPI, Uvicorn, OpenRouter, Caddy, and DigitalOcean.

## External Resources

- React: https://react.dev/
- Vite: https://vite.dev/
- PixiJS: https://pixijs.com/
- FastAPI: https://fastapi.tiangolo.com/
- OpenRouter: https://openrouter.ai/
- Caddy: https://caddyserver.com/
- sslip.io: https://sslip.io/
