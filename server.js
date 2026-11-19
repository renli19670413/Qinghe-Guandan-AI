'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const {prepare,decide,listModels,baseURL,DEFAULT_BASE}=require('./cherryin-agent.js');
const settings=require('./agent-settings.js');
const pages=new Set(['index.html','style.css','mobile.css','web.css','engine.js','agents.js','hand-layout.js','hand-columns.js','game-session.js','agent-settings.js','web-ui.js','app.js']);
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
async function readConfig(){
  let saved={};
  try{saved=JSON.parse((await fs.readFile(path.join(__dirname,'cherryin.config.json'),'utf8')).replace(/^\uFEFF/,''));}
  catch(e){if(e.code!=='ENOENT')throw Error('cherryin.config.json 无法读取，请检查 JSON 格式');}
  if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('cherryin.config.json 必须是 JSON 对象');
  const apiKey=process.env.CHERRYIN_API_KEY||saved.apiKey||'';
  return {apiKey:typeof apiKey==='string'?apiKey.trim():'',baseURL:baseURL(saved.baseURL||DEFAULT_BASE),maxCalls:Number.isInteger(saved.maxCalls)&&saved.maxCalls>=1&&saved.maxCalls<=10000?saved.maxCalls:200};
}
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));}
async function readBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size<=128000)chunks.push(chunk);}
  if(size>128000)throw Error('请求过大');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('请求不是有效的 JSON');}
}
function createServer({getConfig=readConfig,fetcher=fetch}={}){
  let calls=0,active=false,modelRequest=false;
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src blob:; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const port=req.socket.localPort,host=req.headers.host;
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return json(res,403,{error:'仅允许本机访问'});
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,`http://${host}`).pathname);}catch{return json(res,400,{error:'无效地址'});}
    if(pathname==='/api/llm/status'&&req.method==='GET'){
      try{const c=await getConfig();return json(res,200,{configured:!!c.apiKey,calls,maxCalls:c.maxCalls,models:settings.cherryModels});}
      catch(e){return json(res,400,{error:e.message});}
    }
    if(pathname==='/api/llm/models'){
      if(req.method!=='POST'||req.headers.origin!==`http://${host}`||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,403,{error:'不允许此请求来源'});
      if(modelRequest)return json(res,429,{error:'模型列表正在刷新'});
      modelRequest=true;
      try{const c=await getConfig();if(!c.apiKey)return json(res,503,{error:'请先配置 CHERRYIN_API_KEY 或 cherryin.config.json'});return json(res,200,{models:await listModels(c.apiKey,{fetcher,base:c.baseURL})});}
      catch(e){return json(res,400,{error:e instanceof TypeError?'无法连接 CherryIN 模型列表，请手动填写模型 ID':e.message});}
      finally{modelRequest=false;}
    }
    if(pathname==='/api/llm/decide'){
      if(req.method!=='POST'||req.headers.origin!==`http://${host}`||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,403,{error:'不允许此请求来源'});
      if(active)return json(res,429,{error:'已有模型请求正在处理，请稍后重试'});
      active=true;
      const ab=new AbortController();res.on('close',()=>{if(!res.writableEnded)ab.abort();});
      try{
        const c=await getConfig();
        if(!c.apiKey)return json(res,503,{error:'请先在本机设置 CHERRYIN_API_KEY 或填写 cherryin.config.json'});
        if(calls>=c.maxCalls)return json(res,429,{error:'已达到本次服务的调用上限，请检查用量后再调整配置或重启'});
        const body=await readBody(req),prepared=prepare(body?.observation,body?.settings);
        if(ab.signal.aborted)return;
        calls++;
        const answer=await decide(prepared,c.apiKey,{fetcher,signal:ab.signal,base:c.baseURL});
        if(!res.destroyed)return json(res,200,{...answer,calls,maxCalls:c.maxCalls});
      }catch(e){
        if(!res.destroyed)return json(res,400,{error:e.name==='TimeoutError'?'模型响应超时，可降低难度或重试':e instanceof TypeError?'无法连接 CherryIN，请检查网络后重试':e.message});
      }finally{active=false;}
      return;
    }
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'不支持此请求方法'});
    const file=pathname==='/'?'index.html':pathname.slice(1);
    if(!pages.has(file))return json(res,404,{error:'页面不存在'});
    try{
      const data=await fs.readFile(path.join(__dirname,file));
      res.writeHead(200,{'Content-Type':`${mime[path.extname(file)]}; charset=utf-8`});res.end(req.method==='HEAD'?undefined:data);
    }catch{return json(res,404,{error:'页面不存在'});}
  });
}
if(require.main===module){
  const port=Number(process.env.GUANDAN_PORT||8765),server=createServer();
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，通常是旧版游戏服务还没关闭。\n请在旧的游戏服务窗口按 Ctrl+C，或关闭旧窗口，再重新运行 StartWeb.cmd。\n请保留原端口，以便读取同一浏览器中的存档。`:e.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`Qinghe Guandan: http://127.0.0.1:${server.address().port}/`));
}
module.exports={createServer};
