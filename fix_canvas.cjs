const fs = require('fs');

function fixCanvas(file) {
  let c = fs.readFileSync(file, 'utf8');

  // Insert resize state
  c = c.replace(/  const \[hoveredIdx, setHoveredIdx\] = useState<number \| null>\(null\);/, 
`  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);`);

  // Add dimensions to dependency array
  c = c.replace(/  }, \[chartData, isLoading, hoveredIdx\]\);/, '  }, [chartData, isLoading, hoveredIdx, dimensions]);');

  fs.writeFileSync(file, c);
}

fixCanvas('src/components/PriceChartCanvas.tsx');
