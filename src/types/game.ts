export type ActionType = 'run' | 'jump' | 'duck' | 'dash' | 'dead';

export interface PlayerData {
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
  y: number; // 0 is ground, positive is in air
  vy: number;
  action: ActionType;
  hasShield: boolean;
  hasMagnet: boolean;
  hasBoost: boolean;
}

export type ObstacleType = 
  | 'low_spike'      // jump over
  | 'high_laser'     // slide / duck under
  | 'drone'          // floating drone (duck or jump depending on gap)
  | 'energy_pillar'  // tall moving beam
  | 'plasma_barrier';// glowing barrier

export interface Obstacle {
  id: number;
  worldX: number;
  type: ObstacleType;
  width: number;
  height: number;
  y: number; // y from ground
  active: boolean;
  color?: string;
}

export type ItemType = 'coin' | 'gem' | 'shield' | 'magnet' | 'boost';

export interface Collectible {
  id: number;
  worldX: number;
  y: number;
  type: ItemType;
  value: number;
  collected: boolean;
  radius: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  shape?: 'circle' | 'square' | 'spark';
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  opacity: number;
  vy: number;
}

export interface RoomSnapshot {
  roomId: string;
  hostId: string;
  state: 'lobby' | 'countdown' | 'playing' | 'ended';
  seed: number;
  countdownStartTime?: number;
  gameStartTime?: number;
  players: PlayerData[];
}

export interface ChatMessage {
  sender: string;
  color?: string;
  text: string;
  time: number;
}
