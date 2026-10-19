const fs = require('fs');

function fixHeader() {
  let c = fs.readFileSync('src/components/Header.tsx', 'utf8');
  c = c.replace(/className={`hidden min-\[375px\]:block font-black text-xs sm:text-base tracking-tight/g, 'className={`font-black text-xs sm:text-base tracking-tight');
  c = c.replace(/className="hidden min-\[375px\]:block font-black text-xs sm:text-base tracking-tight text-\[#7C6CFF\]"/g, 'className="font-black text-xs sm:text-base tracking-tight text-[#7C6CFF]"');
  // Just in case they wrap, allow them to stay together
  c = c.replace(/<div className="flex items-center space-x-1.5">/g, '<div className="flex items-center space-x-1">');
  // Decrease PRO tag size further on mobile
  c = c.replace(/text-\[9px\] font-extrabold px-1.5 py-0.5/g, 'text-[8px] sm:text-[9px] font-extrabold px-1 py-0.5');
  fs.writeFileSync('src/components/Header.tsx', c);
}

function fixPriceChart() {
  let c = fs.readFileSync('src/components/PriceChartCanvas.tsx', 'utf8');
  c = c.replace(/<div className="flex items-center justify-between bg-\[#0F1117\] border border-\[#252A3A\] rounded-xl px-3 py-2 text-xs">/g, 
  '<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-[#0F1117] border border-[#252A3A] rounded-xl px-3 py-2 text-xs">');
  
  c = c.replace(/<div className="flex items-center space-x-3">/g, '<div className="flex flex-wrap items-center gap-3">');
  fs.writeFileSync('src/components/PriceChartCanvas.tsx', c);
}

fixHeader();
fixPriceChart();
