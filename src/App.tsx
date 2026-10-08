import React, { useState, useEffect } from 'react';
import { PlayerData, RoomSnapshot } from './types/game';
import { network } from './utils/network';
import { sound } from './utils/audio';
import { SKINS, COLOR_PALETTE } from './utils/skins';
import { GameCanvas } from './components/GameCanvas';
import { Lobby } from './components/Lobby';
import { GameOverModal } from './components/GameOverModal';
import {
  Zap,
  Play,
  Users,
  PlusCircle,
  LogIn,
  Trophy,
  Volume2,
  VolumeX,
  HelpCircle,
  Sparkles,
  Shield,
  Magnet,
  Radio,
  ArrowRight,
} from 'lucide-react';

type ScreenState = 'menu' | 'lobby' | 'playing' | 'gameover';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [isMultiplayer, setIsMultiplayer] = useState<boolean>(false);
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('dash_clash_name') || 'Runner_' + Math.floor(Math.random() * 900 + 100);
  });
  const [playerColor, setPlayerColor] = useState<string>(() => {
    return localStorage.getItem('dash_clash_color') || COLOR_PALETTE[0];
  });
  const [playerSkin, setPlayerSkin] = useState<string>(() => {
    return localStorage.getItem('dash_clash_skin') || SKINS[0].id;
  });

  const [inputRoomCode, setInputRoomCode] = useState<string>('');
  const [roomSnapshot, setRoomSnapshot] = useState<RoomSnapshot | null>(null);
  const [gameSeed, setGameSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [highScore, setHighScore] = useState<number>(() => {
    return Number(localStorage.getItem('dash_clash_highscore') || '0');
  });

  const [finalStats, setFinalStats] = useState<{
    score: number;
    distance: number;
    rank: number;
    players: PlayerData[];
  }>({
    score: 0,
    distance: 0,
    rank: 1,
    players: [],
  });

  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<boolean>(false);

  // Initialize network connection and check URL for ?room=CODE
  useEffect(() => {
    network.connect().catch(e => {
      console.warn('Network connection initial attempt:', e);
    });

    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setInputRoomCode(urlRoom.toUpperCase());
    }

    // Network Event Handlers
    const handleRoomCreated = (data: { roomId: string; playerId: string; snapshot: RoomSnapshot }) => {
      setConnecting(false);
      setRoomSnapshot(data.snapshot);
      setIsMultiplayer(true);
      setScreen('lobby');
    };

    const handleRoomJoined = (data: { roomId: string; playerId: string; snapshot: RoomSnapshot }) => {
      setConnecting(false);
      setRoomSnapshot(data.snapshot);
      setIsMultiplayer(true);
      setScreen('lobby');
    };

    const handlePlayerJoined = (data: { snapshot: RoomSnapshot }) => {
      if (data.snapshot) setRoomSnapshot(data.snapshot);
    };

    const handleRoomUpdate = (data: { snapshot: RoomSnapshot }) => {
      if (data.snapshot) setRoomSnapshot(data.snapshot);
    };

    const handleGameStarting = (data: { seed: number; snapshot: RoomSnapshot }) => {
      setGameSeed(data.seed);
      setRoomSnapshot(data.snapshot);
      setScreen('playing');
    };

    const handleGameOver = (data: { snapshot: RoomSnapshot }) => {
      // In multiplayer, if server broadcasted game over
      if (screen === 'playing') {
        const p = data.snapshot.players.find(pl => pl.id === network.localPlayerId);
        const sorted = data.snapshot.players.slice().sort((a, b) => b.score - a.score);
        const rank = sorted.findIndex(pl => pl.id === network.localPlayerId) + 1;
        setFinalStats({
          score: p?.score || 0,
          distance: p?.distance || 0,
          rank: rank > 0 ? rank : 1,
          players: sorted,
        });
        setScreen('gameover');
      }
    };

    const handleError = (msg: string) => {
      setConnecting(false);
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 3500);
    };

    network.on('room_created', handleRoomCreated);
    network.on('room_joined', handleRoomJoined);
    network.on('player_joined', handlePlayerJoined);
    network.on('room_update', handleRoomUpdate);
    network.on('game_starting', handleGameStarting);
    network.on('game_over', handleGameOver);
    network.on('error', handleError);

    return () => {
      network.off('room_created', handleRoomCreated);
      network.off('room_joined', handleRoomJoined);
      network.off('player_joined', handlePlayerJoined);
      network.off('room_update', handleRoomUpdate);
      network.off('game_starting', handleGameStarting);
      network.off('game_over', handleGameOver);
      network.off('error', handleError);
    };
  }, [screen]);

  // Save profile to localStorage
  const saveProfile = (name: string, color: string, skin: string) => {
    setPlayerName(name);
    setPlayerColor(color);
    setPlayerSkin(skin);
    localStorage.setItem('dash_clash_name', name);
    localStorage.setItem('dash_clash_color', color);
    localStorage.setItem('dash_clash_skin', skin);
  };

  // Menu Handlers
  const handleQuickMatch = async () => {
    setConnecting(true);
    await network.connect();
    network.quickMatch(playerName, playerColor, playerSkin);
  };

  const handleCreateRoom = async () => {
    setConnecting(true);
    await network.connect();
    network.createRoom(playerName, playerColor, playerSkin);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputRoomCode.trim()) return;
    setConnecting(true);
    await network.connect();
    network.joinRoom(inputRoomCode.trim(), playerName, playerColor, playerSkin);
  };

  const handleStartSolo = () => {
    setIsMultiplayer(false);
    setGameSeed(Math.floor(Math.random() * 1000000));
    setRoomSnapshot(null);
    setScreen('playing');
  };

  const handleStartMultiplayerFromHost = () => {
    network.startGame();
  };

  const handleGameOverCallback = (stats: {
    score: number;
    distance: number;
    rank: number;
    players: PlayerData[];
  }) => {
    if (stats.score > highScore) {
      setHighScore(stats.score);
      localStorage.setItem('dash_clash_highscore', String(stats.score));
    }
    setFinalStats(stats);
    setScreen('gameover');
  };

  const handleRematch = () => {
    if (isMultiplayer && roomSnapshot) {
      // Return to lobby to start another round
      setScreen('lobby');
    } else {
      // Restart solo
      handleStartSolo();
    }
  };

  const handleLeaveToHome = () => {
    if (isMultiplayer) {
      network.leaveRoom();
    }
    setRoomSnapshot(null);
    setScreen('menu');
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 text-white font-['Outfit'] select-none">
      {/* Toast Error Alert */}
      {errorMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 border border-red-400 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-2 animate-bounce">
          <span>⚠️ {errorMessage}</span>
        </div>
      )}

      {/* VIEW: MAIN MENU */}
      {screen === 'menu' && (
        <div className="relative min-h-screen flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden">
          {/* Ambient Cyberpunk Glow */}
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-500/15 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-pink-500/15 rounded-full blur-[100px] pointer-events-none" />

          <div className="w-full max-w-4xl z-10 flex flex-col items-center space-y-8">
            {/* Logo & Headline */}
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 text-xs font-bold tracking-widest uppercase mb-2">
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                <span>P2P & Live WebSockets Multiplayer</span>
              </div>

              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black font-['Press_Start_2P'] tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-amber-400 drop-shadow-[0_0_25px_rgba(6,182,212,0.5)]">
                DASH CLASH
              </h1>

              <p className="text-slate-300 text-sm sm:text-base max-w-md mx-auto font-medium">
                Weiche Hindernissen aus, ducke dich unter Laserbalken, sammle Turbo-Powerups und tritt in Echtzeit gegen Freunde an!
              </p>
            </div>

            {/* Quick Player Profile Setup Card */}
            <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                  Dein Rennfahrer
                </span>
                <span className="text-xs font-bold text-yellow-400 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5" /> Highscore: {highScore}
                </span>
              </div>

              {/* Name & Avatar Preview */}
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm text-slate-950 shadow-md shrink-0"
                  style={{ backgroundColor: playerColor }}
                >
                  {playerName.substring(0, 2).toUpperCase()}
                </div>
                <input
                  type="text"
                  maxLength={14}
                  value={playerName}
                  onChange={e => saveProfile(e.target.value, playerColor, playerSkin)}
                  placeholder="Spielername..."
                  className="w-full bg-slate-800 border border-slate-700 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-sm font-bold text-white outline-none"
                />
              </div>

              {/* Color Selection Bar */}
              <div className="flex items-center justify-between gap-1.5 pt-1">
                {COLOR_PALETTE.map(col => (
                  <button
                    key={col}
                    onClick={() => saveProfile(playerName, col, playerSkin)}
                    className={`w-7 h-7 rounded-lg transition-transform ${
                      playerColor === col ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            {/* Game Mode Selection Grid */}
            <div className="w-full max-w-md space-y-3">
              {/* Quick Match / Schnelles Spiel */}
              <button
                onClick={handleQuickMatch}
                disabled={connecting}
                className="w-full py-4 px-6 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-xl shadow-cyan-500/25 transition-all hover:scale-102 active:scale-95 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Zap className="w-6 h-6 fill-current text-yellow-300" />
                  <div className="text-left">
                    <div className="text-base font-black">Schnelles Spiel</div>
                    <div className="text-[11px] font-normal text-cyan-100/80">Sofort Mitspieler finden</div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-cyan-200" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                {/* Create Room */}
                <button
                  onClick={handleCreateRoom}
                  disabled={connecting}
                  className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-left transition-all hover:border-cyan-500/50 flex flex-col justify-between h-24"
                >
                  <PlusCircle className="w-6 h-6 text-cyan-400" />
                  <div>
                    <div className="text-sm font-extrabold text-white">Raum erstellen</div>
                    <div className="text-[11px] text-slate-400">Mit 4-stelligen Code</div>
                  </div>
                </button>

                {/* Solo Training */}
                <button
                  onClick={handleStartSolo}
                  className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-left transition-all hover:border-pink-500/50 flex flex-col justify-between h-24"
                >
                  <Play className="w-6 h-6 text-pink-400 fill-current" />
                  <div>
                    <div className="text-sm font-extrabold text-white">Solo Training</div>
                    <div className="text-[11px] text-slate-400">Rekorde knacken</div>
                  </div>
                </button>
              </div>

              {/* Join Room by Code */}
              <form onSubmit={handleJoinRoom} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={inputRoomCode}
                  onChange={e => setInputRoomCode(e.target.value.toUpperCase())}
                  placeholder="RAUM-CODE (z.B. NEON)"
                  className="flex-1 bg-slate-900/90 border border-slate-800 focus:border-cyan-400 rounded-2xl px-4 py-3 font-mono font-black text-sm uppercase text-center tracking-widest text-white outline-none"
                />
                <button
                  type="submit"
                  disabled={connecting || !inputRoomCode.trim()}
                  className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-bold text-xs uppercase tracking-wider text-slate-200 transition-all active:scale-95 disabled:opacity-50"
                >
                  Beitreten
                </button>
              </form>
            </div>

            {/* How to play trigger button */}
            <button
              onClick={() => setShowHowToPlay(true)}
              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-cyan-400 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Steuerung & Spielanleitung anzeigen</span>
            </button>
          </div>

          {/* How to Play Modal */}
          {showHowToPlay && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
              <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-lg font-black font-['Press_Start_2P'] text-cyan-400">ANLEITUNG</h3>
                  <button
                    onClick={() => setShowHowToPlay(false)}
                    className="text-slate-400 hover:text-white font-bold text-lg"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs text-slate-300">
                  <div className="p-3 bg-slate-800/60 rounded-xl space-y-1">
                    <span className="font-extrabold text-cyan-400">▲ SPRUNG (Leertaste / W / Pfeil Oben):</span>
                    <p className="text-slate-400">
                      Springt über Stacheln und Plasmaschranken. In der Luft erneut drücken für einen <strong>Doppelsprung</strong>!
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-xl space-y-1">
                    <span className="font-extrabold text-pink-400">▼ DUCKEN / SLIDE (S / Pfeil Unten):</span>
                    <p className="text-slate-400">
                      Rutschen unter hohen Laserbalken und tief fliegenden Drohnen hindurch!
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-xl space-y-1">
                    <span className="font-extrabold text-amber-400">⚡ TURBO-DASH (E / Shift / Pfeil Rechts):</span>
                    <p className="text-slate-400">
                      Ein kurzer Raketenschub nach vorne, der Hindernisse zerschmettert (+25 Bonus)!
                    </p>
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-xl space-y-1">
                    <span className="font-extrabold text-emerald-400">💎 POWERUPS & ITEMS:</span>
                    <ul className="list-disc list-inside text-slate-400 space-y-0.5">
                      <li><strong>Münzen & Diamanten:</strong> +10 bzw. +50 Punkte</li>
                      <li><strong>Blaues Schild:</strong> Schützt vor 1 Kollision</li>
                      <li><strong>Lila Magnet:</strong> Saugt Münzen in der Nähe an</li>
                      <li><strong>Goldener Stern:</strong> 2x Punkte Multiplikator & Hyper-Speed</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={() => setShowHowToPlay(false)}
                  className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase"
                >
                  Verstanden!
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: LOBBY */}
      {screen === 'lobby' && roomSnapshot && (
        <Lobby
          roomSnapshot={roomSnapshot}
          localPlayerId={network.localPlayerId}
          onStartGame={handleStartMultiplayerFromHost}
          onLeaveRoom={handleLeaveToHome}
        />
      )}

      {/* VIEW: PLAYING */}
      {screen === 'playing' && (
        <GameCanvas
          seed={gameSeed}
          initialPlayers={
            roomSnapshot ? roomSnapshot.players : [
              {
                id: network.localPlayerId,
                name: playerName,
                color: playerColor,
                skin: playerSkin,
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
              },
            ]
          }
          localPlayerId={network.localPlayerId}
          isMultiplayer={isMultiplayer}
          onGameOver={handleGameOverCallback}
          onQuit={handleLeaveToHome}
        />
      )}

      {/* VIEW: GAMEOVER MODAL */}
      {screen === 'gameover' && (
        <GameOverModal
          score={finalStats.score}
          distance={finalStats.distance}
          rank={finalStats.rank}
          players={finalStats.players}
          localPlayerId={network.localPlayerId}
          isMultiplayer={isMultiplayer}
          onRematch={handleRematch}
          onHome={handleLeaveToHome}
        />
      )}
    </div>
  );
}
