const {test}=require('node:test'),assert=require('node:assert/strict'),Exit=require('./game-exit.js');
test('saved game leaves the table and uses a blank page when browser refuses to close',()=>{
 const app={},events=[],doc={querySelector:()=>app,querySelectorAll:()=>[{close:()=>events.push('dialog-closed')}],fullscreenElement:true,exitFullscreen:async()=>events.push('fullscreen-left')};
 const view={closed:false,close:()=>events.push('close-requested'),screen:{orientation:{unlock:()=>{}}},location:{replace:url=>events.push(url)}};
 Exit.leave({view,doc,delay:fn=>fn()});assert(app.hidden&&app.inert);assert(events.includes('close-requested'));assert.equal(events.at(-1),'about:blank');
});
test('closable installed window closes without a fallback navigation',()=>{
 const view={closed:false,close(){this.closed=true;},location:{replace(){throw Error('already closed');}}};
 Exit.leave({view,doc:{querySelector:()=>({}),querySelectorAll:()=>[]},delay:fn=>fn()});assert(view.closed);
});
