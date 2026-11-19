/* Three isolated workers. Each receives its own hand and public observations only. */
function agentRuntime(engineFactory) {
  const E=engineFactory();
  let seat=null, personality=0, decisions=0;
  const memory={round:0,seen:[]};
  self.onmessage=({data})=>{
    if (data.type==='init') {seat=data.seat;personality=data.personality;return;}
    if (data.type==='decide') {
      try {
        const o=data.observation;
        if (o.seat!==seat) throw Error('Agent seat mismatch');
        if (memory.round!==o.round) {memory.round=o.round;memory.seen=[];decisions=0;}
        memory.seen=o.history.filter(e=>e.kind==='play').flatMap(e=>e.cards.map(c=>c.id));
        const answer=E.choose(o,personality);decisions++;
        self.postMessage({request:data.request,seat,...answer,decisions,seen:memory.seen.length});
      } catch(error) {self.postMessage({request:data.request,seat,error:error.message});}
    }
  };
}
class LLMAgentPool {
  constructor(settings){
    this.settings={...settings};
    this.contexts=new Map();this.controllers=new Set();
  }
  async decide(observation){
    let context=this.contexts.get(observation.seat);
    if(!context || context.round!==observation.round){context={round:observation.round,decisions:[]};this.contexts.set(observation.seat,context);}
    const controller=new AbortController();this.controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),65000);
    try {
      const {seat,round,level,counts,finished,lastSeat,target,history,hand,action='play'}=observation;
      const wire={seat,round,level,counts,finished,lastSeat,action,hand:hand.map(c=>c.id),target:target?{key:target.key,cards:target.cards.map(c=>c.id)}:null,
        history:history.filter(e=>e.round===round&&['play','pass'].includes(e.kind)).map(e=>({seat:e.seat,kind:e.kind,cards:e.cards?.map(c=>c.id)||[]})),memory:context.decisions};
      const response=await fetch('/api/llm/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({observation:wire,settings:this.settings}),signal:controller.signal});
      const answer=await response.json();if(!response.ok) throw Error(answer.error||'模型调用失败');
      if(answer.seat!==seat)throw Error('模型响应座位不符，请重试');
      context.decisions.push(`${answer.move?`${answer.move.name} ${answer.move.cards.map(Guandan.text).join(' ')}`:'过牌'}：${answer.reason}`);context.decisions=context.decisions.slice(-6);
      return answer;
    }catch(error){if(error.name==='AbortError') throw Error('模型请求取消或超时，请重试');throw error;}
    finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  configure(settings){this.settings={...settings};}
  exportState(){return [...this.contexts].map(([seat,value])=>[seat,JSON.parse(JSON.stringify(value))]);}
  importState(saved){this.contexts=new Map((Array.isArray(saved)?saved:[]).filter(([seat,c])=>[1,2,3].includes(seat)&&Number.isInteger(c?.round)&&Array.isArray(c.decisions)).map(([seat,c])=>[seat,{round:c.round,decisions:c.decisions.filter(d=>typeof d==='string').slice(-6)}]));}
  close(){for(const c of this.controllers)c.abort();this.controllers.clear();this.contexts.clear();}
}
class AgentPool {
  constructor() {
    this.sequence=0;this.pending=new Map();this.workers=[];
    const source=`(${agentRuntime.toString()})(${Guandan.factory.toString()});`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try {
      for (let seat=1;seat<=3;seat++) {
        const worker=new Worker(url,{name:`guandan-agent-${seat}`});
        worker.onmessage=({data})=>{
          const task=this.pending.get(data.request);if (!task) return;
          clearTimeout(task.timer);this.pending.delete(data.request);
          if (data.error) task.reject(Error(data.error));else task.resolve(data);
        };
        worker.onerror=()=>{
          for (const [id,task] of this.pending) if (task.seat===seat) {
            clearTimeout(task.timer);task.reject(Error(`Agent ${seat} 运行失败`));this.pending.delete(id);
          }
        };
        worker.postMessage({type:'init',seat,personality:seat-1});this.workers[seat]=worker;
      }
    } finally {URL.revokeObjectURL(url);}
  }
  decide(observation) {
    const request=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(request);reject(Error('AI 决策超时，请重试'));},8000);
      this.pending.set(request,{resolve,reject,timer,seat:observation.seat});
      this.workers[observation.seat].postMessage({type:'decide',request,observation});
    });
  }
  close() {
    for (const w of this.workers) if (w) w.terminate();
    for (const task of this.pending.values()) {clearTimeout(task.timer);task.reject(Error('牌局已重置'));}
    this.pending.clear();
  }
}
