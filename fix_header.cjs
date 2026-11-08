const fs = require('fs');

let c = fs.readFileSync('src/components/Header.tsx', 'utf8');

c = c.replace(/<div className="flex items-center space-x-2\.5">/, '<div className="flex items-center space-x-1.5 sm:space-x-2.5 min-w-0">');

// Logo
c = c.replace(/<div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-\[#1A1D29\] border border-\[#252A3A\] flex items-center justify-center text-lg shadow-xs">/, '<div className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-lg sm:rounded-xl bg-[#1A1D29] border border-[#252A3A] flex items-center justify-center text-lg shadow-xs">');

// Texts container
c = c.replace(/<div>\s*<div className="flex items-center space-x-1">/, '<div className="min-w-0">\n            <div className="flex items-center space-x-1 flex-wrap sm:flex-nowrap">');

c = c.replace(/<p className="text-\[#6B7280\] text-\[10px\] leading-none mt-0\.5">/, '<p className="text-[#6B7280] text-[9px] sm:text-[10px] leading-tight mt-0.5 truncate">');

// Action buttons container shrink
c = c.replace(/<div className="flex items-center gap-1 sm:gap-2\.5 shrink-0">/, '<div className="flex items-center gap-1 sm:gap-2.5 shrink-0 ml-1">');

fs.writeFileSync('src/components/Header.tsx', c);
