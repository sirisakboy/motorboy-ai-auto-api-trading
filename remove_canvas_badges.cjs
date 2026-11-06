const fs = require('fs');

let c = fs.readFileSync('src/components/PriceChartCanvas.tsx', 'utf8');

c = c.replace(/\/\/ Badge on right\s+const supText = [^}]+ctx\.fillText\(supText, w - 58, ySup - 6\);/m, '');
c = c.replace(/\/\/ Badge on right\s+const resText = [^}]+ctx\.fillText\(resText, w - 58, yRes - 6\);/m, '');

fs.writeFileSync('src/components/PriceChartCanvas.tsx', c);
