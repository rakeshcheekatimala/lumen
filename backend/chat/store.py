from fastapi import WebSocket
from collections import deque
from typing import List
import json
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"[CM] ✓ New connection accepted. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"[CM] ✗ Connection removed. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        logger.info(f"[CM] ╔════════════════════════════════════")
        logger.info(f"[CM] ║ BROADCAST START")
        logger.info(f"[CM] ║ Active connections: {len(self.active_connections)}")
        logger.info(f"[CM] ║ Message type: {message.get('type')}")
        logger.info(f"[CM] ║ Message from: {message.get('username')}")
        logger.info(f"[CM] ║ Content length: {len(message.get('content', ''))}")
        
        if len(self.active_connections) == 0:
            logger.error(f"[CM] ║ ✗ NO CONNECTIONS TO BROADCAST TO!")
            logger.info(f"[CM] ╚════════════════════════════════════")
            return
        
        disconnected = []
        json_str = json.dumps(message)
        logger.info(f"[CM] ║ Serialized size: {len(json_str)} bytes")
        
        for i, connection in enumerate(self.active_connections):
            try:
                logger.info(f"[CM] ║ Sending to connection {i+1}/{len(self.active_connections)}...")
                await connection.send_json(message)
                logger.info(f"[CM] ║   ✓ Successfully sent")
            except Exception as e:
                logger.error(f"[CM] ║   ✗ FAILED: {type(e).__name__}: {str(e)[:100]}")
                disconnected.append(connection)
        
        # Clean up dead connections
        if disconnected:
            logger.info(f"[CM] ║ Cleaning up {len(disconnected)} dead connections...")
            for conn in disconnected:
                if conn in self.active_connections:
                    self.active_connections.remove(conn)
            logger.info(f"[CM] ║ Cleaned. Remaining: {len(self.active_connections)}")
        
        logger.info(f"[CM] ║ ✓ Broadcast complete")
        logger.info(f"[CM] ╚════════════════════════════════════")


class ChatStore:
    def __init__(self, max_messages: int = 200):
        self.messages: deque = deque(maxlen=max_messages)

    def add_message(self, message: dict):
        self.messages.append(message)

    def get_messages(self) -> List[dict]:
        return list(self.messages)


# Singletons
connection_manager = ConnectionManager()
chat_store = ChatStore()
