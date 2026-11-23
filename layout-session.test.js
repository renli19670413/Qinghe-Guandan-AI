'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('./engine.js'),H=require('./hand-columns.js'),P=require('./game-session.js');
const deck=E.deck(),cards=r=>deck.filter(c=>c.r===r);
test('every current level sits immediately before small joker; suit order stays unchanged',()=>{
  const hand=deck.slice().reverse(),printed=Array.from({length:13},(_,i)=>i+2);
  for(const level of printed){
    const columns=H.columns(hand,[],level);
    assert.deepEqual(columns.map(c=>c.rank),[...printed.filter(r=>r!==level),level,15,16]);
    for(const c of columns.filter(c=>c.rank<=14))assert.deepEqual(c.cards.map(c=>c.s),[0,0,1,1,2,2,3,3]);
    const sorted=H.sort(hand,level);assert.equal(sorted.at(-5).r,level);assert.equal(sorted.at(-4).r,15);
  }
  assert.deepEqual(hand,deck.slice().reverse(),'does not mutate game hands');
});
test('legal combination goes to right without requiring it to beat table target, invalid selection is rejected',()=>{
  const hand=[...cards(3).slice(0,3),...cards(4).slice(0,2),...cards(6).slice(0,2),...cards(14).slice(0,2)];
  const ids=hand.filter(c=>c.r===3||c.r===4).map(c=>c.id),groups=H.pack(hand,ids,2);
  let cols=H.columns(hand,groups);assert.equal(cols.at(-1).name,'三带对');assert.equal(cols.at(-1).cards.length,5);assert.deepEqual(cols.slice(0,-1).map(c=>c.rank),[6,14]);
  const second=H.pack(hand,hand.filter(c=>c.r===14).map(c=>c.id),2,groups);assert.equal(H.columns(hand,second).at(-1).name,'对子');
  assert.throws(()=>H.pack(hand,[hand[0].id,hand.at(-1).id],2,second),/合法牌型/);
  const partial=hand.filter(c=>c.id!==ids[0]);cols=H.columns(partial,second);
  assert.equal(new Set(cols.flatMap(c=>c.cards.map(c=>c.id))).size,partial.length);
  assert.equal(cols.flatMap(c=>c.cards).length,partial.length);
});
test('pause keeps the full mid-trick game, selections, layout, settings and per-seat model context',()=>{
  const g=new E.Game();g.startRound();const seat=g.turn,move=E.options(g.hands[seat],g.level)[0];g.play(seat,move.cards.map(c=>c.id),move.key);
  const ui={handLayout:{round:g.round,groups:[]},selected:[g.hands[0][0].id],aiMode:'llm',aiSettings:{model:'google/gemini-2.5-flash',difficulty:'hard'},contexts:[[1,{round:g.round,decisions:['自己出过牌']}]],auto:true};
  const stored=P.snapshot(g,ui),restored=P.restore(JSON.parse(JSON.stringify(stored)));
  assert.equal(restored.redeal,false);assert.deepEqual(JSON.parse(JSON.stringify(restored.game)),JSON.parse(JSON.stringify(g)));assert.deepEqual(restored.ui,ui);
  assert.equal(restored.game.target.key,move.key);assert.equal(restored.game.turn,g.turn);
  const copy=P.restore(stored).game;
  for(let n=0;n<12&&g.phase==='play';n++){
    const s=g.turn,m=E.choose(g.observation(s)).move,ids=m?m.cards.map(c=>c.id):[];
    g.play(s,ids,m?.key);copy.play(s,ids,m?.key);assert.deepEqual(JSON.parse(JSON.stringify(g)),JSON.parse(JSON.stringify(copy)));
  }
});
test('interrupt discards unfinished hands and trick without scoring, retains both levels and active level',()=>{
  const g=new E.Game();g.levels=[8,11];g.level=8;g.startRound();g.previous=[0,1,2,3];
  const oldHand=g.hands;const checkpoint=P.snapshot(g,{selected:[g.hands[0][0].id],contexts:[[1,{round:g.round,decisions:['x']}]]},'interrupt');
  assert.equal(checkpoint.state.hands,undefined);assert.deepEqual(checkpoint.ui.selected,[]);assert.deepEqual(checkpoint.ui.contexts,[]);
  const restored=P.restore(JSON.parse(JSON.stringify(checkpoint)));assert(restored.redeal);restored.game.startRound();
  assert.deepEqual(restored.game.levels,[8,11]);assert.equal(restored.game.level,8);assert.equal(restored.game.round,g.round+1);
  assert.equal(restored.game.target,null);assert.equal(restored.game.phase,'play');assert.equal(restored.game.returns.length,0);
  assert.deepEqual(restored.game.hands.map(h=>h.length),[27,27,27,27]);assert.notDeepEqual(restored.game.hands,oldHand);
});
test('pause during return phase preserves pending tribute and resumes legal return',()=>{
  const g=new E.Game();g.previous=[0,2,1,3];
  do{g.startRound();}while(g.phase!=='return');
  const copy=P.restore(P.snapshot(g)).game;assert.deepEqual(copy.returns,g.returns);
  while(copy.phase==='return'){const seat=copy.returns[0].from;copy.returnCard(seat,copy.returnChoices(seat)[0].id);}
  assert.deepEqual(copy.hands.map(h=>h.length),[27,27,27,27]);
});
test('LLM decision context survives export/import and copied snapshots do not alias live data',()=>{
  const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('agents.js','utf8')+'\nglobalThis.Pool=LLMAgentPool;',context);
  const pool=new context.Pool({model:'test'});pool.contexts.set(2,{round:3,decisions:['自己的出牌']});
  const saved=pool.exportState();pool.close();const next=new context.Pool({model:'test'});next.importState(saved);
  assert.equal(next.contexts.get(2).decisions[0],'自己的出牌');assert.equal(next.contexts.has(1),false);
  next.contexts.get(2).decisions.push('新出牌');assert.equal(saved[0][1].decisions.length,1);
});
