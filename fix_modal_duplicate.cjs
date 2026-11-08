const fs = require('fs');
let c = fs.readFileSync('src/components/SignalDetailModal.tsx', 'utf8');

c = c.replace(/const isForex = signal\.symbol\.includes\('\/'\);\n  const decimals = isForex && signal\.price < 100 \? 4 : 2;\n/g, "");

fs.writeFileSync('src/components/SignalDetailModal.tsx', c);
