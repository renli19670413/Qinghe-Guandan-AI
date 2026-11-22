const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const D=require('./scripts/distribution.js');
test('GitHub source and Pages bundles include only public allowlisted files',()=>{
  for(const file of D.sourceFiles){
    assert(fs.statSync(file).isFile(),file);
    assert(!/(^|\/)(?:cherryin|openai)\.config\.json$|\.log$|\.env|\.git\//.test(file),file);
    assert(!/sk-[A-Za-z0-9_-]{20,}/.test(fs.readFileSync(file,'utf8')),`Potential credential in ${file}`);
  }
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'qinghe-distribution-'));
  const pages=path.join(tmp,'pages'),source=path.join(tmp,'source');D.buildPages(pages);D.copyFiles(D.sourceFiles,source);
  assert(fs.readFileSync(path.join(pages,'index.html'),'utf8').includes('name="guandan-mode" content="pages"'));
  assert.deepEqual(fs.readdirSync(pages).sort(),[...D.webFiles,'cherryin-pages.js','.nojekyll'].sort());
  assert(!fs.existsSync(path.join(source,'cherryin.config.json')));assert(!fs.existsSync(path.join(source,'server-start.log')));
  assert(fs.existsSync(path.join(source,'.github/workflows/test.yml')));
  assert.throws(()=>D.buildPages(pages),/非空/);
});
