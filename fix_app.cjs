const fs = require('fs');

function fixApp() {
  let c = fs.readFileSync('src/App.tsx', 'utf8');

  // Fix coin selector scrolling
  c = c.replace(/<div className="flex items-center space-x-1\.5 overflow-x-auto">/g, 
  '<div className="flex items-center space-x-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">');
  
  c = c.replace(/className={`px-2\.5 py-1 rounded-xl text-xs font-bold transition-all \$\{/g,
  'className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 whitespace-nowrap ${');

  // Fix asset tabs scrolling
  c = c.replace(/<div className="flex items-center space-x-1 bg-\[#1A1D29\] p-1 rounded-2xl border border-\[#252A3A\] overflow-x-auto">/g,
  '<div className="flex items-center space-x-1 bg-[#1A1D29] p-1 rounded-2xl border border-[#252A3A] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] max-w-full">');
  
  c = c.replace(/className={`px-3\.5 py-1\.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1\.5 \$\{/g,
  'className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 shrink-0 ${');

  // Fix main grid causing potential overflow if screen is < 320px
  // In App.tsx: <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 overflow-x-hidden">
  c = c.replace(/<main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">/g,
  '<main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 overflow-x-hidden">');

  fs.writeFileSync('src/App.tsx', c);
}

fixApp();
