'use strict';
const E=require('./engine.js'),settings=require('./agent-settings.js');
const SYSTEM='你是掼蛋选手。座位0与2、1与3分别同队，逆时针按0→1→2→3行动。目标是本队取得头游并帮助搭档取得好游数。只知道自己的手牌和公开信息。搭档压住牌时让牌，能直接出完自己手牌时可以接。四王>六张及以上炸弹>同花顺>五张炸弹>四张炸弹>普通牌。还牌阶段优先还不破坏自身组合的牌。必须从 legalMoves 选择 choice；-1 过牌仅在 canPass 时可选。只给简短的出牌理由。';
const byId=new Map(E.deck().map(c=>[c.id,c]));
const validSeat=s=>Number.isInteger(s)&&s>=0&&s<=3;
const asCards=ids=>{
  if(!Array.isArray(ids)||ids.length>28||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))throw Error('牌局提供了无效牌张');
  return ids.map(id=>byId.get(id));
};
const cardNames=cards=>cards.map(E.text);
function describe(move){
  return {type:move.name,rank:E.label(move.main),cards:cardNames(move.cards),wild:move.assignments?.flatMap((a,i)=>a.r!==move.cards[i].r||a.s!==null&&a.s!==move.cards[i].s?[`${E.text(move.cards[i])}→${a.s===null?'':E.suits[a.s]}${E.label(a.r)}`]:[])||[]};
}
function prepare(o,config,models=settings.models){
  const profile=settings.difficulties.find(d=>d.id===config?.difficulty);
  if(!profile||!models.some(m=>m.id===config.model))throw Error('请选择支持的模型和难度');
  if(!o||![1,2,3].includes(o.seat)||!Number.isInteger(o.level)||o.level<2||o.level>14||!Number.isInteger(o.round)||o.round<1||!Array.isArray(o.counts)||o.counts.length!==4||o.counts.some(n=>!Number.isInteger(n)||n<0||n>28)||!['play','return'].includes(o.action))throw Error('无效的牌局观察');
  const hand=asCards(o.hand),partner=(o.seat+2)%4,returning=o.action==='return';
  if(!hand.length||hand.length!==o.counts[o.seat])throw Error('手牌张数不符');
  const target=o.target&&!returning?E.classify(asCards(o.target.cards),o.level).find(m=>m.key===o.target.key):null;
  if(!returning&&o.target&&(!target||!validSeat(o.lastSeat)||o.lastSeat===o.seat))throw Error('当前要压的牌无效');
  let moves;
  if(returning){
    const low=hand.filter(c=>c.r<=10),min=Math.min(...hand.map(c=>E.strength(c.r,o.level)));
    moves=(low.length?low:hand.filter(c=>E.strength(c.r,o.level)===min)).map(c=>({name:'还牌',main:c.r,cards:[c]}));
  }else{
    moves=E.options(hand,o.level,target);
    if(target&&o.lastSeat===partner)moves=moves.filter(m=>m.n===hand.length);
  }
  const history=Array.isArray(o.history)?o.history.slice(-300).filter(e=>e&&validSeat(e.seat)&&['play','pass'].includes(e.kind)).map(e=>({seat:e.seat,kind:e.kind,cards:e.kind==='play'?asCards(e.cards):[]})):[];
  const view={seat:o.seat,partner,action:o.action,round:o.round,level:E.label(o.level),hand:cardNames(hand),wild:`♥${E.label(o.level)}`,counts:o.counts,
    finished:Array.isArray(o.finished)?o.finished.filter(validSeat).slice(0,4):[],lastSeat:target?o.lastSeat:null,target:target?describe(target):null,canPass:!!target,
    recent:history.slice(-profile.history).map(e=>({...e,cards:cardNames(e.cards)})),
    legalMoves:moves.map((m,choice)=>({choice,...describe(m)}))};
  if(profile.memory&&Array.isArray(o.memory))view.ownPastDecisions=o.memory.slice(-profile.memory).map(x=>String(x).slice(0,120));
  if(profile.id==='hard'){
    const seen=new Set([...hand,...history.flatMap(e=>e.cards),...(target?.cards||[])].map(c=>c.id));
    view.unknownRanks={};for(const c of byId.values())if(!seen.has(c.id)){const r=E.label(c.r);view.unknownRanks[r]=(view.unknownRanks[r]||0)+1;}
  }
  const choices=moves.map((_,i)=>i);if(target)choices.push(-1);
  if(!choices.length)throw Error('没有合法出牌');
  return {moves,choices,view,profile,model:config.model};
}
async function decide(prepared,apiKey,{fetcher=fetch,signal}={}){
  const {moves,choices,view,profile,model}=prepared;
  const res=await fetcher('https://api.openai.com/v1/chat/completions',{
    method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),
    body:JSON.stringify({model,store:false,reasoning_effort:profile.effort,max_completion_tokens:profile.tokens,
      messages:[{role:'system',content:`${SYSTEM}\n${profile.strategy}`},{role:'user',content:JSON.stringify(view)}],
      response_format:{type:'json_schema',json_schema:{name:'guandan_decision',strict:true,schema:{type:'object',properties:{choice:{type:'integer',enum:choices},reason:{type:'string'}},required:['choice','reason'],additionalProperties:false}}}})
  });
  if(!res.ok){
    const detail={401:'请检查 API 密钥',403:'请检查项目的模型权限',404:'所选模型不可用，请切换模型',429:'请检查额度或稍后重试'}[res.status]||'请稍后重试';
    throw Error(`OpenAI 返回 HTTP ${res.status}：${detail}`);
  }
  const data=await res.json(),output=data.choices?.[0];
  if(output?.finish_reason==='length')throw Error('模型输出达到上限，可降低难度后重试');
  let result;try{result=JSON.parse(output?.message?.content);}catch{throw Error('模型未返回可用决策，请重试');}
  if(!result||!choices.includes(result.choice)||typeof result.reason!=='string')throw Error('模型选择了无效出牌，请重试');
  return {seat:view.seat,move:result.choice===-1?null:moves[result.choice],reason:result.reason.slice(0,120),model};
}
module.exports={prepare,decide};
