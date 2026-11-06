const fs = require('fs');
let c = fs.readFileSync('src/components/StockCard.tsx', 'utf8');

c = c.replace(/<div className="flex items-center justify-between">/g, '<div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2">');
c = c.replace(/<div className="flex items-center space-x-2.5">/g, '<div className="flex items-center space-x-2.5 min-w-0">');

c = c.replace(/<div className="w-9 h-9 rounded-full/g, '<div className="w-9 h-9 shrink-0 rounded-full');

c = c.replace(/<div>\s*<h3 className="text-white font-bold text-\[15px\] leading-tight">/g, '<div className="min-w-0">\n            <h3 className="text-white font-bold text-[15px] leading-tight truncate">');

c = c.replace(/<p className="text-\[#6B7280\] text-\[11px\] mt-0\.5 leading-tight">/g, '<p className="text-[#6B7280] text-[11px] mt-0.5 leading-tight truncate">');

c = c.replace(/<div className="text-right">/g, '<div className="text-right shrink-0">');

fs.writeFileSync('src/components/StockCard.tsx', c);
