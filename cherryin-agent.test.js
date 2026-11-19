'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('./cherryin-agent.js'),E=require('./engine.js'),S=require('./agent-settings.js');
function observation(){const g=new E.Game();g.startRound();const o=g.observation(2);return {...o,hand:o.hand.map(c=>c.id),action:'play',history:[]};}
function result(protocol,content='{"choice":0,"reason":"保留控制牌"}'){
  return {ok:true,json:async()=>protocol==='responses'?{status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:content}]}]}:{choices:[{message:{content}}]}};
}
test('all vendor examples and difficulties choose correct CherryIN endpoint with portable parameters',async()=>{
  const o={...observation(),hands:['private-opponent-hand']};
  for(const model of S.cherryModels)for(const d of S.difficulties){
    const p=C.prepare(o,{model:model.id,difficulty:d.id,protocol:'auto'}),response=await C.decide(p,'cherry-mock-key',{fetcher:async(url,init)=>{
      const b=JSON.parse(init.body);assert(url.startsWith('https://open.cherryin.net/v1/'));assert.equal(b.model,model.id);assert.equal(init.headers.Authorization,'Bearer cherry-mock-key');
      assert.equal(b.reasoning_effort,undefined);assert.equal(b.response_format,undefined);assert.equal(b.max_completion_tokens,undefined);
      const messages=p.info.protocol==='responses'?b.input:b.messages,view=JSON.parse(messages[1].content);
      assert.equal(b.max_output_tokens||b.max_tokens,d.tokens);assert(!init.body.includes('cherry-mock-key'));assert(!init.body.includes('private-opponent-hand'));
      assert.equal(view.partner,0);assert.equal(view.unknownRanks!==undefined,d.id==='hard');
      assert(url.endsWith(p.info.protocol==='responses'?'/responses':'/chat/completions'));return result(p.info.protocol);
    }});assert(response.move.cards.every(c=>o.hand.includes(c.id)));
  }
});
test('manual vendor/model and protocol overrides; official base allowlist; no redirects',async()=>{
  const o=observation();assert.equal(C.prepare(o,{model:'moonshot/new-model',difficulty:'hard',protocol:'responses'}).info.protocol,'responses');
  assert.equal(C.prepare(o,{model:'openai/gpt-5.2-chat',difficulty:'easy',protocol:'chat'}).info.protocol,'chat');
  for(const model of ['invalid','https://host/x','openai/foo\nbar'])assert.throws(()=>C.prepare(o,{model,difficulty:'easy'}));
  for(const base of ['http://open.cherryin.net/v1','https://evil.example/v1','https://open.cherryin.net.evil/v1','https://key@open.cherryin.net/v1'])assert.throws(()=>C.baseURL(base));
  assert.equal(C.baseURL('https://open.cherryin.ai/v1/'),'https://open.cherryin.ai/v1');
});
test('model catalog is sanitized, deduplicated and classified by vendor',async()=>{
  const models=await C.listModels('test',{fetcher:async(url)=>{assert(url.endsWith('/v1/models'));return {ok:true,json:async()=>({data:[{id:'google/gemini-a'},{id:'google/gemini-a'},{id:'newvendor/text-a'},{id:'bad'}]})};}});
  assert.equal(models.length,2);assert.equal(models[1].vendor,'newvendor');
  await assert.rejects(C.listModels('test',{fetcher:async()=>({ok:false,status:401})}),/CherryIN.*401/);
});
test('unusable content and invalid decisions pause, not local fallback',async()=>{
  const p=C.prepare(observation(),S.cherryDefaults);
  for(const content of ['','not JSON','{"choice":999999,"reason":"x"}','{"choice":-1,"reason":"x"}'])await assert.rejects(C.decide(p,'test',{fetcher:async()=>result('chat',content)}));
  const good=await C.decide(p,'test',{fetcher:async()=>result('chat','```json\n{"choice":0,"reason":"测试"}\n```')});assert(good.move);
  await assert.rejects(C.decide(p,'test',{fetcher:async()=>({ok:false,status:403})}),/CherryIN.*403/);
});
test('three CherryIN agents complete a round and return tribute, each with its own context',async()=>{
  const fs=require('node:fs'),vm=require('node:vm'),calls=[];
  const context={Guandan:E,AbortController,setTimeout,clearTimeout,fetch:async(_url,init)=>{
    const body=JSON.parse(init.body),p=C.prepare(body.observation,body.settings);calls.push(body);
    const a=await C.decide(p,'test',{fetcher:async()=>result(p.info.protocol,JSON.stringify({choice:p.choices[0],reason:'测试'}))});
    return {ok:true,json:async()=>a};
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('agents.js','utf8')+'\nglobalThis.Pool=LLMAgentPool;',context);
  const pool=new context.Pool(S.cherryDefaults),g=new E.Game();g.startRound();let turns=0;
  while(g.phase==='play'){
    assert(++turns<400);const s=g.turn,o=g.observation(s),{move}=s===0?E.choose(o):await pool.decide(o);g.play(s,move?move.cards.map(c=>c.id):[],move?.key);
  }
  for(const s of [1,2,3]){const seatCalls=calls.filter(x=>x.observation.seat===s);assert(seatCalls.length>1);assert.equal(seatCalls[0].observation.memory.length,0);assert(seatCalls[1].observation.memory.length>0);}
  g.previous=[1,0,3,2];for(let i=0;i<30;i++){g.startRound();if(g.phase==='return')break;}
  assert.equal(g.phase,'return');const seat=g.returns[0].from;
  const {move}=await pool.decide({...g.observation(seat),action:'return'});assert(g.returnChoices(seat).some(c=>c.id===move.cards[0].id));g.returnCard(seat,move.cards[0].id);pool.close();
});
