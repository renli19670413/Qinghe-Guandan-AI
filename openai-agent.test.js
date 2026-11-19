'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const E=require('./engine.js'),A=require('./openai-agent.js'),S=require('./agent-settings.js');
const deck=E.deck();
const cards=(rank,n)=>deck.filter(c=>c.r===rank).slice(0,n);
function observe(game,seat,action='play'){
  const o=game.observation(seat);
  return {...o,action,hand:o.hand.map(c=>c.id),target:o.target?{key:o.target.key,cards:o.target.cards.map(c=>c.id)}:null,
    history:o.history.filter(e=>e.round===o.round&&['play','pass'].includes(e.kind)).map(e=>({kind:e.kind,seat:e.seat,cards:e.cards?.map(c=>c.id)}))};
}
const response=(choice,reason='留住控制牌')=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({choice,reason})}}]})});

test('model and difficulty independently control request, history and private context',async()=>{
  const g=new E.Game();g.startRound();const o=observe(g,2);
  o.history=Array.from({length:45},()=>({seat:1,kind:'pass'}));o.memory=['自己的上一手决策'];o.hands=['opponent-private'];
  for(const m of S.models)for(const d of S.difficulties){
    const prepared=A.prepare(o,{model:m.id,difficulty:d.id});
    const move=await A.decide(prepared,'mock-key',{fetcher:async(url,init)=>{
      const b=JSON.parse(init.body),v=JSON.parse(b.messages[1].content);
      assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(b.model,m.id);
      assert.equal(b.reasoning_effort,d.effort);assert.equal(b.max_completion_tokens,d.tokens);assert.equal(b.store,false);
      assert.equal(v.recent.length,d.history);assert.equal(v.partner,0);assert.equal(v.hands,undefined);assert.equal(v.unknownRanks!==undefined,d.id==='hard');
      assert.equal(v.ownPastDecisions!==undefined,d.memory>0);assert(!init.body.includes('mock-key'));assert(!init.body.includes('opponent-private'));
      assert.deepEqual(b.response_format.json_schema.schema.properties.choice.enum,prepared.choices);
      return response(prepared.choices[0]);
    }});assert.equal(move.model,m.id);assert(move.move.cards.every(c=>o.hand.includes(c.id)));
  }
  assert.throws(()=>A.prepare(o,{model:'invalid',difficulty:'normal'}),/模型和难度/);
});

test('partner protection applies, except when one play goes out; invalid model output stops the turn',async()=>{
  const target=E.classify(cards(5,4),2)[0];
  const hand=[...cards(11,4),...cards(3,1)].map(c=>c.id);
  const o={seat:2,round:1,level:2,counts:[6,1,5,2],action:'play',target:{key:target.key,cards:target.cards.map(c=>c.id)},lastSeat:0,hand};
  const protectedChoice=A.prepare(o,S.defaults);assert.deepEqual(protectedChoice.choices,[-1]);
  assert.equal((await A.decide(protectedChoice,'test',{fetcher:async()=>response(-1)})).move,null);
  await assert.rejects(A.decide(protectedChoice,'test',{fetcher:async()=>response(0)}),/无效出牌/);
  assert(A.prepare({...o,lastSeat:1},S.defaults).moves.some(m=>m.type==='bomb'));
  assert(A.prepare({...o,hand:hand.slice(0,4),counts:[6,1,4,2]},S.defaults).moves.some(m=>m.type==='bomb'));
  await assert.rejects(A.decide(protectedChoice,'test',{fetcher:async()=>({ok:false,status:401})}),/HTTP 401/);
});

test('three mock OpenAI agents can play a full round through browser transport, then return tribute legally',async()=>{
  const g=new E.Game();g.startRound();
  const calls=[];
  const context={Guandan:E,AbortController,setTimeout,clearTimeout,fetch:async(_url,init)=>{
    const w=JSON.parse(init.body),p=A.prepare(w.observation,w.settings);calls.push(w.observation);
    const move=await A.decide(p,'test',{fetcher:async()=>response(p.choices[0])});
    return {ok:true,json:async()=>move};
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('agents.js','utf8')+'\nglobalThis.Pool=LLMAgentPool;',context);
  const pool=new context.Pool(S.defaults);
  let turns=0;
  while(g.phase==='play'){
    assert(++turns<300,'round stalled');const s=g.turn,o=g.observation(s);
    const {move}=s===0?E.choose(o):await pool.decide(o);
    g.play(s,move?move.cards.map(c=>c.id):[],move?.key);
  }
  for(const seat of [1,2,3]){
    const ofSeat=calls.filter(c=>c.seat===seat);assert(ofSeat.length>1);assert.equal(ofSeat[0].memory.length,0);assert(ofSeat[1].memory.length>0);
  }
  g.previous=[1,0,3,2];
  for(let i=0;i<20;i++){g.startRound();if(g.phase==='return')break;}
  assert.equal(g.phase,'return');
  const seat=g.returns[0].from;assert.equal(seat,1);
  const {move}=await pool.decide({...g.observation(seat),action:'return'});assert.equal(calls.at(-1).memory.length,0);
  assert(g.returnChoices(seat).some(c=>c.id===move.cards[0].id));g.returnCard(seat,move.cards[0].id);
  pool.close();
});
