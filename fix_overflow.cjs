const fs = require('fs');

function fixHeader() {
  let c = fs.readFileSync('src/components/Header.tsx', 'utf8');
  // Make gap smaller on mobile, text smaller, hide parts if needed.
  c = c.replace(/className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between"/, 'className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-1"');
  
  // Hide "TRADING" "ENGINE" text on very small screens, or just shrink it.
  c = c.replace(/<span className={`font-black text-sm sm:text-base tracking-tight \$\{isDark \? 'text-white' : 'text-\[#0F172A\]'\}`}>/g, '<span className={`hidden min-[375px]:block font-black text-xs sm:text-base tracking-tight ${isDark ? \'text-white\' : \'text-[#0F172A]\'}`}>');
  c = c.replace(/<span className="font-black text-sm sm:text-base tracking-tight text-\[#7C6CFF\]">/g, '<span className="hidden min-[375px]:block font-black text-xs sm:text-base tracking-tight text-[#7C6CFF]">');

  // Shrink buttons on mobile
  c = c.replace(/className="flex items-center gap-2 sm:gap-2\.5"/g, 'className="flex items-center gap-1 sm:gap-2.5 shrink-0"');
  c = c.replace(/w-9 h-9 rounded-xl/g, 'w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl');
  c = c.replace(/w-5 h-5 text-\[#7C6CFF\]/g, 'w-4 h-4 sm:w-5 sm:h-5 text-[#7C6CFF]');
  
  c = c.replace(/className="w-8 h-8 rounded-full border border-\[#7C6CFF\]\/50 object-cover"/g, 'className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-[#7C6CFF]/50 object-cover"');
  c = c.replace(/className="w-8 h-8 rounded-full bg-\[#7C6CFF\]\/20 border border-\[#7C6CFF\]\/40 flex items-center justify-center text-\[#A5B4FC\]"/g, 'className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#7C6CFF]/20 border border-[#7C6CFF]/40 flex items-center justify-center text-[#A5B4FC]"');

  c = c.replace(/px-2 sm:px-3 py-1\.5 rounded-xl border text-xs/g, 'px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs');

  // Also fix LogOut button
  c = c.replace(/px-2\.5 py-1\.5 rounded-xl border text-xs/g, 'px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs');

  fs.writeFileSync('src/components/Header.tsx', c);
}

function fixNewsCard() {
  let c = fs.readFileSync('src/components/NewsCard.tsx', 'utf8');
  // Fix tabs
  c = c.replace(/<div className="flex bg-\[#1A1D29\] p-1 rounded-xl border border-\[#252A3A\]">/g, '<div className="flex overflow-x-auto bg-[#1A1D29] p-1 rounded-xl border border-[#252A3A] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">');
  
  // Make sure buttons in tabs don't shrink and can scroll
  c = c.replace(/className={`flex-1 py-1\.5 px-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap/g, 'className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap min-w-fit');
  c = c.replace(/className={`flex-1 py-1\.5 px-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap/g, 'className={`shrink-0 flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-all whitespace-nowrap min-w-fit');
  
  // Auto-analysis banner flex wrap fix for "flex items-center gap-2 shrink-0" -> allow wrap
  c = c.replace(/<div className="flex items-center gap-2 shrink-0">/g, '<div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">');

  fs.writeFileSync('src/components/NewsCard.tsx', c);
}

function fixApp() {
  let c = fs.readFileSync('src/App.tsx', 'utf8');
  // Enforce max-width on the very top level container
  c = c.replace(/<div className="min-h-screen bg-\[#0F1117\] font-sans flex flex-col text-slate-200">/, '<div className="min-h-screen bg-[#0F1117] font-sans flex flex-col text-slate-200 overflow-x-hidden max-w-[100vw]">');
  
  fs.writeFileSync('src/App.tsx', c);
}

fixHeader();
fixNewsCard();
fixApp();
