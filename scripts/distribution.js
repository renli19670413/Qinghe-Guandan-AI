'use strict';
// Explicit allowlists: never recursively copy the working directory containing credentials.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const webFiles=['index.html','style.css','mobile.css','web.css','phone.css','phone-layout.js','game-exit.js','manifest.webmanifest','icon-192.png','icon-512.png','engine.js','agents.js','hand-layout.js','hand-columns.js','game-session.js','agent-settings.js','web-ui.js','app.js'];
const sourceFiles=[...webFiles,'server.js','cherryin-agent.js','openai-agent.js','package.json','README.md','PUBLISHING.md','StartWeb.cmd','cherryin.config.example.json','openai.config.example.json',
  'cherryin-agent.test.js','openai-agent.test.js','server.test.js','layout-session.test.js','distribution.test.js','.gitignore','.gitattributes',
  'scripts/distribution.js','scripts/pages-client.js','scripts/package.ps1','pages-client.test.js','phone-layout.test.js','game-exit.test.js','.github/workflows/test.yml','.github/workflows/pages.yml','.github/workflows/release.yml'];
function copyFiles(files,dest){for(const file of files){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}}
function buildPages(destination=path.join(root,'dist/pages')){
  if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error('静态输出目录非空，请使用新的输出目录，防止混入旧文件');
  fs.mkdirSync(destination,{recursive:true});copyFiles(webFiles,destination);
  const file=path.join(destination,'index.html');let html=fs.readFileSync(file,'utf8');
  html=html.replace('<head>','<head>\n<meta name="guandan-mode" content="pages">');
  const panel='<section class="panel settings ai-settings"><h3>CherryIN 在线密钥</h3><p>输入自己的 CherryIN API Key。密钥只存于当前页面内存，直接通过 HTTPS 发送至 CherryIN，不写入 GitHub 或浏览器存档。刷新后需重新填写；调用消耗你的 CherryIN 额度。</p><label>API Key <input id="pages-key" type="password" autocomplete="off" maxlength="512" placeholder="粘贴 CherryIN API Key"></label><button id="pages-use-key">使用密钥／清除</button><p id="pages-key-status" role="status"></p></section>';
  html=html.replace('<aside>','<aside>'+panel).replace(/<script src="app\.js(?:\?[^\"]*)?">/,'<script src="cherryin-pages.js"></script>$&');
  let bundle="(()=>{const moduleCache={'./engine.js':Guandan,'./agent-settings.js':AgentSettings};const requireModule=name=>moduleCache[name];\n";
  for(const name of ['openai-agent.js','cherryin-agent.js'])bundle+=`{const module={exports:{}};((module,exports,require)=>{\n${fs.readFileSync(path.join(root,name),'utf8')}\n})(module,module.exports,requireModule);moduleCache[${JSON.stringify('./'+name)}]=module.exports;}\n`;
  bundle+=fs.readFileSync(path.join(root,'scripts/pages-client.js'),'utf8')+'\n})();\n';
  fs.writeFileSync(path.join(destination,'cherryin-pages.js'),bundle);
  const appFile=path.join(destination,'app.js');
  fs.writeFileSync(appFile,fs.readFileSync(appFile,'utf8').replaceAll('请先在本机设置 CHERRYIN_API_KEY 或填写 cherryin.config.json。','请在菜单顶部填写并使用本次页面的 CherryIN API Key。').replaceAll('正在检查本机 CherryIN 配置…','正在检查当前页面的 CherryIN 配置…').replaceAll('本次启动已调用','本次页面已调用'));
  fs.writeFileSync(file,html);fs.writeFileSync(path.join(destination,'.nojekyll'),'');
  return destination;
}
if(require.main===module){
  if(process.argv[2]==='source'){
    fs.mkdirSync(path.join(root,'dist'),{recursive:true});
    const dir=fs.mkdtempSync(path.join(root,'dist','source-'));
    copyFiles(sourceFiles,dir);console.log(dir);
  }else console.log(buildPages(process.argv[2]?path.resolve(process.argv[2]):undefined));
}
module.exports={webFiles,sourceFiles,copyFiles,buildPages};
