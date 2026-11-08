const fs = require('fs');

function fixGrid(file) {
  let c = fs.readFileSync(file, 'utf8');
  // Only change the one for reason
  c = c.replace(/className="grid grid-cols-2 gap-2"\s*>\s*<div className="bg-\[#0F1117\] border border-\[#252A3A\] rounded-xl p-3">\s*<span className="text-\[#6B7280\] text-\[10px\] block">สถานะสัญญาณ<\/span>/g, 'className="grid grid-cols-1 sm:grid-cols-2 gap-2">\n                <div className="bg-[#0F1117] border border-[#252A3A] rounded-xl p-3">\n                  <span className="text-[#6B7280] text-[10px] block">สถานะสัญญาณ</span>');
  fs.writeFileSync(file, c);
}

fixGrid('src/components/SignalDetailModal.tsx');
fixGrid('src/components/ForexDetailModal.tsx');
