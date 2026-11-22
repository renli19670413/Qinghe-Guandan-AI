'use strict';
// This template is bundled with the same rule validators as the local server.
// The API key lives only in this closure, never in snapshots or repository files.
const cherry=moduleCache['./cherryin-agent.js'];
const originalFetch=window.fetch.bind(window);
let pageKey='',calls=0,pending=false;
const maximum=200;
const jsonResponse=(data,status=200)=>Response.json(data,{status});
async function directFetch(url,init={}){
  const target=new URL(url);
  if(target.origin!=='https://open.cherryin.net'||!['/v1/models','/v1/chat/completions','/v1/responses'].includes(target.pathname))throw Error('模型请求地址无效');
  // Authorization requires explicit CORS permission. CherryIN's standard
  // Anthropic endpoint accepts x-api-key, which its wildcard CORS permits.
  const headers={'x-api-key':pageKey};
  let body=init.body;
  if(target.pathname!=='/v1/models'){
    const payload=JSON.parse(body),messages=payload.messages||payload.input;
    headers['content-type']='application/json';headers['anthropic-version']='2023-06-01';
    body=JSON.stringify({model:payload.model,max_tokens:payload.max_tokens||payload.max_output_tokens,
      system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),
      messages:messages.filter(m=>m.role!=='system'),stream:false});
  }
  const response=await originalFetch(target.pathname==='/v1/models'?target.href:'https://open.cherryin.net/v1/messages',{
    method:init.method||'GET',headers,body,signal:init.signal,credentials:'omit',mode:'cors',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'
  });
  if(!response.ok||target.pathname==='/v1/models')return response;
  const data=await response.json();
  const text=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('');
  if(target.pathname==='/v1/responses')return jsonResponse({status:data.stop_reason==='max_tokens'?'incomplete':'completed',output_text:text});
  return jsonResponse({choices:[{finish_reason:data.stop_reason==='max_tokens'?'length':'stop',message:{content:text}}]});
}
window.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/llm/'))return originalFetch(input,init);
  if(url.pathname==='/api/llm/status')return jsonResponse({configured:!!pageKey,calls,maxCalls:maximum,models:AgentSettings.cherryModels});
  if(!pageKey)return jsonResponse({error:'请在菜单顶部填写并使用本次页面的 CherryIN 密钥'},401);
  if(pending)return jsonResponse({error:'已有模型请求正在处理，请稍后再试'},429);
  if(!['/api/llm/models','/api/llm/decide'].includes(url.pathname))return jsonResponse({error:'不存在的接口'},404);
  pending=true;
  try{
    if(url.pathname==='/api/llm/models')return jsonResponse({models:await cherry.listModels(pageKey,{fetcher:directFetch})});
    if(calls>=maximum)return jsonResponse({error:'本页面已达到 200 次模型请求限制，请检查额度后刷新'},429);
    const body=JSON.parse(init.body),prepared=cherry.prepare(body.observation,body.settings);
    calls++;
    return jsonResponse({...await cherry.decide(prepared,pageKey,{fetcher:directFetch,signal:init.signal}),calls,maxCalls:maximum});
  }catch(error){
    return jsonResponse({error:error instanceof TypeError?'无法连接 CherryIN，请检查手机网络或浏览器跨域限制':error.message},400);
  }finally{pending=false;}
};
const keyInput=document.getElementById('pages-key'),keyStatus=document.getElementById('pages-key-status');
document.getElementById('pages-use-key').onclick=()=>{
  if(pending){keyStatus.textContent='请等当前模型请求结束后再修改密钥';return;}
  const value=keyInput.value.trim();
  if(value.length>512||/[\u0000-\u0020]/.test(value)){keyStatus.textContent='密钥格式不正确，请重新粘贴';return;}
  pageKey=value;keyInput.value='';
  keyStatus.textContent=value?'密钥已用于本次页面。请选择 CherryIN 大模型、厂家、模型和难度，再应用设置。':'本次页面密钥已清除。';
};
// Pages uses the compatible Messages transport for every vendor. The local
// server and the separately hosted Site retain their original protocol controls.
document.getElementById('agent-protocol').parentElement.hidden=true;
