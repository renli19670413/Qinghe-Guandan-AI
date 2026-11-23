(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GameExit=factory();
})(globalThis,()=>({
  leave({view=window,doc=document,delay=setTimeout}={}){
    // The caller must successfully save and stop the agents before leaving.
    const app=doc.querySelector('.app');if(app){app.inert=true;app.hidden=true;}
    for(const dialog of doc.querySelectorAll('dialog[open]'))dialog.close();
    try{if(doc.fullscreenElement)Promise.resolve(doc.exitFullscreen()).catch(()=>{});}catch{}
    try{view.screen?.orientation?.unlock();}catch{}
    try{view.close();}catch{}
    // Normal browser tabs often cannot be closed by script. Replace this game
    // entry, rather than returning to its resume dialog or keeping agents alive.
    delay(()=>{if(!view.closed)view.location.replace('about:blank');},120);
  }
}));
