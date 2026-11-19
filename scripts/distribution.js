'use strict';
// Explicit allowlists: never recursively copy the working directory containing credentials.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const webFiles=['index.html','style.css','mobile.css','web.css','engine.js','agents.js','hand-layout.js','hand-columns.js','game-session.js','agent-settings.js','web-ui.js','app.js'];
const sourceFiles=[...webFiles,'server.js','cherryin-agent.js','openai-agent.js','package.json','README.md','PUBLISHING.md','StartWeb.cmd','cherryin.config.example.json','openai.config.example.json',
  'cherryin-agent.test.js','openai-agent.test.js','server.test.js','layout-session.test.js','distribution.test.js','.gitignore','.gitattributes',
  'scripts/distribution.js','scripts/package.ps1','.github/workflows/test.yml','.github/workflows/pages.yml','.github/workflows/release.yml'];
function copyFiles(files,dest){for(const file of files){const target=path.join(dest,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);}}
function buildPages(destination=path.join(root,'dist/pages')){
  if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error('静态输出目录非空，请使用新的输出目录，防止混入旧文件');
  fs.mkdirSync(destination,{recursive:true});copyFiles(webFiles,destination);
  const file=path.join(destination,'index.html');let html=fs.readFileSync(file,'utf8');
  html=html.replace('<head>','<head>\n<meta name="guandan-mode" content="static">');
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
