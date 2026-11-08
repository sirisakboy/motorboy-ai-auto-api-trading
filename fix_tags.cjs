const fs = require('fs');

function fixTags(file) {
  let c = fs.readFileSync(file, 'utf8');
  c = c.replace(/<div className="grid grid-cols-3 gap-2">\s*\{signal\.sources\.map/g, '<div className="flex flex-wrap gap-2">\n                {signal.sources.map');
  c = c.replace(/className="bg-\[#1A1D29\] border border-\[#252A3A\] rounded-lg py-1\.5 text-center text-xs text-\[#9CA3AF\] truncate px-1"/g, 'className="bg-[#1A1D29] border border-[#252A3A] rounded-lg py-1.5 px-3 text-xs text-[#9CA3AF]"');
  fs.writeFileSync(file, c);
}

fixTags('src/components/SignalDetailModal.tsx');
fixTags('src/components/ForexDetailModal.tsx');
