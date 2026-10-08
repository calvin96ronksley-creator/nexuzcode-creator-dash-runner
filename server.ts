import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerState {
  id: string;
  name: string;
  color: string;
  skin: string;
  ready: boolean;
  score: number;
  distance: number;
  alive: boolean;
  lives: number;
  x: number;
  y: number;
  vy: number;
  action: 'run' | 'jump' | 'duck' | 'dash' | 'dead';
  hasShield: boolean;
  hasMagnet: boolean;
  hasBoost: boolean;
}

interface Room {
  id: string;
  hostId: string;
  seed: number;
  state: 'lobby' | 'countdown' | 'playing' | 'ended';
  countdownStartTime?: number;
  gameStartTime?: number;
  players: Map<string, { ws: WebSocket; state: PlayerState }>;
  chatMessages: Array<{ sender: string; text: string; time: number }>;
}

const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastToRoom(room: Room, message: object, excludeWs?: WebSocket) {
  const data = JSON.stringify(message);
  for (const [, p] of room.players) {
    if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(data);
    }
  }
}

function getRoomSnapshot(room: Room) {
  const playersList: PlayerState[] = [];
  for (const [, p] of room.players) {
    playersList.push(p.state);
  }
  return {
    roomId: room.id,
    hostId: room.hostId,
    state: room.state,
    seed: room.seed,
    countdownStartTime: room.countdownStartTime,
    gameStartTime: room.gameStartTime,
    players: playersList,
  };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // API status check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      activeRooms: rooms.size,
      totalPlayers: Array.from(rooms.values()).reduce((acc, r) => acc + r.players.size, 0),
    });
  });

  // WebSocket Server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let playerId: string = '';

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());

        switch (msg.type) {
          case 'create_room': {
            const roomId = generateRoomCode();
            playerId = String(msg.playerId || 'player_' + Math.random().toString(36).substring(2, 8));
            currentRoomId = roomId;

            const playerState: PlayerState = {
              id: playerId,
              name: msg.name?.trim() || 'Player 1',
              color: msg.color || '#06b6d4',
              skin: msg.skin || 'cyber_runner',
              ready: true,
              score: 0,
              distance: 0,
              alive: true,
              lives: 3,
              x: 80,
              y: 0,
              vy: 0,
              action: 'run',
              hasShield: false,
              hasMagnet: false,
              hasBoost: false,
            };

            const newRoom: Room = {
              id: roomId,
              hostId: playerId,
              seed: Math.floor(Math.random() * 1000000) + 1,
              state: 'lobby',
              players: new Map([[playerId, { ws, state: playerState }]]),
              chatMessages: [],
            };

            rooms.set(roomId, newRoom);

            ws.send(
              JSON.stringify({
                type: 'room_created',
                roomId,
                playerId,
                snapshot: getRoomSnapshot(newRoom),
              })
            );
            break;
          }

          case 'join_room': {
            const reqRoomId = (msg.roomId || '').toUpperCase().trim();
            const room = rooms.get(reqRoomId);

            if (!room) {
              ws.send(JSON.stringify({ type: 'error', message: 'Raum nicht gefunden!' }));
              return;
            }

            if (room.players.size >= 8) {
              ws.send(JSON.stringify({ type: 'error', message: 'Raum ist bereits voll (max 8 Spieler).' }));
              return;
            }

            if (room.state === 'playing') {
              ws.send(JSON.stringify({ type: 'error', message: 'Spiel läuft bereits in diesem Raum!' }));
              return;
            }

            playerId = String(msg.playerId || 'player_' + Math.random().toString(36).substring(2, 8));
            currentRoomId = reqRoomId;

            const playerState: PlayerState = {
              id: playerId,
              name: msg.name?.trim() || `Player ${room.players.size + 1}`,
              color: msg.color || '#ec4899',
              skin: msg.skin || 'neon_ninja',
              ready: false,
              score: 0,
              distance: 0,
              alive: true,
              lives: 3,
              x: 80,
              y: 0,
              vy: 0,
              action: 'run',
              hasShield: false,
              hasMagnet: false,
              hasBoost: false,
            };

            room.players.set(playerId, { ws, state: playerState });

            ws.send(
              JSON.stringify({
                type: 'room_joined',
                roomId: reqRoomId,
                playerId,
                snapshot: getRoomSnapshot(room),
              })
            );

            broadcastToRoom(
              room,
              {
                type: 'player_joined',
                player: playerState,
                snapshot: getRoomSnapshot(room),
              },
              ws
            );
            break;
          }

          case 'quick_match': {
            // Find any open lobby room with space
            let targetRoom: Room | null = null;
            for (const [, r] of rooms) {
              if (r.state === 'lobby' && r.players.size < 6) {
                targetRoom = r;
                break;
              }
            }

            if (targetRoom) {
              // Join existing
              playerId = String(msg.playerId || 'player_' + Math.random().toString(36).substring(2, 8));
              currentRoomId = targetRoom.id;
              const playerState: PlayerState = {
                id: playerId,
                name: msg.name?.trim() || `Racer ${targetRoom.players.size + 1}`,
                color: msg.color || '#10b981',
                skin: msg.skin || 'astro_bot',
                ready: true,
                score: 0,
                distance: 0,
                alive: true,
                lives: 3,
                x: 80,
                y: 0,
                vy: 0,
                action: 'run',
                hasShield: false,
                hasMagnet: false,
                hasBoost: false,
              };

              targetRoom.players.set(playerId, { ws, state: playerState });
              ws.send(
                JSON.stringify({
                  type: 'room_joined',
                  roomId: targetRoom.id,
                  playerId,
                  snapshot: getRoomSnapshot(targetRoom),
                })
              );
              broadcastToRoom(
                targetRoom,
                {
                  type: 'player_joined',
                  player: playerState,
                  snapshot: getRoomSnapshot(targetRoom),
                },
                ws
              );
            } else {
              // Create new
              const roomId = generateRoomCode();
              playerId = String(msg.playerId || 'player_' + Math.random().toString(36).substring(2, 8));
              currentRoomId = roomId;

              const playerState: PlayerState = {
                id: playerId,
                name: msg.name?.trim() || 'Racer 1',
                color: msg.color || '#3b82f6',
                skin: msg.skin || 'cyber_runner',
                ready: true,
                score: 0,
                distance: 0,
                alive: true,
                lives: 3,
                x: 80,
                y: 0,
                vy: 0,
                action: 'run',
                hasShield: false,
                hasMagnet: false,
                hasBoost: false,
              };

              const newRoom: Room = {
                id: roomId,
                hostId: playerId,
                seed: Math.floor(Math.random() * 1000000) + 1,
                state: 'lobby',
                players: new Map([[playerId, { ws, state: playerState }]]),
                chatMessages: [],
              };
              rooms.set(roomId, newRoom);

              ws.send(
                JSON.stringify({
                  type: 'room_created',
                  roomId,
                  playerId,
                  snapshot: getRoomSnapshot(newRoom),
                })
              );
            }
            break;
          }

          case 'toggle_ready': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const p = room.players.get(playerId);
            if (p) {
              p.state.ready = !p.state.ready;
              broadcastToRoom(room, {
                type: 'ready_changed',
                playerId,
                ready: p.state.ready,
                snapshot: getRoomSnapshot(room),
              });
            }
            break;
          }

          case 'update_profile': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const p = room.players.get(playerId);
            if (p) {
              if (msg.name) p.state.name = msg.name;
              if (msg.color) p.state.color = msg.color;
              if (msg.skin) p.state.skin = msg.skin;
              broadcastToRoom(room, {
                type: 'profile_updated',
                player: p.state,
                snapshot: getRoomSnapshot(room),
              });
            }
            break;
          }

          case 'start_game': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            if (room.hostId !== playerId && room.players.size > 1) {
              // Only host can start if multiple players
              return;
            }

            room.state = 'countdown';
            room.seed = Math.floor(Math.random() * 1000000) + 1;
            const now = Date.now();
            room.countdownStartTime = now;
            room.gameStartTime = now + 3000; // 3 second countdown

            // Reset player states for game start
            for (const [, p] of room.players) {
              p.state.score = 0;
              p.state.distance = 0;
              p.state.alive = true;
              p.state.lives = 3;
              p.state.x = 80;
              p.state.y = 0;
              p.state.vy = 0;
              p.state.action = 'run';
              p.state.hasShield = false;
              p.state.hasMagnet = false;
              p.state.hasBoost = false;
            }

            broadcastToRoom(room, {
              type: 'game_starting',
              seed: room.seed,
              countdownStartTime: room.countdownStartTime,
              gameStartTime: room.gameStartTime,
              snapshot: getRoomSnapshot(room),
            });

            // Set timeout for actual game playing state
            setTimeout(() => {
              if (rooms.get(currentRoomId!) === room && room.state === 'countdown') {
                room.state = 'playing';
                broadcastToRoom(room, {
                  type: 'game_started',
                  snapshot: getRoomSnapshot(room),
                });
              }
            }, 3000);
            break;
          }

          case 'player_sync': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room || room.state !== 'playing') return;
            const p = room.players.get(playerId);
            if (!p) return;

            // Update local state copy
            Object.assign(p.state, {
              x: msg.x ?? p.state.x,
              y: msg.y ?? p.state.y,
              vy: msg.vy ?? p.state.vy,
              action: msg.action ?? p.state.action,
              score: msg.score ?? p.state.score,
              distance: msg.distance ?? p.state.distance,
              alive: msg.alive !== undefined ? msg.alive : p.state.alive,
              lives: msg.lives !== undefined ? msg.lives : p.state.lives,
              hasShield: msg.hasShield ?? p.state.hasShield,
              hasMagnet: msg.hasMagnet ?? p.state.hasMagnet,
              hasBoost: msg.hasBoost ?? p.state.hasBoost,
            });

            // Broadcast position & status update to other players
            broadcastToRoom(
              room,
              {
                type: 'player_sync',
                playerId,
                state: p.state,
              },
              ws
            );

            // Check if all players are dead
            let anyAlive = false;
            for (const [, pl] of room.players) {
              if (pl.state.alive) {
                anyAlive = true;
                break;
              }
            }
            if (!anyAlive && room.state === 'playing') {
              room.state = 'ended';
              broadcastToRoom(room, {
                type: 'game_over',
                snapshot: getRoomSnapshot(room),
              });
            }
            break;
          }

          case 'game_event': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;

            // Broadcast specific events (e.g., powerup activated, obstacle collision, emote/taunt)
            broadcastToRoom(
              room,
              {
                type: 'game_event',
                playerId,
                event: msg.event,
                data: msg.data,
              },
              ws
            );
            break;
          }

          case 'send_chat': {
            if (!currentRoomId || !playerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const p = room.players.get(playerId);
            if (!p) return;

            const chat = {
              sender: p.state.name,
              color: p.state.color,
              text: String(msg.text || '').substring(0, 100),
              time: Date.now(),
            };
            room.chatMessages.push(chat);
            if (room.chatMessages.length > 50) room.chatMessages.shift();

            broadcastToRoom(room, {
              type: 'chat_message',
              chat,
            });
            break;
          }

          case 'p2p_signal': {
            // WebRTC Signaling: route message directly to target peer
            if (!currentRoomId || !msg.targetPlayerId) return;
            const room = rooms.get(currentRoomId);
            if (!room) return;
            const target = room.players.get(msg.targetPlayerId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(
                JSON.stringify({
                  type: 'p2p_signal',
                  fromPlayerId: playerId,
                  signal: msg.signal,
                })
              );
            }
            break;
          }

          case 'leave_room': {
            handlePlayerLeave();
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    const handlePlayerLeave = () => {
      if (!currentRoomId || !playerId) return;
      const room = rooms.get(currentRoomId);
      if (room) {
        room.players.delete(playerId);

        if (room.players.size === 0) {
          rooms.delete(currentRoomId);
        } else {
          // If host left, elect new host
          if (room.hostId === playerId) {
            const nextHostId = room.players.keys().next().value;
            if (nextHostId) room.hostId = nextHostId;
          }
          broadcastToRoom(room, {
            type: 'player_left',
            playerId,
            snapshot: getRoomSnapshot(room),
          });
        }
      }
      currentRoomId = null;
    };

    ws.on('close', () => {
      handlePlayerLeave();
    });

    ws.on('error', () => {
      handlePlayerLeave();
    });
  });

  // Integrate Vite or Static files
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = process.env.PORT || 3000;
  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
