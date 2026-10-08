import { PlayerData, RoomSnapshot } from '../types/game';

type MessageHandler = (data: any) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private handlers: Map<string, MessageHandler[]> = new Map();
  public localPlayerId: string = 'player_' + Math.random().toString(36).substring(2, 8);
  public currentRoomId: string | null = null;
  public isHost: boolean = false;
  public p2pActivePeers: Set<string> = new Set();
  public connected: boolean = false;

  constructor() {
    // Generate or retrieve persistent local ID from sessionStorage
    const stored = sessionStorage.getItem('dash_clash_pid');
    if (stored) {
      this.localPlayerId = stored;
    } else {
      sessionStorage.setItem('dash_clash_pid', this.localPlayerId);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.connected = true;
          this.emit('connection_status', { connected: true });
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingMessage(data);
          } catch (e) {
            console.error('Error parsing WS message:', e);
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.emit('connection_status', { connected: false });
          // Attempt auto reconnect after 2 seconds
          setTimeout(() => {
            if (!this.connected) this.connect().catch(() => {});
          }, 2000);
        };

        this.ws.onerror = (err) => {
          this.connected = false;
          reject(err);
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  on(event: string, handler: MessageHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: MessageHandler) {
    const list = this.handlers.get(event);
    if (list) {
      this.handlers.set(event, list.filter(h => h !== handler));
    }
  }

  private emit(event: string, data: any) {
    const list = this.handlers.get(event);
    if (list) {
      list.forEach(handler => handler(data));
    }
  }

  private handleIncomingMessage(msg: any) {
    switch (msg.type) {
      case 'room_created':
        this.currentRoomId = msg.roomId;
        this.localPlayerId = msg.playerId;
        this.isHost = true;
        this.emit('room_created', msg);
        break;

      case 'room_joined':
        this.currentRoomId = msg.roomId;
        this.localPlayerId = msg.playerId;
        this.isHost = msg.snapshot.hostId === msg.playerId;
        this.emit('room_joined', msg);
        // If joining, initiate WebRTC P2P to existing peers
        this.setupP2PWithPeers(msg.snapshot.players);
        break;

      case 'player_joined':
        this.emit('player_joined', msg);
        // Setup P2P connection with newly joined player
        if (msg.player && msg.player.id !== this.localPlayerId) {
          this.initiateP2PPeer(msg.player.id);
        }
        break;

      case 'ready_changed':
      case 'profile_updated':
        this.emit('room_update', msg);
        break;

      case 'game_starting':
        this.emit('game_starting', msg);
        break;

      case 'game_started':
        this.emit('game_started', msg);
        break;

      case 'player_sync':
        this.emit('player_sync', msg);
        break;

      case 'game_event':
        this.emit('game_event', msg);
        break;

      case 'chat_message':
        this.emit('chat_message', msg);
        break;

      case 'game_over':
        this.emit('game_over', msg);
        break;

      case 'player_left':
        this.emit('player_left', msg);
        if (msg.playerId) {
          this.closeP2PPeer(msg.playerId);
        }
        break;

      case 'error':
        this.emit('error', msg.message);
        break;

      case 'p2p_signal':
        this.handleP2PSignal(msg.fromPlayerId, msg.signal);
        break;

      default:
        this.emit(msg.type, msg);
        break;
    }
  }

  // WebRTC P2P Implementation
  private async setupP2PWithPeers(players: PlayerData[]) {
    for (const p of players) {
      if (p.id !== this.localPlayerId) {
        this.initiateP2PPeer(p.id);
      }
    }
  }

  private async initiateP2PPeer(targetPlayerId: string) {
    if (this.peerConnections.has(targetPlayerId)) return;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      this.peerConnections.set(targetPlayerId, pc);

      // Create WebRTC DataChannel for low latency game data
      const dc = pc.createDataChannel('game_sync', {
        ordered: false,
        maxRetransmits: 0,
      });
      this.setupDataChannel(targetPlayerId, dc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal(targetPlayerId, { candidate: event.candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal(targetPlayerId, { sdp: pc.localDescription });
    } catch (e) {
      console.warn('P2P offer error, falling back to WebSocket:', e);
    }
  }

  private async handleP2PSignal(fromPlayerId: string, signal: any) {
    try {
      let pc = this.peerConnections.get(fromPlayerId);

      if (!pc) {
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        this.peerConnections.set(fromPlayerId, pc);

        pc.ondatachannel = (event) => {
          this.setupDataChannel(fromPlayerId, event.channel);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignal(fromPlayerId, { candidate: event.candidate });
          }
        };
      }

      if (signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.sendSignal(fromPlayerId, { sdp: pc.localDescription });
        }
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn('P2P signaling error:', err);
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel) {
    this.dataChannels.set(peerId, dc);

    dc.onopen = () => {
      this.p2pActivePeers.add(peerId);
      this.emit('p2p_connected', { peerId });
    };

    dc.onclose = () => {
      this.p2pActivePeers.delete(peerId);
    };

    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'player_sync') {
          this.emit('player_sync', msg);
        } else if (msg.type === 'game_event') {
          this.emit('game_event', msg);
        }
      } catch (err) {
        console.error('P2P DataChannel parse error:', err);
      }
    };
  }

  private sendSignal(targetPlayerId: string, signal: any) {
    this.send({
      type: 'p2p_signal',
      targetPlayerId,
      signal,
    });
  }

  private closeP2PPeer(peerId: string) {
    const dc = this.dataChannels.get(peerId);
    if (dc) dc.close();
    this.dataChannels.delete(peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) pc.close();
    this.peerConnections.delete(peerId);

    this.p2pActivePeers.delete(peerId);
  }

  // Generic message dispatch (uses WebRTC DataChannel if open, falls back to WebSocket)
  sendGameSync(syncData: any) {
    const packet = JSON.stringify({
      type: 'player_sync',
      playerId: this.localPlayerId,
      ...syncData,
    });

    // Send through P2P DataChannels to connected peers
    let sentViaP2P = false;
    for (const [, dc] of this.dataChannels) {
      if (dc.readyState === 'open') {
        try {
          dc.send(packet);
          sentViaP2P = true;
        } catch {}
      }
    }

    // Always send or fallback through WebSocket server for consistency and spectators
    this.send({
      type: 'player_sync',
      ...syncData,
    });
  }

  send(data: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // Room Actions
  createRoom(name: string, color: string, skin: string) {
    this.send({
      type: 'create_room',
      playerId: this.localPlayerId,
      name,
      color,
      skin,
    });
  }

  joinRoom(roomId: string, name: string, color: string, skin: string) {
    this.send({
      type: 'join_room',
      roomId,
      playerId: this.localPlayerId,
      name,
      color,
      skin,
    });
  }

  quickMatch(name: string, color: string, skin: string) {
    this.send({
      type: 'quick_match',
      playerId: this.localPlayerId,
      name,
      color,
      skin,
    });
  }

  toggleReady() {
    this.send({ type: 'toggle_ready' });
  }

  updateProfile(name: string, color: string, skin: string) {
    this.send({
      type: 'update_profile',
      name,
      color,
      skin,
    });
  }

  startGame() {
    this.send({ type: 'start_game' });
  }

  sendGameEvent(event: string, data?: any) {
    this.send({
      type: 'game_event',
      event,
      data,
    });
  }

  sendChat(text: string) {
    this.send({
      type: 'send_chat',
      text,
    });
  }

  leaveRoom() {
    this.send({ type: 'leave_room' });
    this.currentRoomId = null;
    this.isHost = false;
    for (const [, dc] of this.dataChannels) dc.close();
    for (const [, pc] of this.peerConnections) pc.close();
    this.dataChannels.clear();
    this.peerConnections.clear();
    this.p2pActivePeers.clear();
  }
}

export const network = new NetworkManager();
