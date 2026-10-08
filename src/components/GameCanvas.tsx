import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PlayerData, Obstacle, Collectible, Particle, FloatingText, ItemType } from '../types/game';
import { generateWorldTrack } from '../utils/prng';
import { sound } from '../utils/audio';
import { network } from '../utils/network';
import { SKINS } from '../utils/skins';
import confetti from 'canvas-confetti';
import { Heart, Zap, Shield, Magnet, Volume2, VolumeX, Flame } from 'lucide-react';

interface GameCanvasProps {
  seed: number;
  initialPlayers: PlayerData[];
  localPlayerId: string;
  isMultiplayer: boolean;
  onGameOver: (finalStats: { score: number; distance: number; rank: number; players: PlayerData[] }) => void;
  onQuit: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  seed,
  initialPlayers,
  localPlayerId,
  isMultiplayer,
  onGameOver,
  onQuit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Local game state refs
  const localPlayerRef = useRef<PlayerData>({
    id: localPlayerId,
    name: initialPlayers.find(p => p.id === localPlayerId)?.name || 'Player',
    color: initialPlayers.find(p => p.id === localPlayerId)?.color || '#06b6d4',
    skin: initialPlayers.find(p => p.id === localPlayerId)?.skin || 'cyber_runner',
    ready: true,
    score: 0,
    distance: 0,
    alive: true,
    lives: 3,
    x: 0,
    y: 0,
    vy: 0,
    action: 'run',
    hasShield: false,
    hasMagnet: false,
    hasBoost: false,
  });

  const remotePlayersRef = useRef<Map<string, PlayerData>>(new Map());

  // Game track data
  const obstaclesRef = useRef<Obstacle[]>([]);
  const itemsRef = useRef<Collectible[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  // Physics & timers
  const keysRef = useRef<{ jump: boolean; duck: boolean; dash: boolean }>({
    jump: false,
    duck: false,
    dash: false,
  });
  const jumpsLeftRef = useRef<number>(2);
  const isDuckingRef = useRef<boolean>(false);
  const dashCooldownRef = useRef<number>(0);
  const dashTimeLeftRef = useRef<number>(0);
  const invulnerableUntilRef = useRef<number>(0);
  const magnetUntilRef = useRef<number>(0);
  const boostUntilRef = useRef<number>(0);
  const shakeAmountRef = useRef<number>(0);

  // Stats for UI HUD
  const [hudState, setHudState] = useState({
    score: 0,
    distance: 0,
    lives: 3,
    hasShield: false,
    hasMagnet: false,
    hasBoost: false,
    dashReady: true,
    speed: 380,
    soundOn: sound.enabled,
    alive: true,
  });

  const [leaderboard, setLeaderboard] = useState<PlayerData[]>([]);
  const [tauntBanner, setTauntBanner] = useState<{ sender: string; text: string } | null>(null);

  // Initialize remote players
  useEffect(() => {
    initialPlayers.forEach(p => {
      if (p.id !== localPlayerId) {
        remotePlayersRef.current.set(p.id, { ...p });
      }
    });
  }, [initialPlayers, localPlayerId]);

  // Generate initial world track
  useEffect(() => {
    const { obstacles, items } = generateWorldTrack(seed, 0, 15000);
    obstaclesRef.current = obstacles;
    itemsRef.current = items;
    sound.startMusic();

    return () => {
      sound.stopMusic();
    };
  }, [seed]);

  // Network listeners
  useEffect(() => {
    const handlePlayerSync = (data: { playerId: string; state: PlayerData }) => {
      if (data.playerId !== localPlayerId && data.state) {
        remotePlayersRef.current.set(data.playerId, data.state);
      }
    };

    const handleGameEvent = (data: { playerId: string; event: string; data: any }) => {
      if (data.event === 'item_collected') {
        const item = itemsRef.current.find(it => it.id === data.data?.itemId);
        if (item) item.collected = true;
      } else if (data.event === 'taunt') {
        setTauntBanner({ sender: data.data?.sender || 'Gegner', text: data.data?.text || '🔥' });
        setTimeout(() => setTauntBanner(null), 2500);
      }
    };

    const handlePlayerLeft = (data: { playerId: string }) => {
      remotePlayersRef.current.delete(data.playerId);
    };

    network.on('player_sync', handlePlayerSync);
    network.on('game_event', handleGameEvent);
    network.on('player_left', handlePlayerLeft);

    return () => {
      network.off('player_sync', handlePlayerSync);
      network.off('game_event', handleGameEvent);
      network.off('player_left', handlePlayerLeft);
    };
  }, [localPlayerId]);

  // Input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        triggerJump();
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        triggerDuck(true);
      } else if (['KeyE', 'ShiftLeft', 'ShiftRight', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        triggerDash();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowDown', 'KeyS'].includes(e.code)) {
        triggerDuck(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const triggerJump = useCallback(() => {
    const p = localPlayerRef.current;
    if (!p.alive) return;

    if (p.y <= 2 && jumpsLeftRef.current > 0) {
      // First jump from ground
      p.vy = 620;
      p.action = 'jump';
      jumpsLeftRef.current = 1;
      sound.playJump();
      spawnDustParticles(p.x, 0, 10, '#06b6d4');
    } else if (jumpsLeftRef.current === 1) {
      // Double jump in air
      p.vy = 540;
      p.action = 'jump';
      jumpsLeftRef.current = 0;
      sound.playDoubleJump();
      spawnDustParticles(p.x, p.y, 14, '#a855f7');
    }
  }, []);

  const triggerDuck = useCallback((isDown: boolean) => {
    isDuckingRef.current = isDown;
    const p = localPlayerRef.current;
    if (!p.alive) return;
    if (isDown) {
      p.action = 'duck';
      sound.playSlide();
      if (p.y > 0) {
        // Fast drop if in air
        p.vy = -600;
      }
    } else {
      if (p.y <= 2) p.action = 'run';
    }
  }, []);

  const triggerDash = useCallback(() => {
    const p = localPlayerRef.current;
    if (!p.alive || dashCooldownRef.current > 0) return;

    dashTimeLeftRef.current = 0.35;
    dashCooldownRef.current = 3.0; // 3 second cooldown
    p.action = 'dash';
    sound.playDash();
    spawnDustParticles(p.x, p.y, 20, '#fbbf24');
  }, []);

  const spawnDustParticles = (worldX: number, y: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x: worldX,
        y: y + Math.random() * 8,
        vx: (Math.random() - 0.7) * 160,
        vy: Math.random() * 120 + 20,
        color,
        size: Math.random() * 4 + 2,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        shape: Math.random() > 0.5 ? 'spark' : 'circle',
      });
    }
  };

  const addFloatingText = (text: string, worldX: number, y: number, color: string) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      text,
      x: worldX,
      y,
      color,
      opacity: 1,
      vy: 60,
    });
  };

  // Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let syncTimer = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const gameLoop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      const p = localPlayerRef.current;
      const now = performance.now();

      // Base ground speed increases with distance
      const baseSpeed = 380 + Math.min(p.distance * 0.18, 320);
      let effectiveSpeed = baseSpeed;

      // Update Powerup Durations
      if (dashCooldownRef.current > 0) {
        dashCooldownRef.current = Math.max(0, dashCooldownRef.current - dt);
      }
      if (dashTimeLeftRef.current > 0) {
        dashTimeLeftRef.current = Math.max(0, dashTimeLeftRef.current - dt);
        effectiveSpeed *= 1.6;
      }
      if (boostUntilRef.current > now) {
        effectiveSpeed *= 1.35;
        p.hasBoost = true;
      } else {
        p.hasBoost = false;
      }
      if (magnetUntilRef.current > now) {
        p.hasMagnet = true;
      } else {
        p.hasMagnet = false;
      }

      // Physics update for local player
      if (p.alive) {
        p.x += effectiveSpeed * dt;
        p.distance = Math.floor(p.x / 10);
        // Passive score gain from distance
        p.score += Math.floor(effectiveSpeed * dt * 0.5 * (p.hasBoost ? 2 : 1));

        // Vertical movement
        p.y += p.vy * dt;
        p.vy -= 1600 * dt; // Gravity

        // Ground collision
        if (p.y <= 0) {
          p.y = 0;
          p.vy = 0;
          jumpsLeftRef.current = 2; // Reset jumps
          if (isDuckingRef.current) {
            p.action = 'duck';
          } else if (dashTimeLeftRef.current > 0) {
            p.action = 'dash';
          } else {
            p.action = 'run';
          }
        } else {
          if (dashTimeLeftRef.current > 0) {
            p.action = 'dash';
          } else if (!isDuckingRef.current) {
            p.action = 'jump';
          }
        }

        // Particle trail
        if (Math.random() < 0.6) {
          particlesRef.current.push({
            x: p.x - 15,
            y: p.y + (isDuckingRef.current ? 10 : 24),
            vx: -effectiveSpeed * 0.2,
            vy: (Math.random() - 0.5) * 30,
            color: p.hasBoost ? '#f59e0b' : p.color,
            size: p.hasBoost ? 5 : 3,
            life: 0.3,
            maxLife: 0.3,
          });
        }

        // Magnet attraction for nearby collectibles
        if (p.hasMagnet) {
          itemsRef.current.forEach(item => {
            if (!item.collected && Math.abs(item.worldX - p.x) < 260) {
              const dx = p.x - item.worldX;
              const dy = p.y + 24 - item.y;
              item.worldX += dx * 6 * dt;
              item.y += dy * 6 * dt;
            }
          });
        }

        // Collectibles collection
        const playerHitbox = {
          left: p.x - 16,
          right: p.x + 16,
          bottom: p.y,
          top: p.y + (isDuckingRef.current ? 22 : 46),
        };

        itemsRef.current.forEach(item => {
          if (item.collected) return;
          if (
            item.worldX >= playerHitbox.left - item.radius &&
            item.worldX <= playerHitbox.right + item.radius &&
            item.y >= playerHitbox.bottom - item.radius &&
            item.y <= playerHitbox.top + item.radius
          ) {
            item.collected = true;

            // Trigger collectible effect
            if (item.type === 'coin') {
              p.score += item.value * (p.hasBoost ? 2 : 1);
              sound.playCoin();
              addFloatingText(`+${item.value}`, item.worldX, item.y, '#facc15');
            } else if (item.type === 'gem') {
              p.score += item.value * (p.hasBoost ? 2 : 1);
              sound.playGem();
              addFloatingText(`+${item.value}!`, item.worldX, item.y, '#06b6d4');
            } else if (item.type === 'shield') {
              p.hasShield = true;
              sound.playPowerup();
              addFloatingText('SCHILD!', item.worldX, item.y, '#38bdf8');
            } else if (item.type === 'magnet') {
              magnetUntilRef.current = now + 8000;
              p.hasMagnet = true;
              sound.playPowerup();
              addFloatingText('MAGNET 8s!', item.worldX, item.y, '#c084fc');
            } else if (item.type === 'boost') {
              boostUntilRef.current = now + 5000;
              p.hasBoost = true;
              sound.playPowerup();
              addFloatingText('TURBO 2X!', item.worldX, item.y, '#fbbf24');
            }

            spawnDustParticles(item.worldX, item.y, 8, '#fde047');

            // Notify server/peers so item disappears for everyone
            network.sendGameEvent('item_collected', { itemId: item.id });
          }
        });

        // Dynamic track generation as player travels further
        if (p.x > obstaclesRef.current[obstaclesRef.current.length - 1]?.worldX - 5000) {
          const lastObsX = obstaclesRef.current[obstaclesRef.current.length - 1]?.worldX || p.x;
          const { obstacles: newObs, items: newItems } = generateWorldTrack(
            seed,
            lastObsX + 200,
            lastObsX + 8000,
            obstaclesRef.current.length,
            itemsRef.current.length
          );
          obstaclesRef.current.push(...newObs);
          itemsRef.current.push(...newItems);
        }

        // Obstacle Collisions
        if (now > invulnerableUntilRef.current) {
          for (const obs of obstaclesRef.current) {
            if (!obs.active) continue;

            const obsLeft = obs.worldX - obs.width / 2;
            const obsRight = obs.worldX + obs.width / 2;
            const obsBottom = obs.y;
            const obsTop = obs.y + obs.height;

            // Check AABB collision
            const collideX = playerHitbox.right > obsLeft + 6 && playerHitbox.left < obsRight - 6;
            const collideY = playerHitbox.top > obsBottom + 4 && playerHitbox.bottom < obsTop - 4;

            if (collideX && collideY) {
              if (p.hasBoost || dashTimeLeftRef.current > 0) {
                // Smash obstacle!
                obs.active = false;
                sound.playDash();
                shakeAmountRef.current = 10;
                addFloatingText('+25 CRUSH!', obs.worldX, obs.y + 30, '#f97316');
                p.score += 25;
                spawnDustParticles(obs.worldX, obs.y + 15, 25, '#f97316');
              } else if (p.hasShield) {
                // Shield absorbs hit
                p.hasShield = false;
                obs.active = false;
                invulnerableUntilRef.current = now + 1200;
                shakeAmountRef.current = 14;
                sound.playShieldBreak();
                addFloatingText('SCHILD GEBROCHEN!', p.x, p.y + 50, '#38bdf8');
                spawnDustParticles(p.x, p.y + 20, 20, '#38bdf8');
              } else {
                // Take Damage
                p.lives -= 1;
                shakeAmountRef.current = 18;
                invulnerableUntilRef.current = now + 1600;
                sound.playHit();
                addFloatingText('-1 HERZ!', p.x, p.y + 50, '#ef4444');
                spawnDustParticles(p.x, p.y + 20, 25, '#ef4444');

                if (p.lives <= 0) {
                  // Player eliminated
                  p.alive = false;
                  p.action = 'dead';
                  sound.playGameOver();
                  addFloatingText('GAME OVER!', p.x, p.y + 60, '#ef4444');

                  // Check ranks and trigger game over after brief dramatic pause
                  setTimeout(() => {
                    const allPlayers = [p, ...Array.from(remotePlayersRef.current.values())];
                    allPlayers.sort((a, b) => b.score - a.score);
                    const rank = allPlayers.findIndex(pl => pl.id === p.id) + 1;
                    onGameOver({
                      score: p.score,
                      distance: p.distance,
                      rank,
                      players: allPlayers,
                    });
                  }, 1200);
                }
              }
              break;
            }
          }
        }
      }

      // Update screen shake
      shakeAmountRef.current = Math.max(0, shakeAmountRef.current - dt * 45);

      // Network sync local player state at 25 FPS
      syncTimer += dt;
      if (syncTimer > 0.04) {
        syncTimer = 0;
        network.sendGameSync({
          x: p.x,
          y: p.y,
          vy: p.vy,
          action: p.action,
          score: p.score,
          distance: p.distance,
          alive: p.alive,
          lives: p.lives,
          hasShield: p.hasShield,
          hasMagnet: p.hasMagnet,
          hasBoost: p.hasBoost,
        });
      }

      // Update HUD state
      setHudState({
        score: p.score,
        distance: p.distance,
        lives: p.lives,
        hasShield: p.hasShield,
        hasMagnet: p.hasMagnet,
        hasBoost: p.hasBoost,
        dashReady: dashCooldownRef.current <= 0,
        speed: Math.round(effectiveSpeed),
        soundOn: sound.enabled,
        alive: p.alive,
      });

      // Update leaderboard list
      const allSorted = [p, ...Array.from(remotePlayersRef.current.values())].sort((a, b) => b.score - a.score);
      setLeaderboard(allSorted);

      // RENDER STEP
      render(ctx, canvas, p, dt, now);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [seed, onGameOver]);

  // Main Canvas Render Logic
  const render = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    localPlayer: PlayerData,
    dt: number,
    now: number
  ) => {
    const width = canvas.width;
    const height = canvas.height;
    const groundY = height - 120; // Y coordinate where floor meets air

    ctx.save();

    // Apply Screen Shake
    if (shakeAmountRef.current > 0) {
      const sx = (Math.random() - 0.5) * shakeAmountRef.current;
      const sy = (Math.random() - 0.5) * shakeAmountRef.current;
      ctx.translate(sx, sy);
    }

    // Camera follow local player
    const cameraX = localPlayer.x - 220;

    // 1. Synthwave Cyberpunk Background
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#020617'); // slate-950
    skyGrad.addColorStop(0.5, '#0f172a'); // slate-900
    skyGrad.addColorStop(1, '#1e1b4b'); // indigo-950
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, groundY);

    // Distant Neon Grid / Horizon Glow
    const horizonGlow = ctx.createLinearGradient(0, groundY - 120, 0, groundY);
    horizonGlow.addColorStop(0, 'rgba(236, 72, 153, 0)');
    horizonGlow.addColorStop(1, 'rgba(236, 72, 153, 0.25)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, groundY - 120, width, 120);

    // Parallax Starfield
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) {
      const starX = (i * 137.5 + cameraX * 0.05) % width;
      const starY = (i * 73.1) % (groundY - 100);
      const twinkle = Math.sin(now * 0.003 + i) * 0.5 + 0.5;
      ctx.globalAlpha = 0.3 + twinkle * 0.5;
      ctx.fillRect(starX, starY, 2, 2);
    }
    ctx.globalAlpha = 1.0;

    // Distant City Skyscrapers (Parallax 0.15)
    ctx.fillStyle = '#090d16';
    const cityOffset = (cameraX * 0.12) % 600;
    for (let x = -600; x < width + 600; x += 90) {
      const bldgX = x - cityOffset;
      const bldgH = 90 + ((x * 47) % 110);
      ctx.fillRect(bldgX, groundY - bldgH, 80, bldgH);

      // Building neon window lights
      ctx.fillStyle = (x % 3 === 0) ? '#06b6d4' : '#ec4899';
      ctx.globalAlpha = 0.2;
      for (let wy = groundY - bldgH + 15; wy < groundY - 15; wy += 20) {
        for (let wx = bldgX + 12; wx < bldgX + 68; wx += 16) {
          if ((wx + wy) % 5 !== 0) {
            ctx.fillRect(wx, wy, 8, 10);
          }
        }
      }
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = '#090d16';
    }

    // 2. Neon Floor Runway
    const floorGrad = ctx.createLinearGradient(0, groundY, 0, height);
    floorGrad.addColorStop(0, '#0f172a');
    floorGrad.addColorStop(1, '#020617');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, groundY, width, height - groundY);

    // Glowing Runway Line
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width, groundY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Moving Floor Grid Perspective Lines
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 1;
    const gridSpacing = 60;
    const gridOffset = cameraX % gridSpacing;
    for (let gx = -gridSpacing; gx < width + gridSpacing; gx += gridSpacing) {
      const screenGx = gx - gridOffset;
      ctx.beginPath();
      ctx.moveTo(screenGx, groundY);
      ctx.lineTo(screenGx + (screenGx - width / 2) * 0.6, height);
      ctx.stroke();
    }
    // Horizontal floor grid lines
    for (let gy = groundY + 15; gy < height; gy += 25) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }

    // 3. Render Collectibles
    itemsRef.current.forEach(item => {
      if (item.collected) return;
      const screenX = item.worldX - cameraX;
      if (screenX < -50 || screenX > width + 50) return;
      const screenY = groundY - item.y;

      const bobbing = Math.sin(now * 0.006 + item.id) * 5;

      ctx.save();
      ctx.translate(screenX, screenY + bobbing);

      if (item.type === 'coin') {
        // Spinning Gold Coin
        const spin = Math.sin(now * 0.008 + item.id);
        ctx.scale(Math.abs(spin) * 0.7 + 0.3, 1);
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, 0, item.radius * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else if (item.type === 'gem') {
        // Glowing Diamond Gem
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.moveTo(0, -item.radius);
        ctx.lineTo(item.radius, 0);
        ctx.lineTo(0, item.radius);
        ctx.lineTo(-item.radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#cffafe';
        ctx.beginPath();
        ctx.moveTo(0, -item.radius * 0.5);
        ctx.lineTo(item.radius * 0.5, 0);
        ctx.lineTo(0, item.radius * 0.5);
        ctx.lineTo(-item.radius * 0.5, 0);
        ctx.closePath();
        ctx.fill();
      } else if (item.type === 'shield') {
        // Shield Orb
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Inner icon
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-4, -5, 8, 10);
      } else if (item.type === 'magnet') {
        // Magnet Orb
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'rgba(192, 132, 252, 0.4)';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // U shape magnet
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -2, 6, 0, Math.PI);
        ctx.stroke();
      } else if (item.type === 'boost') {
        // Boost Star
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const r = i === 0 ? item.radius : item.radius;
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    });

    // 4. Render Obstacles
    obstaclesRef.current.forEach(obs => {
      if (!obs.active) return;
      const screenX = obs.worldX - cameraX;
      if (screenX < -100 || screenX > width + 100) return;
      const screenY = groundY - obs.y - obs.height;

      ctx.save();

      if (obs.type === 'low_spike') {
        // Sharp Energy Spikes
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#dc2626';

        const spikeCount = Math.max(2, Math.floor(obs.width / 14));
        const spikeW = obs.width / spikeCount;

        for (let s = 0; s < spikeCount; s++) {
          const sx = screenX - obs.width / 2 + s * spikeW;
          ctx.beginPath();
          ctx.moveTo(sx, groundY);
          ctx.lineTo(sx + spikeW / 2, groundY - obs.height);
          ctx.lineTo(sx + spikeW, groundY);
          ctx.closePath();
          ctx.fill();
        }

        // Inner glowing core
        ctx.fillStyle = '#fecaca';
        ctx.beginPath();
        ctx.moveTo(screenX - 4, groundY);
        ctx.lineTo(screenX, groundY - obs.height + 6);
        ctx.lineTo(screenX + 4, groundY);
        ctx.closePath();
        ctx.fill();
      } else if (obs.type === 'high_laser') {
        // Suspended High Laser Barrier (Slide under!)
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 16;

        // Emitter posts on left and right
        ctx.fillStyle = '#475569';
        ctx.fillRect(screenX - obs.width / 2, screenY - 10, 8, obs.height + 10);
        ctx.fillRect(screenX + obs.width / 2 - 8, screenY - 10, 8, obs.height + 10);

        // Pulsing plasma beam
        const pulse = Math.sin(now * 0.02) * 0.2 + 0.8;
        ctx.fillStyle = `rgba(236, 72, 153, ${pulse})`;
        ctx.fillRect(screenX - obs.width / 2 + 8, screenY + 4, obs.width - 16, obs.height - 8);

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(screenX - obs.width / 2 + 8, screenY + obs.height / 2 - 2, obs.width - 16, 4);

        // Warning text indicator
        ctx.fillStyle = '#f472b6';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillText('▼ DUCK', screenX - 22, screenY - 16);
      } else if (obs.type === 'drone') {
        // Floating Cyber Drone
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(screenX - obs.width / 2, screenY, obs.width, obs.height, 6);
        ctx.fill();

        // Glowing red sensor eye
        const eyeColor = Math.sin(now * 0.01) > 0 ? '#ef4444' : '#f87171';
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(screenX, screenY + obs.height / 2, 6, 0, Math.PI * 2);
        ctx.fill();

        // Propeller rotor blur on top
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX - 18, screenY - 4);
        ctx.lineTo(screenX + 18, screenY - 4);
        ctx.stroke();
      } else {
        // Plasma Barrier (Tall)
        ctx.shadowColor = '#8b5cf6';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#7c3aed';
        ctx.fillRect(screenX - obs.width / 2, screenY, obs.width, obs.height);

        // Electric arc in middle
        ctx.fillStyle = '#ddd6fe';
        ctx.fillRect(screenX - 3, screenY + 4, 6, obs.height - 8);
      }

      ctx.restore();
    });

    // 5. Render Remote Players (Opponents in Multiplayer)
    remotePlayersRef.current.forEach(remote => {
      const screenX = remote.x - cameraX;
      if (screenX < -150 || screenX > width + 150) return;
      const screenY = groundY - remote.y;

      renderCharacter(ctx, remote, screenX, screenY, true, now);
    });

    // 6. Render Local Player
    const localScreenX = localPlayer.x - cameraX;
    const localScreenY = groundY - localPlayer.y;
    const isInvulnerable = now < invulnerableUntilRef.current;
    const flashVisible = isInvulnerable ? Math.floor(now / 80) % 2 === 0 : true;

    if (flashVisible) {
      renderCharacter(ctx, localPlayer, localScreenX, localScreenY, false, now);
    }

    // 7. Render Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.life -= dt;
      if (p.life <= 0) {
        particlesRef.current.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const pScreenX = p.x - cameraX;
      const pScreenY = groundY - p.y;
      const alpha = p.life / p.maxLife;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pScreenX, pScreenY, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 8. Render Floating Texts
    for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
      const ft = floatingTextsRef.current[i];
      ft.y += ft.vy * dt;
      ft.opacity -= dt * 0.9;
      if (ft.opacity <= 0) {
        floatingTextsRef.current.splice(i, 1);
        continue;
      }

      const ftScreenX = ft.x - cameraX;
      const ftScreenY = groundY - ft.y;

      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.opacity);
      ctx.fillStyle = ft.color;
      ctx.font = 'bold 13px "Press Start 2P", monospace';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ftScreenX - 20, ftScreenY);
      ctx.restore();
    }

    ctx.restore();
  };

  // Helper to render a player character (both local and remote)
  const renderCharacter = (
    ctx: CanvasRenderingContext2D,
    p: PlayerData,
    screenX: number,
    screenY: number,
    isRemote: boolean,
    now: number
  ) => {
    ctx.save();

    // If dead: render as floating spectator ghost
    if (!p.alive) {
      ctx.globalAlpha = isRemote ? 0.45 : 0.65;
      const floatY = Math.sin(now * 0.005 + screenX) * 8;
      ctx.translate(screenX, screenY - 30 + floatY);

      // Ghost silhouette
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, -12, 14, Math.PI, 0);
      ctx.lineTo(14, 10);
      ctx.lineTo(7, 4);
      ctx.lineTo(0, 10);
      ctx.lineTo(-7, 4);
      ctx.lineTo(-14, 10);
      ctx.closePath();
      ctx.fill();

      // Ghost eyes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-5, -12, 3, 0, Math.PI * 2);
      ctx.arc(5, -12, 3, 0, Math.PI * 2);
      ctx.fill();

      // Ghost Name Tag
      ctx.font = '10px "Outfit", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`👻 ${p.name}`, -25, -28);
      ctx.restore();
      return;
    }

    // Running animation phase
    const runCycle = Math.sin(now * 0.016 + screenX * 0.1);
    const isDucking = p.action === 'duck';
    const isDashing = p.action === 'dash';

    // Remote player transparency slightly distinct
    if (isRemote) {
      ctx.globalAlpha = 0.85;
    }

    // Name tag & Live score above head
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    const tagY = screenY - (isDucking ? 36 : 60);
    ctx.fillText(`${p.name} (${p.score}p)`, screenX, tagY);

    // If Dashing: Draw Neon Speed Blur Silhouette
    if (isDashing) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screenX - 25, screenY - 24, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.arc(screenX - 45, screenY - 24, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Shield Bubble
    if (p.hasShield) {
      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      const bubbleR = isDucking ? 22 : 28;
      const bubbleY = isDucking ? screenY - 14 : screenY - 26;
      ctx.arc(screenX, bubbleY, bubbleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Magnet Pulsing Ring
    if (p.hasMagnet) {
      ctx.save();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.7)';
      ctx.lineWidth = 1.5;
      const pulseR = 30 + (Math.sin(now * 0.01) * 6);
      ctx.beginPath();
      ctx.arc(screenX, screenY - 24, pulseR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Boost Flames
    if (p.hasBoost) {
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screenX, screenY - 24, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // DRAW CHARACTER BODY BASED ON ACTION & SKIN
    ctx.translate(screenX, screenY);

    if (isDucking) {
      // Sliding posture (compact horizontal body)
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-22, -18, 44, 16, 6);
      ctx.fill();

      // Sliding visor
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, -15, 8, 5);

      // Slide spark under body
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-16, -2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Standing / Running / Jumping posture
      const legOffset = runCycle * 10;

      // Legs / Thrusters
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';

      // Left leg
      ctx.beginPath();
      ctx.moveTo(-6, -18);
      ctx.lineTo(-6 + legOffset, 0);
      ctx.stroke();

      // Right leg
      ctx.beginPath();
      ctx.moveTo(6, -18);
      ctx.lineTo(6 - legOffset, 0);
      ctx.stroke();

      // Torso / Suit
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-12, -34, 24, 20, 4);
      ctx.fill();
      ctx.stroke();

      // Chest emblem / energy core
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, -24, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Head & Helmet
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(-11, -48, 22, 16, 6);
      ctx.fill();

      // Skin Specific Decorations:
      if (p.skin === 'neon_ninja') {
        // Ninja headband tail flapping behind
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-11, -42);
        ctx.quadraticCurveTo(-24, -40 + runCycle * 6, -32, -44 + runCycle * 4);
        ctx.stroke();
      } else if (p.skin === 'astro_bot') {
        // Antenna with blinking beacon
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -48);
        ctx.lineTo(0, -56);
        ctx.stroke();
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(0, -56, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.skin === 'pixel_cat') {
        // Cat ears
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-9, -48);
        ctx.lineTo(-13, -56);
        ctx.lineTo(-4, -48);
        ctx.moveTo(9, -48);
        ctx.lineTo(13, -56);
        ctx.lineTo(4, -48);
        ctx.fill();
      } else if (p.skin === 'solar_knight') {
        // Energy cape
        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.beginPath();
        ctx.moveTo(-10, -32);
        ctx.lineTo(-24, -14 + runCycle * 4);
        ctx.lineTo(-6, -24);
        ctx.closePath();
        ctx.fill();
      }

      // Visor Eye
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 6;
      ctx.fillRect(2, -43, 7, 4);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  };

  const handleSendTaunt = (emoji: string) => {
    network.sendGameEvent('taunt', {
      sender: localPlayerRef.current.name,
      text: emoji,
    });
    setTauntBanner({ sender: 'Du', text: emoji });
    setTimeout(() => setTauntBanner(null), 2500);
  };

  const toggleSound = () => {
    sound.enabled = !sound.enabled;
    if (sound.enabled) sound.startMusic();
    else sound.stopMusic();
    setHudState(prev => ({ ...prev, soundOn: sound.enabled }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-950 font-['Outfit']">
      {/* 2D Canvas */}
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Top Header HUD */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
        {/* Left: Hearts & Score */}
        <div className="flex items-center gap-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-2xl px-4 py-2.5 pointer-events-auto shadow-xl">
          {/* Hearts */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3].map(h => (
              <Heart
                key={h}
                className={`w-6 h-6 transition-all duration-300 ${
                  h <= hudState.lives
                    ? 'fill-red-500 text-red-500 scale-100 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]'
                    : 'text-slate-600 scale-90'
                }`}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-slate-700" />

          {/* Score & Distance */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Punkte</span>
            <span className="text-xl font-black font-['Press_Start_2P'] text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">
              {hudState.score}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Distanz</span>
            <span className="text-sm font-extrabold text-cyan-400">{hudState.distance} m</span>
          </div>
        </div>

        {/* Center: Active Buffs & Taunt Alert */}
        <div className="flex flex-col items-center gap-2 pointer-events-auto">
          {tauntBanner && (
            <div className="animate-bounce bg-pink-600/90 text-white font-black px-4 py-1.5 rounded-full shadow-lg border border-pink-400 text-sm flex items-center gap-2">
              <span>{tauntBanner.sender}:</span>
              <span className="text-xl">{tauntBanner.text}</span>
            </div>
          )}

          {/* Buff Indicators */}
          <div className="flex items-center gap-2">
            {hudState.hasShield && (
              <div className="flex items-center gap-1 bg-sky-500/20 border border-sky-400 text-sky-300 px-2.5 py-1 rounded-lg text-xs font-bold animate-pulse">
                <Shield className="w-3.5 h-3.5" /> Schild aktiv
              </div>
            )}
            {hudState.hasMagnet && (
              <div className="flex items-center gap-1 bg-purple-500/20 border border-purple-400 text-purple-300 px-2.5 py-1 rounded-lg text-xs font-bold animate-pulse">
                <Magnet className="w-3.5 h-3.5" /> Magnet
              </div>
            )}
            {hudState.hasBoost && (
              <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-400 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold animate-pulse">
                <Flame className="w-3.5 h-3.5" /> 2X TURBO
              </div>
            )}
          </div>
        </div>

        {/* Right: Sound, Leaderboard & Quit */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={toggleSound}
            className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors shadow-md"
            title="Audio an/aus"
          >
            {hudState.soundOn ? <Volume2 className="w-5 h-5 text-cyan-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>

          <button
            onClick={onQuit}
            className="px-3.5 py-2 rounded-xl bg-slate-900/80 border border-red-500/40 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-colors shadow-md"
          >
            Beenden
          </button>
        </div>
      </div>

      {/* Mini Multiplayer Leaderboard / Race Distance Tracker */}
      {isMultiplayer && leaderboard.length > 1 && (
        <div className="absolute top-20 right-4 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-2xl p-3 shadow-xl z-20 w-52 pointer-events-none">
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
            <span>Rennen Live</span>
            <span className="text-cyan-400 font-mono text-[9px]">{leaderboard.length} Spieler</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {leaderboard.map((pl, idx) => (
              <div
                key={pl.id}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg transition-all ${
                  pl.id === localPlayerId
                    ? 'bg-cyan-950/70 border border-cyan-500/40 font-bold text-white'
                    : 'text-slate-300 bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={`text-[10px] w-4 font-mono ${idx === 0 ? 'text-yellow-400 font-bold' : 'text-slate-400'}`}>
                    #{idx + 1}
                  </span>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pl.color }} />
                  <span className="truncate max-w-[80px]">{pl.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 font-mono text-[11px]">
                  <span>{pl.score}</span>
                  {!pl.alive && <span className="text-[9px] text-red-400">💀</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Taunt Bar (Multiplayer) */}
      {isMultiplayer && hudState.alive && (
        <div className="absolute bottom-28 left-4 flex items-center gap-1.5 z-20 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 p-1.5 rounded-xl">
          {['🔥', '⚡', '🚀', '👑', '😎', 'GG'].map(emoji => (
            <button
              key={emoji}
              onClick={() => handleSendTaunt(emoji)}
              className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700 active:scale-95 text-base flex items-center justify-center transition-transform"
              title={`Taunt: ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Mobile / Touch & Quick Button Controls */}
      <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between pointer-events-none z-20">
        {/* Left: Duck / Slide Button */}
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onPointerDown={() => triggerDuck(true)}
            onPointerUp={() => triggerDuck(false)}
            onPointerLeave={() => triggerDuck(false)}
            className="w-20 h-20 rounded-2xl bg-slate-900/85 active:bg-pink-600/40 border-2 border-pink-500/70 text-pink-400 active:scale-95 transition-all shadow-[0_0_20px_rgba(236,72,153,0.3)] flex flex-col items-center justify-center gap-1"
          >
            <span className="text-xl font-bold">▼</span>
            <span className="text-[10px] font-black uppercase tracking-wider">Duck (S)</span>
          </button>

          {/* Dash Button */}
          <button
            onClick={triggerDash}
            disabled={!hudState.dashReady}
            className={`w-16 h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 ${
              hudState.dashReady
                ? 'bg-slate-900/85 border-amber-500/80 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                : 'bg-slate-900/40 border-slate-700 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Zap className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase">Dash (E)</span>
          </button>
        </div>

        {/* Right: Big Jump Button */}
        <div className="pointer-events-auto">
          <button
            onPointerDown={triggerJump}
            className="w-24 h-24 rounded-3xl bg-cyan-500/20 active:bg-cyan-500/40 border-3 border-cyan-400 text-cyan-300 active:scale-95 transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] flex flex-col items-center justify-center gap-1"
          >
            <span className="text-2xl font-black">▲</span>
            <span className="text-xs font-black uppercase tracking-wider">JUMP</span>
            <span className="text-[9px] text-cyan-200/70">(Space / 2x)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
