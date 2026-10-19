const fs = require('fs');
let c = fs.readFileSync('src/App.tsx', 'utf8');

const badPartRegex = /\{forexRates\.map\(\(forex\) => \([\s\S]*?<\/button>\n\s*\)\)\}\n\s*<\/div>\n\s*\)\}\n\s*\{selectedTab === 1 && \(/;

const fixedPart = `{forexRates.map((forex) => (
                        <button
                          key={forex.pair}
                          type="button"
                          onClick={() => setSelectedChartAsset(forex.pair)}
                          className={\`px-2.5 py-1 rounded-xl text-xs font-bold transition-all \${
                            selectedChartAsset === forex.pair
                              ? 'bg-[#10B981] text-white shadow-xs'
                              : 'bg-[#0F1117] text-[#9CA3AF] hover:text-white border border-[#252A3A]'
                          }\`}
                        >
                          {forex.pair}
                        </button>
                      ))}
                    </div>
                  </div>

                  <PriceChartCanvas
                    chartData={chartData}
                    isLoading={chartLoading}
                  />
                </div>

                {/* Asset Tabs & Filter */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Tabs */}
                    <div className="flex items-center space-x-1 bg-[#1A1D29] p-1 rounded-2xl border border-[#252A3A] overflow-x-auto">
                      {tabs.map((tab, idx) => (
                        <button
                          key={tab.label}
                          type="button"
                          onClick={() => setSelectedTab(idx)}
                          className={\`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center space-x-1.5 \${
                            selectedTab === idx
                              ? 'bg-white text-black font-bold shadow-xs'
                              : 'text-[#9CA3AF] hover:text-white'
                          }\`}
                        >
                          <span>{tab.label}</span>
                          {tab.count > 0 && (
                            <span
                              className={\`text-[10px] px-1.5 py-0.2 rounded-full \${
                                selectedTab === idx
                                  ? 'bg-black text-white'
                                  : 'bg-[#252A3A] text-[#A5B4FC]'
                              }\`}
                            >
                              {tab.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Search Bar for Assets */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="ค้นหาสินทรัพย์..."
                        className="w-full sm:w-48 bg-[#1A1D29] border border-[#252A3A] focus:border-[#7C6CFF] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white outline-none placeholder-[#6B7280]"
                      />
                    </div>
                  </div>

                  {/* Asset List Content */}
                  {selectedTab === 0 && (
                    <div className="space-y-3">
                      {filteredSignals.map((sig) => {
                        const coin = cryptoList.find((c) => c.symbol === sig.symbol);
                        return (
                          <CryptoCard
                            key={sig.id}
                            signal={sig}
                            coin={coin}
                            isWatchlisted={watchlist.has(sig.symbol)}
                            useThb={useThb}
                            onToggleWatchlist={handleToggleWatchlist}
                            onSelect={() => setSelectedSignal(sig)}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTab === 1 && (`;

c = c.replace(badPartRegex, fixedPart);

fs.writeFileSync('src/App.tsx', c);
