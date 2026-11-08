const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

const tab1Render = `                  {selectedTab === 1 && (
                    <div className="space-y-3">
                      {filteredForexSignals.map((sig) => {
                        const forexPair = forexRates.find(f => f.pair === sig.symbol);
                        const coinDummy = forexPair ? {
                          id: forexPair.pair.replace('/', '').toLowerCase(),
                          symbol: forexPair.pair,
                          name: forexPair.pair,
                          binanceSymbol: forexPair.pair,
                          price: forexPair.price,
                          change: forexPair.change,
                          flash: forexPair.flash
                        } : undefined;
                        
                        return (
                          <CryptoCard
                            key={sig.id}
                            signal={sig}
                            coin={coinDummy as any}
                            isWatchlisted={watchlist.has(sig.symbol)}
                            useThb={false} 
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => setSelectedSignal(sig)} 
                          />
                        );
                      })}
                    </div>
                  )}`;

c = c.replace(/\{selectedTab === 1 && \([\s\S]*?\}\)\]\}\n\s*<\/div>\n\s*\)\}/, tab1Render);

// Also modify selectedTab === 3 (Watchlist) to include both crypto and forex signals!
const tab3Render = `                  {selectedTab === 3 && (
                    <div className="space-y-3">
                      {filteredSignals.length > 0 || filteredForexSignals.length > 0 ? (
                        [...filteredSignals, ...filteredForexSignals].map((sig) => {
                          const coin = cryptoList.find((c) => c.symbol === sig.symbol);
                          const forexPair = forexRates.find(f => f.pair === sig.symbol);
                          const coinDummy = forexPair ? {
                            id: forexPair.pair.replace('/', '').toLowerCase(),
                            symbol: forexPair.pair,
                            name: forexPair.pair,
                            binanceSymbol: forexPair.pair,
                            price: forexPair.price,
                            change: forexPair.change,
                            flash: forexPair.flash
                          } : undefined;
                          
                          return (
                            <CryptoCard
                              key={sig.id}
                              signal={sig}
                              coin={(coin || coinDummy) as any}
                              isWatchlisted={true}
                              useThb={useThb && !forexPair}
                              onToggleWatchlist={handleToggleWatchlist}
                              onSelect={() => setSelectedSignal(sig)}
                            />
                          );
                        })
                      ) : (
                        <div className="rounded-[18px] bg-[#1A1D29] border border-[#252A3A] p-8 text-center">
                          <p className="text-white text-sm font-semibold">
                            ยังไม่มีสินทรัพย์ใน Watchlist
                          </p>
                          <p className="text-[#6B7280] text-xs mt-1">
                            แตะรูปดาว ⭐️ ที่การ์ดสัญญาณเพื่อเพิ่มลงในรายการโปรด
                          </p>
                        </div>
                      )}
                    </div>
                  )}`;

c = c.replace(/\{selectedTab === 3 && \([\s\S]*?\}\)\n\s*\}\n\s*<\/div>\n\s*\)\}/, tab3Render);

// And update tabs count
c = c.replace(/\{ label: 'Watchlist', count: watchlist\.size \}/, "{ label: 'Watchlist', count: [...filteredSignals, ...filteredForexSignals].length }");

fs.writeFileSync('src/App.tsx', c);
