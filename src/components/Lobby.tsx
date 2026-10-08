import React, { useState, useEffect } from 'react';
import { PlayerData, RoomSnapshot, ChatMessage } from '../types/game';
import { network } from '../utils/network';
import { SKINS, COLOR_PALETTE } from '../utils/skins';
import { sound } from '../utils/audio';
import { Users, Copy, Check, Play, Crown, MessageSquare, Send, Sparkles, Shield, Wifi } from 'lucide-react';

interface LobbyProps {
  roomSnapshot: RoomSnapshot;
  localPlayerId: string;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  roomSnapshot,
  localPlayerId,
  onStartGame,
  onLeaveRoom,
}) => {
  const localPlayer = roomSnapshot.players.find(p => p.id === localPlayerId) || {
    id: localPlayerId,
    name: 'Player',
    color: '#06b6d4',
    skin: 'cyber_runner',
    ready: false,
    score: 0,
    distance: 0,
    alive: true,
    lives: 3,
    x: 0,
    y: 0,
    vy: 0,
    action: 'run' as const,
    hasShield: false,
    hasMagnet: false,
    hasBoost: false,
  };

  const isHost = roomSnapshot.hostId === localPlayerId;
  const [copied, setCopied] = useState(false);
  const [playerName, setPlayerName] = useState(localPlayer.name);
  const [selectedColor, setSelectedColor] = useState(localPlayer.color);
  const [selectedSkin, setSelectedSkin] = useState(localPlayer.skin);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const handleChat = (data: { chat: ChatMessage }) => {
      if (data.chat) {
        setMessages(prev => [...prev.slice(-30), data.chat]);
      }
    };
    network.on('chat_message', handleChat);
    return () => {
      network.off('chat_message', handleChat);
    };
  }, []);

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?room=${roomSnapshot.roomId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUpdateProfile = (name: string, color: string, skin: string) => {
    network.updateProfile(name, color, skin);
  };

  const handleToggleReady = () => {
    sound.playCoin();
    network.toggleReady();
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    network.sendChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 md:p-8 font-['Outfit'] relative overflow-x-hidden">
      {/* Background ambient neon glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-5xl z-10 space-y-6">
        {/* Top Header Card */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-400">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">Lobby Code</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                  <Wifi className="w-3 h-3" /> P2P & Online aktiv
                </span>
              </div>
              <h1 className="text-3xl font-black font-['Press_Start_2P'] tracking-wider text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
                {roomSnapshot.roomId}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-bold text-slate-200 transition-all hover:scale-105 active:scale-95 shadow-lg"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              <span>{copied ? 'Link kopiert!' : 'Einladungs-Link'}</span>
            </button>

            <button
              onClick={onLeaveRoom}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-red-500/20 border border-red-500/40 text-sm font-bold text-red-400 transition-all"
            >
              Verlassen
            </button>
          </div>
        </div>

        {/* Grid: Players on Left, Customizer & Chat on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Players List in Room (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>Spieler in der Lobby</span>
                  <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                    {roomSnapshot.players.length}/8
                  </span>
                </h2>
              </div>

              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {roomSnapshot.players.map(p => {
                  const isPlayerHost = p.id === roomSnapshot.hostId;
                  const isSelf = p.id === localPlayerId;
                  const skinDef = SKINS.find(s => s.id === p.skin);

                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        isSelf
                          ? 'bg-slate-800/80 border-cyan-500/50 shadow-md'
                          : 'bg-slate-800/40 border-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white shadow-inner relative"
                          style={{ backgroundColor: p.color }}
                        >
                          <span className="text-xs font-mono">{p.name.substring(0, 2).toUpperCase()}</span>
                          {isPlayerHost && (
                            <div className="absolute -top-1.5 -right-1.5 bg-yellow-500 text-slate-950 p-0.5 rounded-full shadow-md">
                              <Crown className="w-3 h-3 fill-current" />
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm">{p.name}</span>
                            {isSelf && <span className="text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.2 rounded font-bold">Du</span>}
                          </div>
                          <span className="text-xs text-slate-400">{skinDef?.name || 'Cyber Runner'}</span>
                        </div>
                      </div>

                      <div>
                        {p.ready ? (
                          <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> BEREIT
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            Wartet...
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Controls for Room */}
            <div className="pt-6 border-t border-slate-800 flex flex-col gap-3">
              <button
                onClick={handleToggleReady}
                className={`w-full py-3.5 rounded-2xl font-black text-sm tracking-wider uppercase transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                  localPlayer.ready
                    ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                }`}
              >
                <Check className="w-5 h-5" />
                {localPlayer.ready ? 'Bereitschaft aufheben' : 'Ich bin Bereit!'}
              </button>

              {isHost && (
                <button
                  onClick={onStartGame}
                  className="w-full py-4 rounded-2xl font-black text-base tracking-wider uppercase bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-xl shadow-cyan-500/30 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                >
                  <Play className="w-6 h-6 fill-current" />
                  <span>Spiel starten</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Character Customization & Chat (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Customization Card */}
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-extrabold flex items-center gap-2 text-cyan-400">
                  <Sparkles className="w-5 h-5" />
                  <span>Charakter anpassen</span>
                </h3>
              </div>

              {/* Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                  Spielername
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={playerName}
                  onChange={e => {
                    setPlayerName(e.target.value);
                    handleUpdateProfile(e.target.value, selectedColor, selectedSkin);
                  }}
                  className="w-full bg-slate-800/90 border border-slate-700 focus:border-cyan-400 rounded-xl px-4 py-2.5 text-white font-bold outline-none transition-colors"
                  placeholder="Dein Name..."
                />
              </div>

              {/* Skin Selection */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                  Skin auswählen
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {SKINS.map(skin => {
                    const isSelected = selectedSkin === skin.id;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        onClick={() => {
                          setSelectedSkin(skin.id);
                          handleUpdateProfile(playerName, selectedColor, skin.id);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                            : 'bg-slate-800/50 border-slate-700/60 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-xs font-black text-white">{skin.name}</div>
                        <div className="text-[10px] text-slate-400 leading-snug mt-1 line-clamp-1">
                          {skin.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color Palette */}
              <div className="space-y-2">
                <label className="text-xs uppercase font-extrabold tracking-wider text-slate-400">
                  Farbe / Neon-Aura
                </label>
                <div className="flex items-center flex-wrap gap-2.5">
                  {COLOR_PALETTE.map(col => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => {
                        setSelectedColor(col);
                        handleUpdateProfile(playerName, col, selectedSkin);
                      }}
                      className={`w-9 h-9 rounded-xl transition-transform hover:scale-110 active:scale-95 shadow-md ${
                        selectedColor === col ? 'ring-3 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* In-Lobby Chat */}
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col h-56">
              <div className="flex items-center gap-2 pb-2 mb-2 border-b border-slate-800 text-xs font-bold text-slate-400">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span>Lobby Chat & Quick Taunts</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 text-xs pr-1">
                {messages.length === 0 ? (
                  <div className="text-slate-500 italic py-2">Schreibe deinen Mitspielern oder schicke ein Emoji...</div>
                ) : (
                  messages.map((m, idx) => (
                    <div key={idx} className="flex items-baseline gap-1.5">
                      <span className="font-extrabold" style={{ color: m.color || '#38bdf8' }}>
                        {m.sender}:
                      </span>
                      <span className="text-slate-200">{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChat} className="mt-2 flex items-center gap-2 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  maxLength={70}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Nachricht schreiben..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 font-medium"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-transform active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
