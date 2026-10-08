import { Obstacle, Collectible, ObstacleType, ItemType } from '../types/game';

// Mulberry32 32-bit PRNG
export class SeededRandom {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  // Returns random float in [0, 1)
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in range [min, max]
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/**
 * Deterministically generates a chunk of obstacles and collectibles based on worldX range and seed.
 */
export function generateWorldTrack(
  seed: number,
  startX: number,
  endX: number,
  existingObstacleCount: number = 0,
  existingItemCount: number = 0
): { obstacles: Obstacle[]; items: Collectible[] } {
  const obstacles: Obstacle[] = [];
  const items: Collectible[] = [];

  // Use a derived seed based on base seed + chunk index
  const chunkSize = 2000;
  const startChunk = Math.floor(startX / chunkSize);
  const endChunk = Math.floor(endX / chunkSize);

  let obstacleId = existingObstacleCount;
  let itemId = existingItemCount;

  for (let c = startChunk; c <= endChunk; c++) {
    const chunkSeed = (seed + c * 1013904223) >>> 0;
    const rng = new SeededRandom(chunkSeed);

    const chunkStartX = Math.max(startX, c * chunkSize);
    const chunkEndX = Math.min(endX, (c + 1) * chunkSize);

    // Initial safe buffer: don't spawn obstacles in first 500px of the track
    let currentX = Math.max(chunkStartX, 600);

    while (currentX < chunkEndX - 150) {
      // Distance between hazards depends slightly on difficulty (distance)
      const gap = rng.range(280, 480);
      currentX += gap;

      if (currentX >= chunkEndX) break;

      // Decide hazard type
      const roll = rng.next();
      let type: ObstacleType = 'low_spike';
      let width = 36;
      let height = 40;
      let y = 0; // ground level

      if (roll < 0.38) {
        // Low Spike / energy barrier (requires jump)
        type = 'low_spike';
        width = rng.choice([32, 44, 56]);
        height = 36;
        y = 0;
      } else if (roll < 0.65) {
        // High Laser / drone beam (requires slide / duck)
        type = 'high_laser';
        width = rng.choice([48, 70, 90]);
        height = 32;
        y = 38; // suspended in air, player slides under
      } else if (roll < 0.82) {
        // Drone patrol (can either jump over or duck under depending on height)
        type = 'drone';
        width = 42;
        height = 32;
        y = rng.choice([40, 75]);
      } else {
        // Plasma barrier (jump with good timing)
        type = 'plasma_barrier';
        width = 30;
        height = 54;
        y = 0;
      }

      obstacles.push({
        id: ++obstacleId,
        worldX: currentX,
        type,
        width,
        height,
        y,
        active: true,
      });

      // Spawn items / coins around this obstacle or between gaps
      // 1. Coins in an arch over low obstacles or in a line under high lasers
      if (type === 'low_spike' || type === 'plasma_barrier') {
        // Coin arc over spike
        for (let i = 0; i < 3; i++) {
          const coinX = currentX - 40 + i * 40;
          const coinY = 70 + Math.sin((i / 2) * Math.PI) * 45;
          items.push({
            id: ++itemId,
            worldX: coinX,
            y: coinY,
            type: 'coin',
            value: 10,
            collected: false,
            radius: 12,
          });
        }
      } else if (type === 'high_laser') {
        // Coins on the ground to slide through
        for (let i = 0; i < 3; i++) {
          items.push({
            id: ++itemId,
            worldX: currentX - 25 + i * 35,
            y: 12,
            type: 'coin',
            value: 10,
            collected: false,
            radius: 12,
          });
        }
      }

      // Chance for powerup or gem in between
      if (rng.next() < 0.32) {
        const itemX = currentX + rng.range(120, 180);
        const itemRoll = rng.next();
        let itemType: ItemType = 'gem';
        let val = 50;

        if (itemRoll < 0.45) {
          itemType = 'gem';
          val = 50;
        } else if (itemRoll < 0.65) {
          itemType = 'shield';
          val = 0;
        } else if (itemRoll < 0.85) {
          itemType = 'magnet';
          val = 0;
        } else {
          itemType = 'boost';
          val = 0;
        }

        items.push({
          id: ++itemId,
          worldX: itemX,
          y: rng.choice([20, 60, 90]),
          type: itemType,
          value: val,
          collected: false,
          radius: 15,
        });
      }
    }
  }

  return { obstacles, items };
}
