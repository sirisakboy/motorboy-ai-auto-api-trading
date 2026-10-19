const fs = require('fs');
let c = fs.readFileSync('src/services/apiClient.ts', 'utf8');

// Find all occurrences of generateForexSignals
const occurrences = c.split('export function generateForexSignals');
if (occurrences.length > 2) {
  // We have multiple! Let's just keep the first one.
  const firstPart = occurrences[0];
  const secondPart = occurrences[1];
  c = firstPart + 'export function generateForexSignals' + secondPart;
  
  // The secondPart goes until the end of the function, then there is another one.
  // Wait, let's just do a regex replace to remove the second one.
  
  // A safer way: write a script to find and delete the last occurrence
  let lastIndex = c.lastIndexOf('export function generateForexSignals');
  if (lastIndex > occurrences[0].length + 100) {
    c = c.substring(0, lastIndex);
  }
  fs.writeFileSync('src/services/apiClient.ts', c);
}
