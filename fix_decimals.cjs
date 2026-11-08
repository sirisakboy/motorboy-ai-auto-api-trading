const fs = require('fs');

function fixDecimals(file) {
  let c = fs.readFileSync(file, 'utf8');
  
  c = c.replace(/const isLong = signal.type === 'LONG';/g, "const isLong = signal.type === 'LONG';\n  const isForex = signal.symbol.includes('/');\n  const decimals = isForex && signal.price < 100 ? 4 : 2;");
  
  c = c.replace(/minimumFractionDigits: 2,\n\s*maximumFractionDigits: 2,/g, "minimumFractionDigits: decimals,\n    maximumFractionDigits: decimals,");
  c = c.replace(/minimumFractionDigits: 1,\n\s*maximumFractionDigits: 1,/g, "minimumFractionDigits: decimals,\n    maximumFractionDigits: decimals,");

  fs.writeFileSync(file, c);
}

fixDecimals('src/components/CryptoCard.tsx');
fixDecimals('src/components/SignalDetailModal.tsx');
