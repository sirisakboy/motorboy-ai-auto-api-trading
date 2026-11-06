const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

c = c.replace(/generateRealSignals,/, 'generateRealSignals,\n  generateForexSignals,');

c = c.replace(/const \[signals, setSignals\] = useState<TradingSignal\[\]>\(\(\) =>\n\s*generateRealSignals\(CRYPTO_INITIAL\)\n\s*\);/, `const [signals, setSignals] = useState<TradingSignal[]>(() =>
    generateRealSignals(CRYPTO_INITIAL)
  );
  const [forexSignals, setForexSignals] = useState<TradingSignal[]>([]);`);

c = c.replace(/setForexRates\(rates\);/, `setForexRates(rates);
        setForexSignals(generateForexSignals(rates));`);

c = c.replace(/const filteredSignals = useMemo\(\(\) => \{[\s\S]*?\}, \[signals, searchQuery, selectedTab, watchlist\]\);/, `const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const matchesSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.base.toLowerCase().includes(searchQuery.toLowerCase());
      if (selectedTab === 3) {
        return matchesSearch && watchlist.has(s.symbol);
      }
      return matchesSearch;
    });
  }, [signals, searchQuery, selectedTab, watchlist]);
  
  const filteredForexSignals = useMemo(() => {
    return forexSignals.filter((s) => {
      const matchesSearch =
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.base.toLowerCase().includes(searchQuery.toLowerCase());
      if (selectedTab === 3) {
        return matchesSearch && watchlist.has(s.symbol);
      }
      return matchesSearch;
    });
  }, [forexSignals, searchQuery, selectedTab, watchlist]);`);

fs.writeFileSync('src/App.tsx', c);
