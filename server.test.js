'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('./server.js'),E=require('./engine.js'),S=require('./agent-settings.js');

test('local HTTP serves the web UI, protects config and limits simulated API calls',async t=>{
  let upstream=0,metadata=0;
  const server=createServer({getConfig:async()=>({apiKey:'mock-key',maxCalls:1}),fetcher:async(url)=>{
    if(url.endsWith('/models')){metadata++;return {ok:true,json:async()=>({data:[{id:'anthropic/test-model'},{id:'google/test-model'}]})};}
    upstream++;return {ok:true,json:async()=>({choices:[{message:{content:'{"choice":0,"reason":"test"}'}}]})};
  }});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const index=await fetch(origin);assert.equal(index.status,200);const html=await index.text();
  for(const id of ['agent-vendor','agent-model','custom-model','agent-protocol','agent-difficulty','apply-ai','play'])assert(html.includes(`id="${id}"`));
  for(const f of ['/cherryin.config.json','/cherryin.config.example.json','/openai.config.json','/server.js','/openai-agent.js','/cherryin-agent.js'])assert.equal((await fetch(origin+f)).status,404);
  const status=await(await fetch(origin+'/api/llm/status')).text();assert(!status.includes('mock-key'));assert.equal(JSON.parse(status).configured,true);
  assert.equal((await fetch(origin+'/api/llm/models')).status,403);
  const catalog=await fetch(origin+'/api/llm/models',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(catalog.status,200);assert.equal((await catalog.json()).models.length,2);assert.equal(metadata,1);assert.equal(upstream,0);
  const g=new E.Game();g.startRound();const o=g.observation(1);
  const body=JSON.stringify({observation:{...o,hand:o.hand.map(c=>c.id),history:[],action:'play'},settings:S.cherryDefaults});
  const call=(site=origin,data=body)=>fetch(origin+'/api/llm/decide',{method:'POST',headers:{'Content-Type':'application/json',Origin:site},body:data});
  assert.equal((await call('https://other.example')).status,403);
  assert.equal((await call(origin,'{}')).status,400);assert.equal(upstream,0);
  const r=await call();assert.equal(r.status,200);assert.equal((await r.json()).calls,1);assert.equal(upstream,1);
  assert.equal((await call()).status,429);
});
