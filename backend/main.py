from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/health")
async def health():
    return {"status": "operational", "system": "WRAITH"}

@app.websocket("/ws/battle/{session_id}")
async def battle_ws(ws: WebSocket, session_id: str):
    await manager.connect(ws, session_id)
    try:
        while True:
            # Swarm engine plugs in here Week 1 Day 3
            await manager.broadcast(session_id, {"type": "ping"})
            await asyncio.sleep(1/30)
    except WebSocketDisconnect:
        manager.disconnect(ws, session_id)
