const fs = require('fs');

function fixModal(file) {
  let c = fs.readFileSync(file, 'utf8');

  // Fix header tags overlap
  c = c.replace(/<div className="flex items-center space-x-2">\s*<h2/g, '<div className="flex flex-wrap items-center gap-1.5">\n                <h2');

  // Fix tabs layout for mobile
  c = c.replace(/className="mt-4 grid grid-cols-4 gap-1 bg-\[#0F1117\]/g, 'className="mt-4 flex overflow-x-auto gap-1 bg-[#0F1117]');
  c = c.replace(/py-2 text-xs font-semibold rounded-xl transition-colors/g, 'flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit');
  
  // Also add no-scrollbar to the flex container
  c = c.replace(/<div className="mt-4 flex overflow-x-auto gap-1 bg-\[#0F1117\] rounded-2xl p-1 border border-\[#252A3A\]">/g, '<div className="mt-4 flex overflow-x-auto gap-1 bg-[#0F1117] rounded-2xl p-1 border border-[#252A3A] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">');

  // Support & Resistance Box Grid
  c = c.replace(/className="grid grid-cols-2 gap-2\.5"/g, 'className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"');
  
  fs.writeFileSync(file, c);
}

function fixCard(file) {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/<div className="mt-1\.5 flex items-baseline justify-between">/g, '<div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">');
  fs.writeFileSync(file, c);
}

fixModal('src/components/SignalDetailModal.tsx');
fixModal('src/components/ForexDetailModal.tsx');
fixCard('src/components/CryptoCard.tsx');
fixCard('src/components/ForexCard.tsx');

