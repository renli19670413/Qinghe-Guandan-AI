'use strict';
const S=require('./agent-settings.js'),core=require('./openai-agent.js');
const DEFAULT_BASE='https://open.cherryin.net/v1';
function baseURL(value=DEFAULT_BASE){
  let u;try{u=new URL(value);}catch{throw Error('CherryIN API 地址无效');}
  if(u.protocol!=='https:'||!['open.cherryin.net','open.cherryin.ai'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||u.pathname.replace(/\/$/,'')!=='/v1')throw Error('API 地址仅支持 CherryIN 官方 HTTPS 域名，路径为 /v1');
  return u.origin+'/v1';
}
function prepare(o,config){
  const info=S.modelInfo(config?.model,config?.protocol||'auto');
  return {...core.prepare(o,config,[info]),info};
}
function upstreamError(status){
  const detail={401:'请检查 CherryIN API Key',403:'请检查令牌分组及模型权限',404:'请核对完整模型 ID 和接口类型',429:'请检查 CherryIN 余额或稍后重试'}[status]||'请稍后重试，或尝试另一接口类型';
  return Error(`CherryIN 返回 HTTP ${status}：${detail}`);
}
async function listModels(key,{fetcher=fetch,base=DEFAULT_BASE}={}){
  const res=await fetcher(baseURL(base)+'/models',{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw upstreamError(res.status);
  const data=await res.json();if(!Array.isArray(data.data))throw Error('CherryIN 未返回标准模型列表，请从控制台手动填写模型 ID');
  const items=new Map();
  for(const entry of data.data.slice(0,2000))try{const info=S.modelInfo(entry.id);items.set(info.id,{id:info.id,label:info.label,vendor:info.vendor});}catch{}
  if(!items.size)throw Error('没有可识别的 厂家/模型 ID，请从控制台手动填写');
  return [...items.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
async function decide(p,key,{fetcher=fetch,signal,base=DEFAULT_BASE}={}){
  const {moves,choices,view,profile,info}=p;
  const system=`你是掼蛋选手，0与2同队，1与3同队。只读取自己的牌和公开信息，目标是本队头游并帮助搭档。搭档已压住时让牌，能直接出完时可接。四王>六张及以上炸弹>同花顺>五张炸弹>四张炸弹>普通牌。必须从 legalMoves 的 choice 选择。-1 仅 canPass 时可用。只输出 JSON 对象，格式 {"choice":0,"reason":"简短理由"}，不输出思考过程或 Markdown。\n${profile.strategy}`;
  const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(view)}];
  // Use portable payloads; do not impose OpenAI-only reasoning/schema parameters on other vendors.
  const body=info.protocol==='responses'?{model:info.id,input:messages,max_output_tokens:profile.tokens,store:false}:{model:info.id,messages,max_tokens:profile.tokens,stream:false};
  const res=await fetcher(baseURL(base)+(info.protocol==='responses'?'/responses':'/chat/completions'),{
    method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)
  });
  if(!res.ok)throw upstreamError(res.status);
  const data=await res.json();let content;
  if(info.protocol==='responses'){
    if(data.status==='incomplete'||data.error||data.status==='failed')throw Error('模型未完成响应，请降低难度、切换模型或重试');
    content=typeof data.output_text==='string'?data.output_text:(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
  }else{
    if(data.choices?.[0]?.finish_reason==='length')throw Error('模型输出达到上限，请降低难度后重试');
    content=data.choices?.[0]?.message?.content;
    if(Array.isArray(content))content=content.filter(x=>x.type==='text').map(x=>x.text).join('');
  }
  let result;try{result=JSON.parse(String(content||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw Error('模型未返回合法 JSON，牌局已暂停，可重试或换模型');}
  if(!result||!choices.includes(result.choice)||typeof result.reason!=='string')throw Error('模型选择了无效出牌，请重试');
  return {seat:view.seat,move:result.choice===-1?null:moves[result.choice],reason:result.reason.slice(0,120),model:info.id};
}
module.exports={prepare,decide,listModels,baseURL,DEFAULT_BASE};
