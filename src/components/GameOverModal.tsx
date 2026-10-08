import React, { useEffect } from 'react';
import { PlayerData } from '../types/game';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Home, Award, Flame, Heart } from 'lucide-react';
import { sound } from '../utils/audio';

interface GameOverModalProps {
  score: number;
  distance: number;
  rank: number;
  players: PlayerData[];
  localPlayerId: string;
  isMultiplayer: boolean;
  onRematch: () => void;
  onHome: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  score,
  distance,
  rank,
  players,
  localPlayerId,
  isMultiplayer,
  onRematch,
  onHome,
}) => {
  const isWinner = rank === 1;

  useEffect(() => {
    if (isWinner) {
      sound.playVictory();
      // Launch celebration confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });
      const timeout = setTimeout(() => {
        confetti({
          particleCount: 80,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 80,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 400);

      return () => clearTimeout(timeout);
    }
  }, [isWinner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md font-['Outfit'] animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full blur-3xl pointer-events-none ${
            isWinner ? 'bg-amber-500/25' : 'bg-red-500/20'
          }`}
        />

        {/* Header Badge */}
        <div className="flex flex-col items-center text-center space-y-2 relative">
          <div
            className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl border mb-2 ${
              isWinner
                ? 'bg-amber-500/20 border-amber-400 text-amber-400 shadow-amber-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-300 shadow-slate-900'
            }`}
          >
            {isWinner ? <Trophy className="w-10 h-10 animate-bounce" /> : <Award className="w-10 h-10 text-cyan-400" />}
          </div>

          <h2 className="text-2xl sm:text-3xl font-black font-['Press_Start_2P'] tracking-wider text-white">
            {isWinner ? 'SIEG! 🏆' : 'SPIEL ENDE'}
          </h2>

          <p className="text-sm font-semibold text-slate-400">
            {isMultiplayer
              ? `Du hast Platz #${rank} erreicht!`
              : 'Guter Lauf! Kannst du deinen Highscore überbieten?'}
          </p>
        </div>

        {/* Main Stats Banner */}
        <div className="grid grid-cols-2 gap-3 my-6">
          <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-slate-400">
              Gesamtpunkte
            </span>
            <span className="text-2xl sm:text-3xl font-black text-yellow-400 font-['Press_Start_2P'] mt-1 drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]">
              {score}
            </span>
          </div>

          <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-slate-400">
              Distanz
            </span>
            <span className="text-2xl sm:text-3xl font-black text-cyan-400 mt-1">
              {distance} <span className="text-sm font-bold text-slate-400">m</span>
            </span>
          </div>
        </div>

        {/* Multiplayer Scoreboard */}
        {isMultiplayer && players.length > 0 && (
          <div className="mb-6 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
              Rangliste dieses Matches
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {players
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p, idx) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${
                      p.id === localPlayerId
                        ? 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200 font-bold'
                        : 'bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-black ${idx === 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                        #{idx + 1}
                      </span>
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span>{p.name}</span>
                    </div>
                    <span className="font-mono font-black">{p.score} Pkt</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onRematch}
            className="flex-1 py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all hover:scale-102 active:scale-95 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Nochmal spielen</span>
          </button>

          <button
            onClick={onHome}
            className="py-3.5 px-6 rounded-2xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Menü</span>
          </button>
        </div>
      </div>
    </div>
  );
};
