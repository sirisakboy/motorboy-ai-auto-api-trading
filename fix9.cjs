const fs = require('fs');

let s = fs.readFileSync('src/components/SignalDetailModal.tsx', 'utf8');
s = s.replace(/if \(result\.sentiment\) \{/g, "if ((result as any).sentiment) {");
s = s.replace(/setSentiment\(result\.sentiment\);/g, "setSentiment((result as any).sentiment);");
fs.writeFileSync('src/components/SignalDetailModal.tsx', s);
