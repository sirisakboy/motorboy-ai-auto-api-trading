const fs = require('fs');

let c = fs.readFileSync('src/components/PriceChartCanvas.tsx', 'utf8');

const supportBadgeCode = `      // Badge on right
      const supText = \`แนวรับ: \${formatVal(chartData.support)}\`;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(w - 110, ySup - 18, 105, 16);
      ctx.strokeStyle = '#10B981';
      ctx.strokeRect(w - 110, ySup - 18, 105, 16);
      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(supText, w - 58, ySup - 6);`;

const resistBadgeCode = `      // Badge on right
      const resText = \`แนวต้าน: \${formatVal(chartData.resistance)}\`;
      ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
      ctx.fillRect(w - 110, yRes - 18, 105, 16);
      ctx.strokeStyle = '#F43F5E';
      ctx.strokeRect(w - 110, yRes - 18, 105, 16);
      ctx.fillStyle = '#FB7185';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(resText, w - 58, yRes - 6);`;

c = c.replace(supportBadgeCode, '');
c = c.replace(resistBadgeCode, '');

// Some line breaks might be weird, so try a regex if string replace fails
c = c.replace(/\/\/ Badge on right[\s\S]*?ctx\.fillText\(supText[^;]+;/g, '');
c = c.replace(/\/\/ Badge on right[\s\S]*?ctx\.fillText\(resText[^;]+;/g, '');


fs.writeFileSync('src/components/PriceChartCanvas.tsx', c);
