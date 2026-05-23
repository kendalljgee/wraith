from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from swarm import make_battle, tick, serialize_state, DT
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="WRAITH Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, ws: WebSocket, session_id: str):
        await ws.accept()
        self.active.setdefault(session_id, []).append(ws)

    def disconnect(self, ws: WebSocket, session_id: str):
        if ws in self.active.get(session_id, []):
            self.active[session_id].remove(ws)

    async def broadcast(self, session_id: str, data: dict):
        for ws in self.active.get(session_id, []):
            try:
                await ws.send_json(data)
            except Exception:
                pass

manager = ConnectionManager()
active_battles: dict[str, tuple] = {}

@app.get("/health")
async def health():
    return {"status": "operational", "system": "WRAITH"}

@app.post("/api/battle/start")
async def start_battle(n_drones: int = 30):
    state, strategy = make_battle(n_drones=n_drones)
    active_battles[state.session_id] = (state, strategy)
    return {"session_id": state.session_id}

@app.websocket("/ws/battle/{session_id}")
async def battle_ws(ws: WebSocket, session_id: str):
    await manager.connect(ws, session_id)

    if session_id not in active_battles:
        state, strategy = make_battle(session_id=session_id)
        active_battles[session_id] = (state, strategy)

    try:
        while True:
            state, strategy = active_battles[session_id]

            if not state.terminal:
                state = tick(state, strategy)
                active_battles[session_id] = (state, strategy)

            await manager.broadcast(session_id, serialize_state(state))
            await asyncio.sleep(DT)

    except WebSocketDisconnect:
        manager.disconnect(ws, session_id)
        active_battles.pop(session_id, None)