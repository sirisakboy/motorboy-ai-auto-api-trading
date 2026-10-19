const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

c = c.replace(/<SignalDetailModal\n\s*signal=\{selectedSignal\}\n\s*coin=\{cryptoList\.find\(\(c\) => c\.symbol === selectedSignal\?\.symbol\)\}\n\s*useThb=\{useThb\}\n\s*geminiApiKey=\{geminiApiKey\}/, `<SignalDetailModal
              signal={selectedSignal}
              coin={cryptoList.find((c) => c.symbol === selectedSignal?.symbol)}
              useThb={useThb && !selectedSignal.symbol.includes('/')}
              geminiApiKey={geminiApiKey}`);

fs.writeFileSync('src/App.tsx', c);
