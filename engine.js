(function (root, factory) {
  const api = factory(); api.factory = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Guandan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEngine() {
  'use strict';
  const ranks = Array.from({length: 13}, (_, i) => i + 2);
  const label = r => ({11:'J',12:'Q',13:'K',14:'A',15:'小王',16:'大王'}[r] || String(r));
  const suits = ['♠','♥','♣','♦'];
  const wild = (c, level) => c.r === level && c.s === 1;
  const strength = (r, level) => r > 14 ? r + 2 : r === level ? 16 : r;
  function deck() {
    const cards = [];
    for (let d = 0; d < 2; d++) {
      for (const r of ranks) for (let s = 0; s < 4; s++) cards.push({id: `${d}-${r}-${s}`, r, s});
      for (const r of [15,16]) cards.push({id: `${d}-${r}-4`, r, s:4});
    }
    return cards;
  }
  function shuffle(cards, random = Math.random) {
    const a = cards.slice();
    for (let i = a.length - 1; i > 0; i--) {const j = Math.floor(random() * (i + 1)); [a[i],a[j]] = [a[j],a[i]];}
    return a;
  }
  function sort(cards, level) {return cards.slice().sort((a,b) => strength(a.r,level)-strength(b.r,level) || a.s-b.s || a.id.localeCompare(b.id));}
  const text = c => c.r > 14 ? label(c.r) : suits[c.s] + label(c.r);
  const tier = p => p.type === 'king' ? 100 : p.type === 'flush' ? 5.5 : p.type === 'bomb' ? p.n : 0;
  function beats(a,b) {
    if (!b) return true;
    const ta=tier(a), tb=tier(b);
    if (ta !== tb) return ta > tb;
    if (ta === 100) return false;
    return (ta > 0 || a.type === b.type && a.n === b.n) && a.power > b.power;
  }
  const names = {single:'单张',pair:'对子',triple:'三同张',full:'三带对',straight:'顺子',pairs:'三连对',triples:'三同连张',bomb:'炸弹',flush:'同花顺',king:'四大天王'};
  const cache = new Map();
  function patterns(level) {
    if (cache.has(level)) return cache.get(level);
    const all=[];
    function add(type, values, main, suit=null) {
      const slots=values.map(r=>({r,s:suit}));
      const sequence=['straight','flush','pairs','triples'].includes(type);
      all.push({type,n:slots.length,main,power:sequence?main:strength(main,level),slots,key:`${type}:${values.join('.')}:${suit}`,name:names[type]});
    }
    for (const r of [...ranks,15,16]) {
      add('single',[r],r); add('pair',[r,r],r);
      if (r<=14) {
        add('triple',[r,r,r],r);
        for (let n=4;n<=10;n++) add('bomb',Array(n).fill(r),r);
        for (const k of [...ranks,15,16]) if (k!==r) add('full',[r,r,r,k,k],r);
      }
    }
    for (const [type, len, copies] of [['straight',5,1],['pairs',3,2],['triples',2,3]]) {
      for (let start=1;start<=15-len;start++) {
        const values=[];
        for (let i=0;i<len;i++) for (let j=0;j<copies;j++) values.push(start+i===1?14:start+i);
        add(type,values,start+len-1);
        if (type==='straight') for (let s=0;s<4;s++) add('flush',values,start+len-1,s);
      }
    }
    add('king',[15,15,16,16],16);
    cache.set(level,all); return all;
  }
  // Match natural cards first, then use hearts of the current level for missing slots.
  // A wildcard can never substitute for either joker; as a single it keeps its level.
  function match(hand, pattern, level) {
    if (hand.length<pattern.n) return null;
    const natural=hand.filter(c=>!wild(c,level)), ws=hand.filter(c=>wild(c,level));
    const used=new Set(), result=Array(pattern.n), missing=[];
    for (let i=0;i<pattern.n;i++) {
      const slot=pattern.slots[i];
      const c=natural.find(c=>!used.has(c.id) && c.r===slot.r && (slot.s===null || c.s===slot.s));
      if (c) {used.add(c.id);result[i]=c;} else missing.push(i);
    }
    if (missing.length>ws.length) return null;
    for (let j=0;j<missing.length;j++) {
      const i=missing[j], slot=pattern.slots[i];
      if (slot.r>14 || pattern.type==='single' && slot.r!==level) return null;
      result[i]=ws[j];
    }
    return {...pattern,cards:result,assignments:result.map((c,i)=>({id:c.id,r:pattern.slots[i].r,s:pattern.slots[i].s}))};
  }
  function options(hand,level,target=null) {
    return patterns(level).filter(p=>beats(p,target)).map(p=>match(hand,p,level)).filter(Boolean);
  }
  function classify(cards,level,target=null) {
    if (!cards.length || new Set(cards.map(c=>c.id)).size!==cards.length) return [];
    return patterns(level).filter(p=>p.n===cards.length && beats(p,target)).map(p=>match(cards,p,level)).filter(Boolean)
      .sort((a,b)=>tier(a)-tier(b) || a.power-b.power);
  }
  function choose(observation, personality=0) {
    const {hand,level,target,seat,counts,lastSeat}=observation;
    let moves=options(hand,level,target);
    if (!moves.length) return {move:null,reason:'没有可压过的牌'};
    const finish=moves.find(p=>p.n===hand.length);
    if (finish) return {move:finish,reason:'出完手牌，争取游数'};
    const teammate=(seat+2)%4, friendly=target && lastSeat===teammate;
    const danger=counts.some((n,i)=>i%2!==seat%2 && n>0 && n<=2);
    // Low opponent counts alone never justify taking control from our partner.
    // The all-cards finish above is the deliberate exception.
    if (friendly) return {move:null,reason:'搭档已压住牌，让搭档保持领出权'};
    const groups=new Map(); for (const c of hand) groups.set(c.r,(groups.get(c.r)||0)+1);
    function score(p) {
      let s=0;
      const spentWild=p.cards.filter(c=>wild(c,level)).length;
      const breaking=p.cards.filter(c=>(groups.get(c.r)>=4 && p.type!=='bomb') || (groups.get(c.r)>=2 && p.type==='single')).length;
      if (!target) s = -p.n*(2.7+personality*.3)+p.power*.23+tier(p)*3.2;
      else s = p.power*.5+tier(p)*7-p.n*.5;
      s+=spentWild*4+breaking*2;
      if (danger && target) s-=p.power*.7+tier(p)*5;
      if (friendly) s+=20;
      return s;
    }
    moves.sort((a,b)=>score(a)-score(b));
    const best=moves[0];
    if (target && tier(best)>0 && !danger && hand.length>best.n+3) return {move:null,reason:'保留炸弹，等待更合适的时机'};
    return {move:best,reason:danger?'对手余牌很少，优先夺回牌权':target?'选择合适的牌压制':'优先整理手牌，减少出牌轮数'};
  }
  class Game {
    constructor(random=Math.random) {this.random=random;this.levels=[2,2];this.level=2;this.round=0;this.previous=null;this.events=[];this.champion=null;}
    log(message, extra={}) {const e={message,round:this.round,...extra};this.events.push(e);return e;}
    startRound() {
      if (this.champion!==null) throw Error('比赛已经结束');
      this.round++; this.hands=[[],[],[],[]]; this.finished=[]; this.target=null;this.lastSeat=null;this.passed=[];this.returns=[];this.phase='play';this.result=null;
      const cards=shuffle(deck(),this.random); cards.forEach((c,i)=>this.hands[i%4].push(c));
      this.log(`第 ${this.round} 副，打 ${label(this.level)}`);
      if (!this.previous) {
        const flip=cards.find(c=>c.r<=14 && !wild(c,2));
        this.turn=this.hands.findIndex(h=>h.some(c=>c.id===flip.id));
        this.log(`翻牌 ${text(flip)}，持牌者 ${this.turn} 首出`);return;
      }
      const order=this.previous, first=order[0], double=order[1]%2===first%2;
      const donors=double?[0,1,2,3].filter(s=>s%2!==first%2):[order[3]];
      if (donors.reduce((n,s)=>n+this.hands[s].filter(c=>c.r===16).length,0)===2) {
        this.turn=first;this.log('抓到两张大王，抗贡；上游首出');return;
      }
      const gifts=donors.map(from=>({from,card:sort(this.hands[from].filter(c=>!wild(c,this.level)),this.level).at(-1)}));
      gifts.sort((a,b)=>strength(b.card.r,this.level)-strength(a.card.r,this.level));
      if (double && strength(gifts[0].card.r,this.level)===strength(gifts[1].card.r,this.level)) {
        // Equal tribute: each donor gives clockwise to the next winning seat.
        for (const g of gifts) g.to=(g.from+3)%4;
      } else gifts.forEach((g,i)=>g.to=i===0?first:(first+2)%4);
      this.turn=gifts.find(g=>g.to===first).from;
      for (const g of gifts) {
        this.hands[g.from]=this.hands[g.from].filter(c=>c.id!==g.card.id);this.hands[g.to].push(g.card);
        this.returns.push({from:g.to,to:g.from});this.log(`${g.from} 向 ${g.to} 进贡 ${text(g.card)}`,{kind:'tribute',seat:g.from,cards:[g.card]});
      }
      this.phase='return';
    }
    returnChoices(seat) {
      const h=this.hands[seat];
      const low=h.filter(c=>c.r<=10);
      if (low.length) return low;
      const min=Math.min(...h.map(c=>strength(c.r,this.level)));
      return h.filter(c=>strength(c.r,this.level)===min);
    }
    returnCard(seat,id) {
      const task=this.returns.find(t=>t.from===seat);
      const c=this.returnChoices(seat).find(c=>c.id===id);
      if (!task || !c) throw Error('请选择合法的还牌：点数不超过 10；没有时还最小牌');
      this.hands[seat]=this.hands[seat].filter(x=>x.id!==id);this.hands[task.to].push(c);
      this.returns=this.returns.filter(t=>t!==task);this.log(`${seat} 向 ${task.to} 还牌 ${text(c)}`,{kind:'return',seat,cards:[c]});
      if (!this.returns.length) this.phase='play';
    }
    observation(seat) {
      return {seat,hand:this.hands[seat].slice(),level:this.level,target:this.target,lastSeat:this.lastSeat,counts:this.hands.map(h=>h.length),finished:this.finished.slice(),history:this.events.slice(-100),round:this.round};
    }
    play(seat,ids,key=null) {
      if (this.phase!=='play' || this.turn!==seat) throw Error('还未轮到你');
      if (!ids.length) {
        if (!this.target) throw Error('领出时不能过牌');
        this.passed.push(seat);this.log(`${seat} 过牌`,{kind:'pass',seat});
      } else {
        const selected=ids.map(id=>this.hands[seat].find(c=>c.id===id));
        if (selected.some(c=>!c)) throw Error('所选牌不在手中');
        const choices=classify(selected,this.level,this.target), move=key?choices.find(p=>p.key===key):choices[0];
        if (!move) throw Error('牌型不合法，或无法压过当前牌');
        this.hands[seat]=this.hands[seat].filter(c=>!ids.includes(c.id));
        this.target=move;this.lastSeat=seat;this.passed=[];
        this.log(`${seat} 出 ${move.name} · ${label(move.main)}`,{kind:'play',seat,cards:move.cards,move});
        if (!this.hands[seat].length) {
          this.finished.push(seat);this.log(`${seat} 获得第 ${this.finished.length} 游`,{kind:'finish',seat});
          if (this.finished.length>=3 || this.finished.length===2 && this.finished[0]%2===this.finished[1]%2) {this.endRound();return;}
        }
      }
      const active=[0,1,2,3].filter(s=>this.hands[s].length>0 && s!==this.lastSeat);
      if (this.target && active.every(s=>this.passed.includes(s))) {
        let lead=this.lastSeat;
        if (!this.hands[lead].length) {
          const partner=(lead+2)%4;
          lead=this.hands[partner].length?partner:this.nextActive(lead);
          this.log(`${lead} 借风领出`,{kind:'wind',seat:lead});
        }
        this.target=null;this.lastSeat=null;this.passed=[];this.turn=lead;
      } else this.turn=this.nextActive(seat);
    }
    nextActive(seat) {for (let i=1;i<=4;i++) {const s=(seat+i)%4;if (this.hands[s].length) return s;}throw Error('没有活动玩家');}
    endRound() {
      const order=[...this.finished,...[0,1,2,3].filter(s=>!this.finished.includes(s))];
      const team=order[0]%2, partnerIndex=order.indexOf((order[0]+2)%4), gain=4-partnerIndex;
      const passedA=this.level===14 && this.levels[team]===14 && partnerIndex<3;
      this.levels[team]=Math.min(14,this.levels[team]+gain);this.level=this.levels[team];this.previous=order;
      this.result={order,team,gain,passedA};this.phase='over';
      if (passedA) this.champion=team;
      this.log(`${team===0?'我方':'对方'}获胜，升 ${gain} 级${passedA?'，成功过 A':''}`,{kind:'result'});
    }
  }
  return {deck,shuffle,sort,text,label,suits,wild,strength,tier,beats,patterns,match,options,classify,choose,Game};
});
