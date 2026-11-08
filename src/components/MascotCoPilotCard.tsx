import React from 'react';
import { useMascotStore, MascotState } from '../services/mascotService';
import { 
  Zap, 
  ShieldAlert, 
  Trophy, 
  Search, 
  AlertOctagon, 
  Coffee,
  Wrench,
  Sparkles,
  Info
} from 'lucide-react';

export const MascotCoPilotCard: React.FC = () => {
  const { state, message } = useMascotStore();

  const getStateStyles = (s: MascotState) => {
    switch (s) {
      case 'KILL_SWITCH_ACTIVE': return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)] bg-red-950/20';
      case 'RISK_REJECT': return 'border-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] bg-orange-950/20';
      case 'TP_CELEBRATE': return 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] bg-emerald-950/20';
      case 'SCANNING': return 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] bg-blue-950/20';
      default: return 'border-[#262626] bg-[#141417]';
    }
  };

  const getIcon = (s: MascotState) => {
    switch (s) {
      case 'SCANNING': return <Search className="w-5 h-5 text-blue-400 animate-pulse" />;
      case 'TP_CELEBRATE': return <Trophy className="w-5 h-5 text-emerald-400 animate-bounce" />;
      case 'SL_RESPECTED': return <AlertOctagon className="w-5 h-5 text-red-400" />;
      case 'RISK_REJECT': return <ShieldAlert className="w-5 h-5 text-orange-400" />;
      case 'KILL_SWITCH_ACTIVE': return <AlertOctagon className="w-5 h-5 text-red-500 animate-ping" />;
      case 'SIDEWAYS': return <Coffee className="w-5 h-5 text-slate-400" />;
      case 'READY_TO_EXECUTE': return <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />;
      case 'ONBOARDING': return <Sparkles className="w-5 h-5 text-purple-400" />;
      default: return <Wrench className="w-5 h-5 text-[#FF2D55]" />;
    }
  };

  return (
    <div className={`p-4 rounded-[20px] border transition-all duration-500 ${getStateStyles(state)}`}>
      <div className="flex items-start gap-4">
        {/* Mascot Avatar with Neon Glow */}
        <div className="relative shrink-0">
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF2D55] via-[#A855F7] to-[#3B82F6] p-[1.5px] shadow-[0_0_15px_rgba(255,45,85,0.3)]`}>
            <div className="w-full h-full bg-[#0A0A0A] rounded-[14.5px] flex items-center justify-center overflow-hidden relative">
              {/* Character Image */}
              <img 
                src="/src/assets/images/nong_motorboy_hero_1794000288918.jpg" 
                alt="Nong MotorBoy"
                className={`w-full h-full object-cover transition-all duration-500 ${
                  state === 'IDLE' ? 'scale-100' : 'scale-110 brightness-110'
                }`}
              />
              
              {/* Emotion Overlay (Emoji) */}
              {state !== 'IDLE' && (
                <div className="absolute inset-0 flex items-center justify-center text-2xl bg-black/20 backdrop-blur-[1px]">
                  {state === 'SCANNING' && '🧐'}
                  {state === 'CONFIRM_TRADE' && '🤔'}
                  {state === 'READY_TO_EXECUTE' && '🚀'}
                  {state === 'TP_CELEBRATE' && '🥳'}
                  {state === 'SL_RESPECTED' && '😢'}
                  {state === 'RISK_REJECT' && '😠'}
                  {state === 'KILL_SWITCH_ACTIVE' && '🛑'}
                  {state === 'SIDEWAYS' && '😴'}
                  {state === 'ONBOARDING' && '👋'}
                </div>
              )}
              
              {/* Neon circuit overlay effect */}
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                 <div className="w-full h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(255,45,85,0.2)_0%,_transparent_70%)]" />
              </div>
            </div>
          </div>
          
          {/* Status Indicator */}
          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0A0A0A] flex items-center justify-center ${
            state === 'IDLE' ? 'bg-emerald-500' : 'bg-[#FF2D55]'
          }`}>
             <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        </div>

        {/* Interaction Bubble */}
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-black text-[#FF2D55] uppercase tracking-widest flex items-center gap-1.5">
              {getIcon(state)}
              Nong MotorBoy Co-Pilot
            </h4>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">
              {state}
            </span>
          </div>
          
          <div className="relative">
             {/* Speech tail */}
             <div className="absolute -left-2 top-2 w-2 h-2 bg-[#1A1D29] rotate-45 border-l border-t border-[#252A3A]" />
             <div className="bg-[#1A1D29] border border-[#252A3A] rounded-xl p-3 text-xs leading-relaxed text-slate-200 shadow-inner">
                {message}
             </div>
          </div>
        </div>
      </div>

      {/* Quick Action Button for Context */}
      {state === 'RISK_REJECT' && (
        <div className="mt-3 flex justify-end">
           <button 
             onClick={() => useMascotStore.getState().resetToIdle()}
             className="text-[10px] font-bold text-orange-400 hover:text-white transition-colors flex items-center gap-1"
           >
             <Info className="w-3 h-3" />
             เข้าใจแล้วครับ จะปรับปรุงแผนใหม่
           </button>
        </div>
      )}

      {state === 'KILL_SWITCH_ACTIVE' && (
        <div className="mt-3 flex justify-end">
           <button 
             onClick={() => useMascotStore.getState().resetToIdle()}
             className="px-3 py-1 rounded-lg bg-red-500 text-white text-[10px] font-bold shadow-lg shadow-red-500/20 hover:bg-red-400 transition-all"
           >
             RESET SYSTEM
           </button>
        </div>
      )}
    </div>
  );
};
