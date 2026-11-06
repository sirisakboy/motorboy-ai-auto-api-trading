const fs = require('fs');

function fix(file) {
  let c = fs.readFileSync(file, 'utf8');

  // Find the tabs container
  const oldContainerRegex = /<div className="mt-4 grid grid-cols-4 gap-1 bg-\[#0F1117\] rounded-2xl p-1 border border-\[#252A3A\]">/g;
  const newContainer = '<div className="mt-4 flex overflow-x-auto gap-1 bg-[#0F1117] rounded-2xl p-1 border border-[#252A3A] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">';
  
  c = c.replace(oldContainerRegex, newContainer);
  
  c = c.replace(/className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center justify-center space-x-1/g,
  'className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit flex items-center justify-center space-x-1');
  
  c = c.replace(/className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 \$\{/g,
  'className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${');
  
  c = c.replace(/className={`py-2 text-xs font-semibold rounded-xl transition-colors \$\{/g,
  'className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit ${');
  
  c = c.replace(/className={`py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1/g,
  'className={`flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap min-w-fit flex items-center justify-center space-x-1');

  fs.writeFileSync(file, c);
}

fix('src/components/SignalDetailModal.tsx');
fix('src/components/ForexDetailModal.tsx');
