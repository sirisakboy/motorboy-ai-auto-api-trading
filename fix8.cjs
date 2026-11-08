const fs = require('fs');

let s = fs.readFileSync('src/components/SignalDetailModal.tsx', 'utf8');
s = s.replace(/aiResult\.sentiment/g, "(aiResult as any).sentiment");
fs.writeFileSync('src/components/SignalDetailModal.tsx', s);

let a = fs.readFileSync('src/App.tsx', 'utf8');
a = a.replace(/import { \w+,? Sparkles, \w+ } from 'lucide-react';/g, ""); // well, just let eslint fix it or ignore it.
// Actually we can just run eslint --fix
