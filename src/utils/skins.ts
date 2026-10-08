export interface SkinDef {
  id: string;
  name: string;
  description: string;
  headShape: 'human' | 'ninja' | 'robot' | 'knight' | 'cat';
  accentColor: string;
}

export const SKINS: SkinDef[] = [
  {
    id: 'cyber_runner',
    name: 'Cyber Runner',
    description: 'Schnittiger Neon-Gleiter mit Cyber-Visier',
    headShape: 'human',
    accentColor: '#06b6d4',
  },
  {
    id: 'neon_ninja',
    name: 'Neon Ninja',
    description: 'Schwebendes Bandana & Katana-Aura',
    headShape: 'ninja',
    accentColor: '#ec4899',
  },
  {
    id: 'astro_bot',
    name: 'Astro Bot',
    description: 'Roboter-Helm mit blinkender Puls-Antenne',
    headShape: 'robot',
    accentColor: '#10b981',
  },
  {
    id: 'solar_knight',
    name: 'Solar Knight',
    description: 'Goldener Energie-Helm & Plasma-Umhang',
    headShape: 'knight',
    accentColor: '#f59e0b',
  },
  {
    id: 'pixel_cat',
    name: 'Cyber Neko',
    description: 'Agile Cyber-Katze mit holographischen Ohren',
    headShape: 'cat',
    accentColor: '#a855f7',
  },
];

export const COLOR_PALETTE = [
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#14b8a6', // Teal
];
