const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

appContent = appContent.replace(/\{selectedForex \{showSettings && \(\{showSettings && \( \(/g, '{selectedForex && (');
appContent = appContent.replace(/\{showSettings \{showSettings && \(\{showSettings && \( \(/g, '{showSettings && (');

fs.writeFileSync('src/App.tsx', appContent);

let serviceContent = fs.readFileSync('src/services/geminiService.ts', 'utf8');
serviceContent = serviceContent.replace(/summary: \\`วิเคราะห์จากความผันผวนของราคาล่าสุดที่ \\\${forex.change.toFixed\(2\)}% \(ข้อมูลสำรองอัตโนมัติ เนื่องจาก API จำกัดการใช้งาน\)\\`,/g, 'summary: `วิเคราะห์จากความผันผวนของราคาล่าสุดที่ ${forex.change.toFixed(2)}% (ข้อมูลสำรองอัตโนมัติ เนื่องจาก API จำกัดการใช้งาน)`,');
fs.writeFileSync('src/services/geminiService.ts', serviceContent);
