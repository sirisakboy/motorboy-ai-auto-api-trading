const fs = require('fs');

function fixCryptoCard() {
  let c = fs.readFileSync('src/components/CryptoCard.tsx', 'utf8');
  c = c.replace(/<div>\s*<div className="flex items-center space-x-1.5">/, '<div className="min-w-0">\n            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">');
  
  c = c.replace(/<span className="text-\[#9CA3AF\] text-xs">/g, '<span className="text-[#9CA3AF] text-xs shrink-0">');
  c = c.replace(/<p className="text-\[#6B7280\] text-\[11px\] leading-tight mt-0\.5">/g, '<p className="text-[#6B7280] text-[11px] leading-tight mt-0.5 truncate">');
  
  // Also SL/TP quick view
  c = c.replace(/<div className="mt-3 flex items-center justify-between text-xs">/g, '<div className="mt-3 flex flex-wrap items-center justify-between text-xs gap-2">');
  c = c.replace(/<span className="font-bold text-\[#7C6CFF\] hover:underline">/g, '<span className="font-bold text-[#7C6CFF] hover:underline shrink-0">');
  fs.writeFileSync('src/components/CryptoCard.tsx', c);
}

function fixForexCard() {
  let c = fs.readFileSync('src/components/ForexCard.tsx', 'utf8');
  c = c.replace(/<div>\s*<div className="flex items-center space-x-1.5">/, '<div className="min-w-0">\n            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">');
  
  c = c.replace(/<span className="text-\[#9CA3AF\] text-xs">/g, '<span className="text-[#9CA3AF] text-xs shrink-0">');
  c = c.replace(/<span className="text-\[10px\] bg-\[#6366F1\]\/20 text-\[#A5B4FC\] border border-\[#6366F1\]\/40 px-1\.5 py-0\.2 rounded font-mono">/g, '<span className="text-[10px] bg-[#6366F1]/20 text-[#A5B4FC] border border-[#6366F1]/40 px-1.5 py-0.2 rounded font-mono shrink-0">');
  
  c = c.replace(/<p className="text-\[#6B7280\] text-\[11px\] leading-tight mt-0\.5">/g, '<p className="text-[#6B7280] text-[11px] leading-tight mt-0.5 truncate">');
  
  c = c.replace(/<div className="mt-2\.5 flex items-center justify-between">/g, '<div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">');
  
  c = c.replace(/<div className="mt-2\.5 grid grid-cols-2 gap-2 text-xs">/g, '<div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">');
  
  c = c.replace(/<div className="mt-2\.5 flex items-center justify-between text-xs">/g, '<div className="mt-2.5 flex flex-wrap items-center justify-between text-xs gap-2">');
  
  c = c.replace(/<span className="font-bold text-\[#7C6CFF\] hover:underline">/g, '<span className="font-bold text-[#7C6CFF] hover:underline shrink-0">');
  fs.writeFileSync('src/components/ForexCard.tsx', c);
}

function fixStockCard() {
  let c = fs.readFileSync('src/components/StockCard.tsx', 'utf8');
  c = c.replace(/<div className="flex items-center space-x-2\.5">/g, '<div className="flex items-center space-x-2.5 min-w-0">');
  
  c = c.replace(/<div className="w-9 h-9 rounded-full/g, '<div className="w-9 h-9 shrink-0 rounded-full');
  
  c = c.replace(/<div>\s*<div className="flex items-center space-x-1.5">/, '<div className="min-w-0">\n            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-1.5">');
  
  c = c.replace(/<span className="font-bold text-white text-base leading-tight">/g, '<span className="font-bold text-white text-base leading-tight truncate">');
  c = c.replace(/<span className="text-\[#9CA3AF\] text-xs">/g, '<span className="text-[#9CA3AF] text-xs shrink-0">');
  c = c.replace(/<p className="text-\[#6B7280\] text-\[11px\] leading-tight mt-0\.5">/g, '<p className="text-[#6B7280] text-[11px] leading-tight mt-0.5 truncate">');
  
  c = c.replace(/<div className="mt-2\.5 flex items-center justify-between">/g, '<div className="mt-2.5 flex flex-wrap items-center justify-between gap-1">');
  
  c = c.replace(/<div className="mt-1\.5 flex items-baseline justify-between">/g, '<div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">');
  
  fs.writeFileSync('src/components/StockCard.tsx', c);
}

fixCryptoCard();
fixForexCard();
fixStockCard();

