import React, { useState, useEffect } from 'react';
import { Plus, Minus, Coins, Calculator, RotateCcw, ChevronRight, Trophy, X, Check, AlertTriangle, Banknote } from 'lucide-react';

export default function PokerNight() {
  const [stage, setStage] = useState('home'); // home, setup, game, cashout, settlement
  const [players, setPlayers] = useState([]);
  const [cashWinners, setCashWinners] = useState([]); // שחקני מזומן שצריך לשלם להם
  const [newPlayerName, setNewPlayerName] = useState('');
  const [defaultBuyIn, setDefaultBuyIn] = useState(50);
  const [customBuyInOpen, setCustomBuyInOpen] = useState(null); // playerId
  const [customBuyInAmount, setCustomBuyInAmount] = useState('');
  const [newCashWinnerName, setNewCashWinnerName] = useState('');
  const [newCashWinnerAmount, setNewCashWinnerAmount] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, onConfirm }
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [midGameName, setMidGameName] = useState('');
  const [midGameAmount, setMidGameAmount] = useState('');
  const [loading, setLoading] = useState(true);

  // טעינה מ-localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('poker_current_game');
      if (stored) {
        const data = JSON.parse(stored);
        setStage(data.stage || 'home');
        setPlayers(data.players || []);
        setDefaultBuyIn(data.defaultBuyIn || 50);
        setCashWinners(data.cashWinners || []);
      }
    } catch (e) {
      // אין משחק שמור
    }
    setLoading(false);
  }, []);

  // שמירה אוטומטית
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem('poker_current_game', JSON.stringify({
        stage, players, defaultBuyIn, cashWinners
      }));
    } catch (e) {}
  }, [stage, players, defaultBuyIn, cashWinners, loading]);

  const addPlayer = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    if (players.some(p => p.name === name)) return;
    setPlayers([...players, {
      id: Date.now(),
      name,
      buyIns: [defaultBuyIn],
      chips: null,
    }]);
    setNewPlayerName('');
  };

  const removePlayer = (id) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  // הוספת שחקן באמצע המשחק (למשל: שחקן מזומן שעובר לרישומים)
  const addPlayerMidGame = () => {
    const name = midGameName.trim();
    const amount = Number(midGameAmount) || defaultBuyIn;
    if (!name || amount <= 0) return;
    if (players.some(p => p.name === name)) return;
    setPlayers([...players, {
      id: Date.now(),
      name,
      buyIns: [amount],
      chips: null,
    }]);
    setMidGameName('');
    setMidGameAmount('');
    setAddPlayerOpen(false);
  };

  const addBuyIn = (playerId, amount) => {
    if (!amount || amount <= 0) return;
    setPlayers(players.map(p =>
      p.id === playerId
        ? { ...p, buyIns: [...p.buyIns, amount] }
        : p
    ));
  };

  const undoLastBuyIn = (playerId) => {
    const player = players.find(p => p.id === playerId);
    if (player.buyIns.length <= 1) return;
    setPlayers(players.map(p =>
      p.id === playerId
        ? { ...p, buyIns: p.buyIns.slice(0, -1) }
        : p
    ));
  };

  // שחקן יצא באמצע והחזיר בז'יטונים את הסכום שרשם - יוצא ב-0
  const settlePlayer = (playerId) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    const totalBuyIn = player.buyIns.reduce((a, b) => a + b, 0);
    setConfirmDialog({
      title: `סגירה ב-0 - ${player.name}`,
      message: `האם ${player.name} יצא באמצע והחזיר ז'יטונים בערך ₪${totalBuyIn.toLocaleString()}?\nהמאזן שלו יוגדר כ-0.`,
      onConfirm: () => {
        setPlayers(prev => prev.map(p =>
          p.id === playerId ? { ...p, chips: totalBuyIn, settled: true } : p
        ));
        setConfirmDialog(null);
      }
    });
  };

  const unsettlePlayer = (playerId) => {
    setPlayers(players.map(p =>
      p.id === playerId ? { ...p, chips: null, settled: false } : p
    ));
  };

  // הוספת שחקן מזומן זוכה
  const addCashWinner = () => {
    const name = newCashWinnerName.trim();
    const amount = Number(newCashWinnerAmount);
    if (!name || !amount || amount <= 0) return;
    setCashWinners([...cashWinners, {
      id: Date.now(),
      name,
      amount,
    }]);
    setNewCashWinnerName('');
    setNewCashWinnerAmount('');
  };

  const removeCashWinner = (id) => {
    setCashWinners(cashWinners.filter(c => c.id !== id));
  };

  const resetGame = () => {
    setConfirmDialog({
      title: 'התחלת ערב חדש',
      message: 'בטוח שברצונך להתחיל ערב חדש?\nכל הנתונים הנוכחיים ימחקו לצמיתות.',
      destructive: true,
      onConfirm: () => {
        setStage('home');
        setPlayers([]);
        setCashWinners([]);
        try {
          localStorage.removeItem('poker_current_game');
        } catch (e) {}
        setConfirmDialog(null);
      }
    });
  };

  const setChips = (playerId, value) => {
    setPlayers(players.map(p =>
      p.id === playerId ? { ...p, chips: value === '' ? null : Number(value) } : p
    ));
  };

  // חישוב סך כל הקופה
  const totalPot = players.reduce((sum, p) => sum + p.buyIns.reduce((a, b) => a + b, 0), 0);
  const totalChips = players.reduce((sum, p) => sum + (p.chips || 0), 0);
  const totalCashOwed = cashWinners.reduce((sum, c) => sum + c.amount, 0);

  // אלגוריתם debt simplification
  const calculateTransfers = () => {
    if (players.some(p => p.chips === null)) return null;

    // נטו לכל שחקן רשום: chips - total buy-ins
    const balances = players.map(p => ({
      name: p.name,
      balance: p.chips - p.buyIns.reduce((a, b) => a + b, 0)
    }));

    // שחקני מזומן זוכים: מאזן חיובי (מגיע להם)
    cashWinners.forEach(c => {
      balances.push({ name: c.name, balance: c.amount, isCash: true });
    });

    // עיגול ל-2 ספרות אחרי הנקודה
    balances.forEach(b => b.balance = Math.round(b.balance * 100) / 100);

    const creditors = balances.filter(b => b.balance > 0.01).sort((a, b) => b.balance - a.balance);
    const debtors = balances.filter(b => b.balance < -0.01).sort((a, b) => a.balance - b.balance);

    const transfers = [];
    let i = 0, j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debt = -debtors[i].balance;
      const credit = creditors[j].balance;
      const amount = Math.min(debt, credit);

      transfers.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount: Math.round(amount * 100) / 100,
      });

      debtors[i].balance += amount;
      creditors[j].balance -= amount;

      if (Math.abs(debtors[i].balance) < 0.01) i++;
      if (Math.abs(creditors[j].balance) < 0.01) j++;
    }

    return transfers;
  };

  const transfers = stage === 'settlement' ? calculateTransfers() : null;

  if (loading) {
    return <div className="min-h-screen bg-stone-950 flex items-center justify-center text-amber-100">טוען...</div>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-stone-950 text-stone-100" style={{
      backgroundImage: 'radial-gradient(circle at 20% 0%, rgba(139, 21, 56, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 100%, rgba(180, 142, 73, 0.1) 0%, transparent 50%)',
      fontFamily: '"Frank Ruhl Libre", "Playfair Display", Georgia, serif',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;600;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div className="border-b border-amber-900/30 backdrop-blur-sm sticky top-0 z-10 bg-stone-950/80">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">♠</div>
            <h1 className="text-xl font-bold tracking-wide text-amber-100" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
              ערב פוקר
            </h1>
          </div>
          {stage !== 'home' && (
            <button onClick={resetGame} className="text-stone-500 hover:text-red-400 transition text-sm flex items-center gap-1" style={{fontFamily: '"Heebo", sans-serif'}}>
              <RotateCcw size={14} />
              ערב חדש
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8" style={{fontFamily: '"Heebo", sans-serif'}}>

        {/* Stage: Home */}
        {stage === 'home' && (
          <div className="text-center py-16">
            <div className="text-7xl mb-6 opacity-80">♠ ♥ ♦ ♣</div>
            <h2 className="text-4xl font-bold text-amber-100 mb-4" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
              ברוכים הבאים
            </h2>
            <p className="text-stone-400 mb-12 max-w-md mx-auto leading-relaxed">
              נהל את ערב הפוקר שלך - עקוב אחרי buy-ins, ספור ז'יטונים בסוף, וקבל את חישוב ההעברות האופטימלי
            </p>
            <button
              onClick={() => setStage('setup')}
              className="bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 text-amber-50 px-12 py-4 rounded-sm font-semibold tracking-wide shadow-lg shadow-amber-900/50 border border-amber-600/30 transition-all hover:shadow-amber-700/50"
            >
              התחל ערב חדש
            </button>
          </div>
        )}

        {/* Stage: Setup */}
        {stage === 'setup' && (
          <div>
            <h2 className="text-3xl font-bold text-amber-100 mb-2" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
              הוספת שחקנים
            </h2>
            <p className="text-stone-400 mb-8 text-sm">הוסף את כל השחקנים והגדר את ה-Buy-in ההתחלתי</p>

            <div className="bg-stone-900/50 border border-amber-900/30 rounded-sm p-5 mb-6">
              <label className="block text-sm text-stone-400 mb-2">Buy-in ברירת מחדל (₪)</label>
              <input
                type="number"
                value={defaultBuyIn}
                onChange={(e) => setDefaultBuyIn(Number(e.target.value) || 0)}
                className="w-full bg-stone-950 border border-stone-700 rounded-sm px-4 py-2 text-amber-100 text-lg focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="bg-stone-900/50 border border-amber-900/30 rounded-sm p-5 mb-6">
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                  placeholder="שם השחקן"
                  className="flex-1 bg-stone-950 border border-stone-700 rounded-sm px-4 py-3 text-amber-100 focus:border-amber-600 focus:outline-none"
                />
                <button
                  onClick={addPlayer}
                  className="bg-amber-700 hover:bg-amber-600 text-amber-50 px-5 rounded-sm transition flex items-center gap-2"
                >
                  <Plus size={18} />
                  הוסף
                </button>
              </div>

              {players.length === 0 ? (
                <p className="text-stone-600 text-center py-6 text-sm">עוד אין שחקנים</p>
              ) : (
                <div className="space-y-2">
                  {players.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between bg-stone-950/50 border border-stone-800 rounded-sm px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-amber-700 text-sm w-6">{idx + 1}.</span>
                        <span className="text-amber-100">{p.name}</span>
                        <span className="text-stone-500 text-sm">₪{p.buyIns[0]}</span>
                      </div>
                      <button
                        onClick={() => removePlayer(p.id)}
                        className="text-stone-500 hover:text-red-400 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setStage('game')}
              disabled={players.length < 2}
              className="w-full bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-800 disabled:to-stone-900 disabled:text-stone-600 text-amber-50 py-4 rounded-sm font-semibold tracking-wide shadow-lg shadow-amber-900/50 border border-amber-600/30 disabled:border-stone-700 transition flex items-center justify-center gap-2"
            >
              {players.length < 2 ? 'הוסף לפחות 2 שחקנים' : 'התחל משחק'}
              {players.length >= 2 && <ChevronRight size={18} />}
            </button>
          </div>
        )}

        {/* Stage: Game */}
        {stage === 'game' && (
          <div>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-3xl font-bold text-amber-100" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                  המשחק בעיצומו
                </h2>
                <p className="text-stone-400 text-sm mt-1">לחץ + לתוספת Buy-in</p>
              </div>
              <div className="text-left">
                <div className="text-xs text-stone-500 uppercase tracking-widest">סך הקופה</div>
                <div className="text-3xl font-bold text-amber-400" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                  ₪{totalPot.toLocaleString()}
                </div>
              </div>
            </div>

            {/* הוספת שחקן באמצע המשחק */}
            <div className="mb-6">
              {!addPlayerOpen ? (
                <button
                  onClick={() => setAddPlayerOpen(true)}
                  className="w-full border border-dashed border-stone-700 hover:border-amber-700 text-stone-500 hover:text-amber-300 py-3 rounded-sm transition flex items-center justify-center gap-2 text-sm"
                >
                  <Plus size={16} />
                  הוסף שחקן (למשל: שחקן מזומן שעובר לרישומים)
                </button>
              ) : (
                <div className="bg-stone-900/50 border border-amber-900/30 rounded-sm p-4">
                  <div className="text-sm text-amber-200 mb-3 font-semibold">שחקן חדש מצטרף לרישומים</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={midGameName}
                      onChange={(e) => setMidGameName(e.target.value)}
                      placeholder="שם"
                      autoFocus
                      className="flex-1 bg-stone-950 border border-stone-700 rounded-sm px-3 py-2 text-amber-100 focus:border-amber-600 focus:outline-none"
                    />
                    <input
                      type="number"
                      value={midGameAmount}
                      onChange={(e) => setMidGameAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPlayerMidGame()}
                      placeholder={`רישום ראשון (${defaultBuyIn})`}
                      className="w-40 bg-stone-950 border border-stone-700 rounded-sm px-3 py-2 text-amber-100 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div className="text-xs text-stone-500 mt-2 leading-relaxed">
                    שים לב: מזומן שהשחקן שם קודם נשאר בקופה ולא נרשם באפליקציה. רק הרישומים מעכשיו נספרים.
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { setAddPlayerOpen(false); setMidGameName(''); setMidGameAmount(''); }}
                      className="px-4 py-2 rounded-sm border border-stone-700 text-stone-400 hover:text-amber-100 transition text-sm"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={addPlayerMidGame}
                      disabled={!midGameName.trim()}
                      className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:bg-stone-800 disabled:text-stone-600 text-amber-50 py-2 rounded-sm transition text-sm font-semibold"
                    >
                      הוסף שחקן
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 mb-8">
              {players.map((p) => {
                const total = p.buyIns.reduce((a, b) => a + b, 0);
                const isSettled = p.settled;
                const isCustomOpen = customBuyInOpen === p.id;
                return (
                  <div key={p.id} className={`bg-stone-900/50 border rounded-sm p-4 transition ${isSettled ? 'border-stone-800 opacity-60' : 'border-amber-900/30 hover:border-amber-800/50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="text-lg text-amber-100 font-semibold">{p.name}</span>
                          {isSettled ? (
                            <span className="text-xs text-stone-500 border border-stone-700 px-2 py-0.5 rounded-sm">יצא ב-0</span>
                          ) : (
                            <span className="text-stone-500 text-sm">
                              {p.buyIns.length} buy-in{p.buyIns.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className={`text-2xl font-bold mt-1 ${isSettled ? 'text-stone-500' : 'text-amber-400'}`} style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                          ₪{total.toLocaleString()}
                        </div>
                      </div>
                      {!isSettled && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.buyIns.length > 1 && (
                            <button
                              onClick={() => undoLastBuyIn(p.id)}
                              className="bg-stone-800 hover:bg-red-900/50 text-stone-400 hover:text-red-300 w-10 h-10 rounded-sm flex items-center justify-center transition border border-stone-700"
                              title="בטל את ה-Buy-in האחרון"
                            >
                              <Minus size={18} />
                            </button>
                          )}
                          <button
                            onClick={() => addBuyIn(p.id, defaultBuyIn)}
                            className="bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 text-amber-50 px-4 h-10 rounded-sm font-semibold flex items-center gap-1 transition shadow-md border border-amber-600/30"
                          >
                            <Plus size={16} />
                            ₪{defaultBuyIn}
                          </button>
                          <button
                            onClick={() => {
                              setCustomBuyInOpen(isCustomOpen ? null : p.id);
                              setCustomBuyInAmount('');
                            }}
                            className={`w-10 h-10 rounded-sm flex items-center justify-center transition border ${isCustomOpen ? 'bg-amber-700 border-amber-600 text-amber-50' : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-amber-100 hover:border-amber-700'}`}
                            title="סכום אחר"
                          >
                            ₪
                          </button>
                        </div>
                      )}
                      {isSettled && (
                        <button
                          onClick={() => unsettlePlayer(p.id)}
                          className="text-stone-500 hover:text-amber-300 text-xs underline"
                        >
                          בטל איפוס
                        </button>
                      )}
                    </div>

                    {/* שורת סכום ידני */}
                    {isCustomOpen && !isSettled && (
                      <div className="mt-3 pt-3 border-t border-stone-800 flex gap-2">
                        <input
                          type="number"
                          value={customBuyInAmount}
                          onChange={(e) => setCustomBuyInAmount(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addBuyIn(p.id, Number(customBuyInAmount));
                              setCustomBuyInOpen(null);
                              setCustomBuyInAmount('');
                            }
                          }}
                          placeholder="הכנס סכום"
                          autoFocus
                          className="flex-1 bg-stone-950 border border-stone-700 rounded-sm px-4 py-2 text-amber-100 focus:border-amber-600 focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            addBuyIn(p.id, Number(customBuyInAmount));
                            setCustomBuyInOpen(null);
                            setCustomBuyInAmount('');
                          }}
                          disabled={!customBuyInAmount || Number(customBuyInAmount) <= 0}
                          className="bg-amber-700 hover:bg-amber-600 disabled:bg-stone-800 disabled:text-stone-600 text-amber-50 px-4 rounded-sm transition"
                        >
                          הוסף
                        </button>
                      </div>
                    )}

                    {/* כפתור איפוס - יציאה באמצע */}
                    {!isSettled && (
                      <div className="mt-3 pt-3 border-t border-stone-800/50 flex justify-end">
                        <button
                          onClick={() => settlePlayer(p.id)}
                          className="text-xs text-stone-500 hover:text-amber-300 transition flex items-center gap-1"
                          title="יצא באמצע והחזיר את הז'יטונים"
                        >
                          <RotateCcw size={12} />
                          סגירה ב-0 (יוצא באמצע)
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setStage('cashout')}
              className="w-full bg-gradient-to-b from-red-900 to-red-950 hover:from-red-800 hover:to-red-900 text-amber-50 py-4 rounded-sm font-semibold tracking-wide shadow-lg shadow-red-950/50 border border-red-800/30 transition flex items-center justify-center gap-2"
            >
              <Coins size={18} />
              סיום משחק - ספירת ז'יטונים
            </button>
          </div>
        )}

        {/* Stage: Cashout */}
        {stage === 'cashout' && (
          <div>
            <h2 className="text-3xl font-bold text-amber-100 mb-2" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
              ספירת ז'יטונים
            </h2>
            <p className="text-stone-400 mb-6 text-sm">
              הזן את הערך הכספי של הז'יטונים שיש לכל שחקן בסוף המשחק
            </p>

            <div className="bg-stone-900/50 border border-amber-900/30 rounded-sm p-4 mb-6">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-stone-500 uppercase tracking-widest text-xs">קופה</div>
                  <div className="text-xl text-amber-400 font-bold" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>₪{totalPot.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-stone-500 uppercase tracking-widest text-xs">חוב לשחקני מזומן</div>
                  <div className="text-xl text-amber-300 font-bold" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>₪{totalCashOwed.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-stone-500 uppercase tracking-widest text-xs">סך ז'יטונים</div>
                  <div className={`text-xl font-bold ${Math.abs(totalChips - (totalPot - totalCashOwed)) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`} style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                    ₪{totalChips.toLocaleString()}
                  </div>
                </div>
              </div>
              {(() => {
                const expectedChips = totalPot - totalCashOwed;
                const diff = totalChips - expectedChips;
                if (Math.abs(diff) >= 0.01 && players.every(p => p.chips !== null)) {
                  return (
                    <div className="mt-3 pt-3 border-t border-stone-800 text-sm">
                      <div className="text-red-400 font-semibold mb-1">
                        ⚠ הפרש של ₪{Math.abs(diff).toLocaleString()}
                      </div>
                      <div className="text-xs text-stone-400 leading-relaxed">
                        {diff < 0 ? (
                          <>
                            סך הז'יטונים נמוך ב-₪{Math.abs(diff).toLocaleString()} ממה שצפוי. ייתכן ש:
                            <ul className="mt-1 mr-3 space-y-0.5 text-stone-500">
                              <li>• יש עוד שחקן מזומן זוכה של ₪{Math.abs(diff).toLocaleString()} שלא הוספת</li>
                              <li>• אחד השחקנים סופר ז'יטונים לא נכון</li>
                            </ul>
                          </>
                        ) : (
                          <>
                            סך הז'יטונים גבוה ב-₪{Math.abs(diff).toLocaleString()} ממה שצפוי. ייתכן ש:
                            <ul className="mt-1 mr-3 space-y-0.5 text-stone-500">
                              <li>• אחד השחקנים סופר ז'יטונים יותר מדי</li>
                              <li>• רשמת חוב למזומן גדול מדי</li>
                            </ul>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-stone-600 mt-2">צפוי: ₪{expectedChips.toLocaleString()} (קופה פחות חוב למזומן)</div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="space-y-3 mb-6">
              {players.map((p) => {
                const totalBuyIn = p.buyIns.reduce((a, b) => a + b, 0);
                const profit = p.chips !== null ? p.chips - totalBuyIn : null;
                const isSettled = p.settled;
                return (
                  <div key={p.id} className={`bg-stone-900/50 border rounded-sm p-4 ${isSettled ? 'border-stone-800 opacity-70' : 'border-amber-900/30'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg text-amber-100 font-semibold">{p.name}</span>
                          {isSettled && (
                            <span className="text-xs text-stone-500 border border-stone-700 px-2 py-0.5 rounded-sm">יצא ב-0</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-500">השקיע: ₪{totalBuyIn.toLocaleString()}</div>
                      </div>
                      {profit !== null && (
                        <div className={`text-lg font-bold ${profit > 0 ? 'text-emerald-400' : profit < 0 ? 'text-red-400' : 'text-stone-400'}`} style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                          {profit > 0 ? '+' : ''}₪{profit.toLocaleString()}
                        </div>
                      )}
                    </div>
                    {!isSettled && (
                      <input
                        type="number"
                        value={p.chips ?? ''}
                        onChange={(e) => setChips(p.id, e.target.value)}
                        placeholder="ערך הז'יטונים בסוף המשחק"
                        className="w-full bg-stone-950 border border-stone-700 rounded-sm px-4 py-3 text-amber-100 text-lg focus:border-amber-600 focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* שחקני מזומן זוכים */}
            <div className="bg-stone-900/30 border border-amber-900/20 rounded-sm p-4 mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Banknote size={18} className="text-amber-400" />
                <h3 className="text-amber-200 font-semibold">שחקני מזומן שצריך לשלם להם</h3>
              </div>
              <p className="text-stone-500 text-xs mb-4 leading-relaxed">
                שחקנים שלא רשומים באפליקציה (שילמו במזומן) אבל הרוויחו יותר מהמזומן שבקופה - וצריך להעביר להם את ההפרש
              </p>

              {cashWinners.length > 0 && (
                <div className="space-y-2 mb-4">
                  {cashWinners.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-stone-950/50 border border-stone-800 rounded-sm px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-amber-100">{c.name}</span>
                        <span className="text-amber-400 font-semibold" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>₪{c.amount.toLocaleString()}</span>
                      </div>
                      <button
                        onClick={() => removeCashWinner(c.id)}
                        className="text-stone-500 hover:text-red-400 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCashWinnerName}
                  onChange={(e) => setNewCashWinnerName(e.target.value)}
                  placeholder="שם"
                  className="flex-1 bg-stone-950 border border-stone-700 rounded-sm px-3 py-2 text-amber-100 focus:border-amber-600 focus:outline-none text-sm"
                />
                <input
                  type="number"
                  value={newCashWinnerAmount}
                  onChange={(e) => setNewCashWinnerAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCashWinner()}
                  placeholder="סכום"
                  className="w-28 bg-stone-950 border border-stone-700 rounded-sm px-3 py-2 text-amber-100 focus:border-amber-600 focus:outline-none text-sm"
                />
                <button
                  onClick={addCashWinner}
                  disabled={!newCashWinnerName.trim() || !newCashWinnerAmount || Number(newCashWinnerAmount) <= 0}
                  className="bg-stone-800 hover:bg-amber-700 disabled:bg-stone-900 disabled:text-stone-600 text-amber-100 px-4 rounded-sm transition border border-stone-700 hover:border-amber-600"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStage('game')}
                className="px-6 py-4 rounded-sm border border-stone-700 text-stone-400 hover:text-amber-100 hover:border-amber-700 transition"
              >
                חזור למשחק
              </button>
              <button
                onClick={() => setStage('settlement')}
                disabled={players.some(p => p.chips === null) || Math.abs(totalChips - (totalPot - totalCashOwed)) >= 0.01}
                className="flex-1 bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 disabled:from-stone-800 disabled:to-stone-900 disabled:text-stone-600 text-amber-50 py-4 rounded-sm font-semibold tracking-wide shadow-lg shadow-amber-900/50 border border-amber-600/30 disabled:border-stone-700 transition flex items-center justify-center gap-2"
              >
                {players.some(p => p.chips === null) ? 'מלא את כל השחקנים' : Math.abs(totalChips - (totalPot - totalCashOwed)) >= 0.01 ? 'תקן את ההפרש' : (
                  <>
                    <Calculator size={18} />
                    חשב העברות
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Stage: Settlement */}
        {stage === 'settlement' && (
          <div>
            <h2 className="text-3xl font-bold text-amber-100 mb-2" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
              סיכום הערב
            </h2>
            <p className="text-stone-400 mb-8 text-sm">חישוב אופטימלי של ההעברות</p>

            {/* Player results */}
            <div className="bg-stone-900/50 border border-amber-900/30 rounded-sm p-5 mb-6">
              <h3 className="text-amber-300 font-semibold mb-4 flex items-center gap-2" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                <Trophy size={18} />
                תוצאות
              </h3>
              <div className="space-y-2">
                {(() => {
                  const allResults = [
                    ...players.map(p => ({
                      id: p.id,
                      name: p.name,
                      profit: p.chips - p.buyIns.reduce((s, x) => s + x, 0),
                      isCash: false,
                    })),
                    ...cashWinners.map(c => ({
                      id: 'cash-' + c.id,
                      name: c.name,
                      profit: c.amount,
                      isCash: true,
                    }))
                  ].sort((a, b) => b.profit - a.profit);

                  return allResults.map((r, idx) => (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-stone-800 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm w-6 ${idx === 0 ? 'text-amber-400' : 'text-stone-600'}`}>
                          {idx === 0 ? '👑' : `${idx + 1}.`}
                        </span>
                        <span className="text-amber-100">{r.name}</span>
                        {r.isCash && (
                          <span className="text-xs text-stone-500 border border-stone-700 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                            <Banknote size={10} />
                            מזומן
                          </span>
                        )}
                      </div>
                      <div className={`font-bold ${r.profit > 0 ? 'text-emerald-400' : r.profit < 0 ? 'text-red-400' : 'text-stone-400'}`} style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                        {r.profit > 0 ? '+' : ''}₪{r.profit.toLocaleString()}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Transfers */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-stone-900/50 border border-emerald-900/40 rounded-sm p-5 mb-6">
              <h3 className="text-emerald-300 font-semibold mb-4 flex items-center gap-2" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                <ChevronRight size={18} />
                העברות נדרשות ({transfers?.length || 0})
              </h3>
              {!transfers || transfers.length === 0 ? (
                <p className="text-stone-400 text-center py-4">אין צורך בהעברות - כולם יצאו בתיקו</p>
              ) : (
                <div className="space-y-3">
                  {transfers.map((t, idx) => (
                    <div key={idx} className="bg-stone-950/60 border border-stone-800 rounded-sm p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-base">
                        <span className="text-red-300 font-semibold">{t.from}</span>
                        <ChevronRight size={16} className="text-stone-600" />
                        <span className="text-emerald-300 font-semibold">{t.to}</span>
                      </div>
                      <div className="text-xl font-bold text-amber-300" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                        ₪{t.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStage('cashout')}
                className="px-6 py-3 rounded-sm border border-stone-700 text-stone-400 hover:text-amber-100 hover:border-amber-700 transition"
              >
                חזור לעריכה
              </button>
              <button
                onClick={resetGame}
                className="flex-1 bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 text-amber-50 py-3 rounded-sm font-semibold tracking-wide shadow-lg shadow-amber-900/50 border border-amber-600/30 transition flex items-center justify-center gap-2"
              >
                <Check size={18} />
                סיים וערב חדש
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-stone-900 border border-amber-900/40 rounded-sm max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{fontFamily: '"Heebo", sans-serif'}}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-sm flex items-center justify-center ${confirmDialog.destructive ? 'bg-red-950/50 text-red-400' : 'bg-amber-950/50 text-amber-400'}`}>
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-xl font-bold text-amber-100 leading-tight mt-1" style={{fontFamily: '"Frank Ruhl Libre", serif'}}>
                {confirmDialog.title}
              </h3>
            </div>
            <p className="text-stone-300 mb-6 leading-relaxed whitespace-pre-line">
              {confirmDialog.message}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 px-4 py-3 rounded-sm border border-stone-700 text-stone-300 hover:text-amber-100 hover:border-amber-700 transition"
              >
                ביטול
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`flex-1 px-4 py-3 rounded-sm font-semibold transition shadow-lg ${
                  confirmDialog.destructive
                    ? 'bg-gradient-to-b from-red-800 to-red-900 hover:from-red-700 hover:to-red-800 text-red-50 border border-red-700/50 shadow-red-950/50'
                    : 'bg-gradient-to-b from-amber-700 to-amber-800 hover:from-amber-600 hover:to-amber-700 text-amber-50 border border-amber-600/30 shadow-amber-900/50'
                }`}
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
