const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const E=require('./engine.js'),S=require('./agent-settings.js'),D=require('./scripts/distribution.js');
const destination=fs.mkdtempSync(path.join(os.tmpdir(),'qinghe-pages-test-'));D.buildPages(destination);
const bundle=fs.readFileSync(path.join(destination,'cherryin-pages.js'),'utf8');
function page(fetcher){
  const elements=new Map(['pages-key','pages-key-status','pages-use-key','agent-protocol'].map(id=>[id,{value:'',textContent:'',parentElement:{hidden:false}}]));
  const context={Guandan:E,AgentSettings:S,URL,Response,AbortSignal,TypeError,document:{getElementById:id=>elements.get(id)},location:{href:'https://renli19670413.github.io/Qinghe-Guandan-AI/',origin:'https://renli19670413.github.io'},window:{fetch:fetcher}};
  vm.runInNewContext(bundle,context);return {...context,elements,setKey(value){elements.get('pages-key').value=value;elements.get('pages-use-key').onclick();}};
}
function observation(seat=2){const g=new E.Game();g.startRound();const o=g.observation(seat);return {...o,hand:o.hand.map(c=>c.id),action:'play',history:[]};}
test('Pages has an in-memory key, no anonymous upstream request, and a compatible model catalog',async()=>{
  let calls=0;
  const p=page(async(url,init)=>{calls++;assert.equal(url,'https://open.cherryin.net/v1/models');assert.equal(init.headers['x-api-key'],'test-page-key');assert.equal(init.headers.Authorization,undefined);assert.equal(init.credentials,'omit');return Response.json({data:[{id:'google/gemini-2.5-flash'}]});});
  assert.equal((await (await p.window.fetch('/api/llm/status')).json()).configured,false);
  assert.equal((await p.window.fetch('/api/llm/models',{body:'{}'})).status,401);assert.equal(calls,0);
  p.setKey('test-page-key');assert.equal(p.elements.get('pages-key').value,'');
  const result=await (await p.window.fetch('/api/llm/models',{body:'{}'})).json();assert.equal(result.models[0].vendor,'google');
  p.setKey('');assert.equal((await (await p.window.fetch('/api/llm/status')).json()).configured,false);
});
test('all vendors and difficulties use browser-compatible Messages and validate legal moves',async()=>{
  const o=observation();
  for(const model of S.cherryModels)for(const difficulty of S.difficulties){
    const p=page(async(url,init)=>{
      assert.equal(url,'https://open.cherryin.net/v1/messages');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers['x-api-key'],'test-page-key');
      assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert(!init.body.includes('test-page-key'));
      const body=JSON.parse(init.body);assert.equal(body.model,model.id);assert.equal(body.max_tokens,difficulty.tokens);assert.match(body.system,/0与2同队/);
      const view=JSON.parse(body.messages[0].content);assert.equal(view.seat,2);assert.equal(view.partner,0);assert.equal(view.hands,undefined);
      return Response.json({content:[{type:'text',text:'{"choice":0,"reason":"优先出牌"}'}],stop_reason:'end_turn'});
    });p.setKey('test-page-key');
    const response=await p.window.fetch('/api/llm/decide',{body:JSON.stringify({observation:{...o,hands:['not-public']},settings:{model:model.id,difficulty:difficulty.id,protocol:'auto'}})});
    const answer=await response.json();assert.equal(response.status,200,answer.error);assert(answer.move.cards.every(c=>o.hand.includes(c.id)));assert.equal(answer.calls,1);
  }
});
test('Pages pauses on rejected/partial model output and upstream errors',async()=>{
  const o=observation(1);
  for(const response of [()=>Response.json({content:[{type:'text',text:'{"choice":999999,"reason":"invalid"}'}]}),()=>Response.json({content:[],stop_reason:'max_tokens'}),()=>Response.json({error:'rejected'},{status:401})]){
    const p=page(async()=>response());p.setKey('test-page-key');
    const r=await p.window.fetch('/api/llm/decide',{body:JSON.stringify({observation:o,settings:S.cherryDefaults})});
    assert.equal(r.status,400);assert((await r.json()).error);
  }
});
