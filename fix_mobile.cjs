const fs = require('fs');

function fixModal(file) {
  let c = fs.readFileSync(file, 'utf8');

  // Fix header badges wrapping
  // Look for:
  // <div>
  //   <div className="flex items-center space-x-2">
  //     <h2 className="text-white font-extrabold text-lg leading-tight">
  c = c.replace(/<div>\s*<div className="flex items-center space-x-2">\s*<h2 className="text-white font-extrabold/g, 
  '<div>\n              <div className="flex flex-wrap items-center gap-2">\n                <h2 className="text-white font-extrabold');

  // Fix tabs
  // Look for: <div className="mt-4 grid grid-cols-4 gap-1 bg-[#0F1117] rounded-2xl p-1 border border-[#252A3A]">
  c = c.replace(/<div className="mt-4 grid grid-cols-4 gap-1 bg-\[#0F1117\] rounded-2xl p-1 border border-\[#252A3A\]">/,
  '<div className="mt-4 flex items-center space-x-1 overflow-x-auto bg-[#0F1117] rounded-2xl p-1 border border-[#252A3A]">');
  
  // Make tabs shrink-0 and have horizontal padding
  c = c.replace(/className={`py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1/g,
  'className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center justify-center space-x-1');
  
  c = c.replace(/className={`py-2 text-xs font-semibold rounded-xl transition-colors \$\{/g,
  'className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 ${');

  // For the AI Analysis tab in ForexDetailModal where it has different classes:
  // className={`py-2 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1 ${
  c = c.replace(/className={`py-2 text-\[10px\] sm:text-xs font-semibold rounded-xl transition-colors/g,
  'className={`px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0');

  // Fix crypto card badges
  c = c.replace(/className="flex items-center space-x-2">\s*<button/g, 'className="flex items-center space-x-2 shrink-0">\n          <button');

  fs.writeFileSync(file, c);
}

fixModal('src/components/SignalDetailModal.tsx');
fixModal('src/components/ForexDetailModal.tsx');

function fixCard(file) {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/<div className="flex items-center space-x-2.5">/g, '<div className="flex items-center space-x-2.5 min-w-0">');
  c = c.replace(/<span className="font-bold text-white text-base leading-tight">/g, '<span className="font-bold text-white text-base leading-tight truncate">');
  c = c.replace(/<div className="flex items-center space-x-2">/g, '<div className="flex items-center space-x-2 shrink-0">');
  
  fs.writeFileSync(file, c);
}
fixCard('src/components/CryptoCard.tsx');
fixCard('src/components/ForexCard.tsx');

