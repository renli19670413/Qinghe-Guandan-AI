'use strict';
const E=Guandan, $=id=>document.getElementById(id);
const staticDemo=!!document.querySelector('meta[name="guandan-mode"][content="static"]');
const names=['你','赤松','青竹','墨川'];
let game, agents, selected=new Set(), busy=false, generation=0, hintIndex=0, lastSignature='';
let handLayout={round:0,ids:[]}, dragging=[], suppressClickUntil=0;
let suspended=false,needsRedeal=false,exitKind='pause',pendingContexts=[];
const storageKey='qinghe-guandan-v1';
let aiMode='local', aiSettings={...AgentSettings.cherryDefaults}, checkingSettings=false;
let availableModels=AgentSettings.cherryModels.slice();
const settingsKey='qinghe-cherryin-settings';
try{
  const saved=JSON.parse(localStorage.getItem(settingsKey));
  if(saved?.model){AgentSettings.modelInfo(saved.model,saved.protocol||'auto');aiSettings.model=saved.model;aiSettings.protocol=saved.protocol||'auto';}
  if(AgentSettings.difficulties.some(x=>x.id===saved?.difficulty))aiSettings.difficulty=saved.difficulty;
}catch{}
function safeSave() {
  if(suspended)return true;
  return saveSession('pause');
}
function saveSession(kind){
  try{
    const contexts=agents?.exportState?agents.exportState():pendingContexts;
    const ui={handLayout,selected:[...selected],aiMode,aiSettings,contexts,speed:$('speed').value,auto:$('auto').checked};
    localStorage.setItem(storageKey,JSON.stringify(GameSession.snapshot(game,ui,kind)));return true;
  }catch{showError('保存失败，请检查浏览器存储空间；当前牌局尚未退出。');return false;}
}
function load() {
  try {
    const data=JSON.parse(localStorage.getItem(storageKey));
    if(data?.version===1&&data.state){
      const restored=GameSession.restore(data),ui=restored.ui;
      game=restored.game;needsRedeal=restored.redeal;exitKind=data.kind;
      handLayout=ui.handLayout||{round:0,ids:[],groups:[]};selected=new Set(ui.selected||[]);
      if(ui.aiMode==='llm'&&!staticDemo){AgentSettings.modelInfo(ui.aiSettings?.model,ui.aiSettings?.protocol||'auto');aiSettings=ui.aiSettings;aiMode='llm';}
      pendingContexts=ui.contexts||[];$('auto').checked=!!ui.auto;
      if(['500','1000','3000'].includes(ui.speed))$('speed').value=ui.speed;
      suspended=true;return true;
    }
    if (data && ['play','return','over'].includes(data.phase) && data.hands?.length===4 && data.hands.every(h=>Array.isArray(h)) && data.level>=2 && data.level<=14) {
      const {handLayout:savedLayout,...state}=data;
      game=Object.assign(new E.Game(),state);
      handLayout=savedLayout && Array.isArray(savedLayout.ids)?savedLayout:{round:0,ids:[]};return true;
    }
  } catch {}
  return false;
}
function start(fresh=false) {
  generation++;busy=false;selected.clear();
  if (agents) agents.close();
  suspended=false;needsRedeal=false;pendingContexts=[];
  if (fresh || !load()) {game=new E.Game();game.startRound();handLayout={round:0,ids:[],groups:[]};$('auto').checked=false;}
  if(suspended){agents=null;showResume();return;}
  try {agents=aiMode==='llm'?new LLMAgentPool(aiSettings):new AgentPool();updateModeLabel();}
  catch(error) {agents=null;$('agent-health').textContent='AI 启动失败';showError(error.message);}
  agents?.importState?.(pendingContexts);
  hintIndex=0;
  if(suspended){showResume();return;}
  render();pump();
}
function showError(message) {$('error').textContent=message;}
function updateModeLabel(){
  const llm=aiMode==='llm',difficulty=AgentSettings.difficulties.find(x=>x.id===aiSettings.difficulty).label;
  $('agent-health').textContent=llm?'CherryIN 三家独立决策 · 等待出牌':'3 位本地规则 Agent 已就绪';
  $('mode-label').textContent=llm?`${aiSettings.model} · ${difficulty}`:'离线单机';
  $('agent-description').textContent=llm?'三家通过 CherryIN 调用所选厂家的模型，各自只读取自己的手牌和公开信息。调用失败时暂停，可重试或手动切回本地规则。':'三位本地规则型 Agent 在独立线程中决策。搭档压住牌时默认让牌，能一次出完手牌时可接牌。';
}
function agentObservation(seat){
  const o=game.observation(seat);
  if(aiMode==='llm')o.history=game.events.filter(e=>e.round===game.round).slice(-300);
  return o;
}
function humanTurn() {return !suspended && game.phase==='play' && game.turn===0 && !busy && !$('auto').checked;}
function humanReturn() {return !suspended && game.phase==='return' && game.returns.some(t=>t.from===0) && !busy && !$('auto').checked;}
function selectionCards() {return game.hands[0].filter(c=>selected.has(c.id));}
function orderedHand() {
  const cards=HandColumns.sort(game.hands[0],game.level);
  if(handLayout.round!==game.round) handLayout={round:game.round,ids:cards.map(c=>c.id),groups:[]};
  handLayout.ids=HandLayout.reconcile(handLayout.ids,cards);
  handLayout.groups=HandColumns.reconcile(handLayout.groups,cards);
  const byId=new Map(cards.map(c=>[c.id,c]));
  return handLayout.ids.map(id=>byId.get(id));
}
function arrange(ids) {
  handLayout.ids=HandLayout.reconcile(ids,game.hands[0]);
  render();
}
function autoArrange(mode) {
  let cards=HandColumns.sort(game.hands[0],game.level);
  if(mode==='suit') cards.sort((a,b)=>a.s-b.s || a.r-b.r);
  handLayout={round:game.round,ids:cards.map(c=>c.id),groups:[]};render();
}
function mini(cards,move=null) {
  return cards.map(c=>{
    const a=move?.assignments?.find(a=>a.id===c.id), substituted=a && E.wild(c,game.level) && (a.r!==c.r || a.s!==null && a.s!==c.s);
    return `<span class="mini-card ${c.s===1 || c.s===3 || c.r===16?'red':''}">${c.r>14?E.label(c.r):E.label(c.r)+'<span>'+E.suits[c.s]+'</span>'}${substituted?`<small>配 ${a.s===null?'':E.suits[a.s]}${E.label(a.r)}</small>`:''}</span>`;
  }).join('');
}
function moveDescription(p) {
  const mapping=p.cards.filter(c=>E.wild(c,game.level)).map(c=>{
    const a=p.assignments.find(a=>a.id===c.id);return `${E.text(c)}→${a.s===null?'':E.suits[a.s]}${E.label(a.r)}`;
  });
  return `${p.name}${p.type==='bomb'?' '+p.n+' 张':''} · ${E.label(p.main)}${mapping.length?' ('+mapping.join('，')+')':''}`;
}
function refreshSelection() {
  for(const id of ['gather','move-left','move-right']) $(id).disabled=!selected.size || game.phase==='over';
  document.querySelectorAll('#hand .card').forEach(el=>{const active=selected.has(el.dataset.id);el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active));});
  const container=$('selection-info');container.replaceChildren();
  const cards=selectionCards(), isReturn=humanReturn();
  if (isReturn) {
    container.textContent='请选择一张标有绿边的牌还给进贡者';
    $('play').disabled=cards.length!==1 || !game.returnChoices(0).some(c=>c.id===cards[0].id);
    return;
  }
  const choices=E.classify(cards,game.level,game.target);
  if (!cards.length) container.textContent=humanTurn()?(game.target?'轮到你跟牌：选牌、提示，或不要':'轮到你领出：选择任意合法牌型'):'点击手牌可提前选牌';
  else if (!choices.length) {
    const valid=E.classify(cards,game.level);
    container.textContent=valid.length && game.target
      ? `${moveDescription(valid.at(-1))} 压不过 ${names[game.lastSeat]} 的${moveDescription(game.target)}`
      : `已选 ${cards.length} 张 · 不构成合法牌型`;
  }
  else if (choices.length===1) container.textContent=moveDescription(choices[0]);
  else {
    container.append(document.createTextNode(`已选 ${cards.length} 张 · 选择配牌解释`));
    const select=document.createElement('select');select.id='move-choice';select.className='choice-select';select.setAttribute('aria-label','配牌解释');
    for (const choice of choices) {const option=document.createElement('option');option.value=choice.key;option.textContent=moveDescription(choice);select.append(option);}
    container.append(select);
  }
  $('play').disabled=!humanTurn() || !choices.length;
}
function render() {
  if(suspended)return;
  $('apply-ai').disabled=busy||checkingSettings;
  $('our-level').textContent=E.label(game.levels[0]);$('their-level').textContent=E.label(game.levels[1]);
  $('round').textContent=`第 ${game.round} 副`;$('level').textContent=`本副打 ${E.label(game.level)}`;
  $('wild-info').textContent=`♥${E.label(game.level)} 为百搭牌`;$('hand-count').textContent=game.hands[0].length;
  // Older saves lack round tags, so retain the round-start marker as a fallback.
  const roundStart=game.events.findLastIndex(e=>e.message.startsWith(`第 ${game.round} 副，`));
  const roundEvents=game.events.slice(Math.max(0,roundStart)).filter(e=>e.round===undefined || e.round===game.round);
  for (let seat=0;seat<4;seat++) {
    const el=$(`seat-${seat}`), finish=game.finished.indexOf(seat), active=game.phase==='play' && game.turn===seat || game.phase==='return' && game.returns.some(t=>t.from===seat);
    el.classList.toggle('active',active);
    el.querySelector('.seat-status').textContent=finish>=0?['头游','二游','三游','末游'][finish]:`余 ${game.hands[seat].length} 张${active?' · '+(busy?'思考中':'待出牌'):''}`;
    const actions=roundEvents.filter(e=>e.seat===seat && ['play','pass'].includes(e.kind));
    const recent=actions.at(-1), played=actions.findLast(e=>e.kind==='play');
    const area=el.querySelector('.seat-play');
    const isTarget=!!game.target && game.lastSeat===seat;
    area.classList.toggle('current-target',isTarget);
    area.setAttribute('aria-label',`${names[seat]}最近出的牌`);
    area.innerHTML=(played?`<div class="seat-cards">${mini(played.cards,played.move)}</div><div class="seat-play-label">${played.move.name} · ${E.label(played.move.main)}</div>`:'<div class="seat-empty">尚未出牌</div>')+
      (isTarget?'<span class="pass-badge">当前要压的牌</span>':recent?.kind==='pass'?'<span class="pass-badge">不要</span>':'');
    area.title=played?`${names[seat]}：${played.cards.map(E.text).join(' ')}${recent?.kind==='pass'?'（本次不要）':''}`:'';
    const backs=el.querySelector('.backs');if (backs) backs.hidden=game.hands[seat].length===0;
  }
  $('target-cards').innerHTML=game.target?mini(game.target.cards,game.target):'';
  $('target-label').textContent=game.target?`当前要压：${names[game.lastSeat]} · ${moveDescription(game.target)}`:'从 2 打起 · 过 A 获胜';
  $('turn-message').textContent=game.phase==='return'?'贡牌已完成 · 等待还牌':game.phase==='over'?'本副已结束':`${names[game.turn]}${busy?'正在思考…':game.turn===0?'，轮到你了':'准备出牌'}`;
  const cards=orderedHand();
  const returnIds=humanReturn()?new Set(game.returnChoices(0).map(c=>c.id)):new Set();
  const cardHTML=c=>`<button class="card ${c.s===1||c.s===3||c.r===16?'red':''} ${c.r>14?'joker':''} ${E.wild(c,game.level)?'wild':''} ${returnIds.has(c.id)?'returnable':''}" draggable="false" data-id="${c.id}" aria-label="${E.text(c)}，第 ${Number(c.id[0])+1} 副${E.wild(c,game.level)?'，百搭牌':''}" aria-pressed="false"><span class="card-corner">${E.label(c.r)}${c.r<=14?`<span class="suit">${E.suits[c.s]}</span>`:''}</span><span class="pip">${c.r>14?'♛':E.suits[c.s]}</span>${E.wild(c,game.level)?'<span class="wild-tag">百搭</span>':''}</button>`;
  const columns=HandColumns.columns(cards,handLayout.groups,game.level);
  $('hand').innerHTML='<div class="hand-columns">'+columns.map(column=>`<div class="hand-column ${column.group?'packed-group':''}" role="group" aria-label="${column.group?'已理好组合':'点数 '+column.name}">${column.cards.map(cardHTML).join('')}</div>`).join('')+'</div>';
  document.querySelectorAll('#hand .hand-column').forEach((el,i)=>{
    el.style.setProperty('--stack-size',columns[i].cards.length);
    el.querySelectorAll('.card').forEach((card,index)=>card.style.setProperty('--stack-index',index));
  });
  const handWidth=$('hand').clientWidth;
  $('hand').style.setProperty('--hand-gaps',Math.max(cards.length-1,1));
  if (innerWidth>800 && cards.length>1) {
    const cardWidth=innerWidth<=1100?57:62, gap=Math.min(cardWidth+5,(handWidth-cardWidth)/(cards.length-1));
    $('hand').style.setProperty('--overlap',`${gap-cardWidth}px`);
  }
  $('play').textContent=humanReturn()?'确认还牌':'出牌';
  $('pass').disabled=!humanTurn() || !game.target;$('hint').disabled=!humanTurn() && !humanReturn();
  const rows=game.events.slice(-70).reverse();
  $('log').replaceChildren(...rows.map(e=>{
    const li=document.createElement('li');li.textContent=e.message.replace(/(^|向 |，持牌者 |者 |，)([0-3])(?= | 首出| 借风)/g,(_,prefix,seat)=>prefix+names[Number(seat)]);
    if (e.kind==='play') li.textContent+=`：${e.cards.map(E.text).join(' ')}`;
    return li;
  }));
  refreshSelection();safeSave();
  if (game.phase==='over') showResult();
}
function showResult() {
  const r=game.result;
  $('result-title').textContent=game.champion!==null?(game.champion===0?'恭喜，你们过 A 了！':'对方成功过 A'):(r.team===0?'你们赢下了这一副':'对方赢下了这一副');
  $('result-detail').textContent=`${r.team===0?'我方':'对方'}升 ${r.gain} 级 · 我方 ${E.label(game.levels[0])} / 对方 ${E.label(game.levels[1])}${game.champion!==null?' · 比赛结束':' · 下一副打 '+E.label(game.level)}`;
  $('rankings').innerHTML=r.order.map((s,i)=>`<div><b>${r.order[0]%2===r.order[1]%2 && i>=2?'双下':['头游','二游','三游','末游'][i]}</b>${names[s]}</div>`).join('');
  $('next').textContent=game.champion!==null?'再开一局':'开始下一副';
  if (!$('result-dialog').open) $('result-dialog').showModal();
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function pump() {
  if (suspended || busy || game.phase==='over') return;
  if (game.phase==='play' && game.turn===0 && !$('auto').checked) return;
  if (game.phase==='return' && game.returns.every(t=>t.from===0) && !$('auto').checked) {render();return;}
  const token=generation;busy=true;render();
  try {
    await delay(Number($('speed').value));
    if (token!==generation) return;
    if (game.phase==='return') {
      const task=game.returns.find(t=>t.from!==0 || $('auto').checked);
      if (!task) {busy=false;render();return;}
      const choices=E.sort(game.returnChoices(task.from),game.level);
      let returnId=choices[0].id;
      if(task.from!==0 && aiMode==='llm') {
        const response=await agents.decide({...agentObservation(task.from),action:'return'});
        if(token!==generation) return;
        returnId=response.move?.cards[0]?.id;
        $('agent-health').textContent=`${names[task.from]}：${response.reason}`;
      }
      game.returnCard(task.from,returnId);
    } else {
      const seat=game.turn;
      if (seat===0 && !$('auto').checked) {busy=false;render();return;}
      const observation=seat===0?game.observation(0):agentObservation(seat);
      let response;
      if (seat===0) response=E.choose(observation);
      else {
        if (!agents) throw Error('AI 未启动，请刷新页面或重新开局');
        response=await agents.decide(observation);
      }
      if (token!==generation) return;
      game.play(seat,response.move?response.move.cards.map(c=>c.id):[],response.move?.key);
      if (seat!==0) $('agent-health').textContent=`${names[seat]}：${response.reason}`;
    }
    busy=false;selected=new Set([...selected].filter(id=>game.hands[0].some(c=>c.id===id)));hintIndex=0;showError('');$('retry').hidden=true;render();pump();
  } catch(error) {
    if (token!==generation) return;
    busy=false;showError(error.message);$('retry').hidden=false;render();
  }
}
$('hand').addEventListener('click',event=>{
  if(suspended||Date.now()<suppressClickUntil) return;
  const button=event.target.closest('button[data-id]');if (!button || game.phase==='over') return;
  const id=button.dataset.id;
  if (humanReturn()) selected.clear();
  if (selected.has(id)) selected.delete(id);else selected.add(id);
  refreshSelection();showError('');
});
$('hand').addEventListener('dragstart',event=>{
  const card=event.target.closest('button[data-id]');
  if(!card || game.phase==='over') {event.preventDefault();return;}
  dragging=selected.has(card.dataset.id)?handLayout.ids.filter(id=>selected.has(id)):[card.dataset.id];
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.id);
  card.classList.add('dragging');
});
function clearDropMarkers(){document.querySelectorAll('#hand .drop-before, #hand .drop-after').forEach(el=>el.classList.remove('drop-before','drop-after'));}
$('hand').addEventListener('dragover',event=>{
  if(!dragging.length) return;
  event.preventDefault();event.dataTransfer.dropEffect='move';clearDropMarkers();
  const card=event.target.closest('button[data-id]');
  if(card && !dragging.includes(card.dataset.id)) {
    const rect=card.getBoundingClientRect();
    // Most of each card is overlapped; use its exposed left edge for insertion.
    card.classList.add(event.clientX>rect.right-12?'drop-after':'drop-before');
  }
});
$('hand').addEventListener('drop',event=>{
  if(!dragging.length) return;
  event.preventDefault();
  const card=event.target.closest('button[data-id]');
  const target=card?.dataset.id || handLayout.ids.at(-1), after=card?card.classList.contains('drop-after'):true;
  const moving=dragging;dragging=[];suppressClickUntil=Date.now()+250;
  arrange(HandLayout.move(handLayout.ids,moving,target,after));
});
$('hand').addEventListener('dragend',()=>{dragging=[];suppressClickUntil=Date.now()+250;clearDropMarkers();document.querySelectorAll('#hand .dragging').forEach(el=>el.classList.remove('dragging'));});
$('gather').onclick=()=>{
  if(suspended||game.phase==='over')return;
  try{handLayout.groups=HandColumns.pack(game.hands[0],[...selected],game.level,handLayout.groups);selected.clear();showError('');render();$('hand').scrollLeft=$('hand').scrollWidth;}
  catch(e){showError(e.message);}
};
$('move-left').onclick=()=>arrange(HandLayout.shift(handLayout.ids,[...selected],-1));
$('move-right').onclick=()=>arrange(HandLayout.shift(handLayout.ids,[...selected],1));
$('play').onclick=()=>{
  try {
    if (humanReturn()) game.returnCard(0,[...selected][0]);
    else if (humanTurn()) game.play(0,[...selected],$('move-choice')?.value);
    else return;
    selected.clear();hintIndex=0;showError('');render();pump();
  } catch(error) {showError(error.message);}
};
$('pass').onclick=()=>{if (!humanTurn()) return;try {game.play(0,[]);selected.clear();hintIndex=0;showError('');render();pump();}catch(error){showError(error.message);}};
$('clear').onclick=()=>{selected.clear();hintIndex=0;refreshSelection();};
$('hint').onclick=()=>{
  if (humanReturn()) {selected=new Set([E.sort(game.returnChoices(0),game.level)[0].id]);refreshSelection();return;}
  if (!humanTurn()) return;
  const moves=E.options(game.hands[0],game.level,game.target).sort((a,b)=>E.tier(a)-E.tier(b)||a.power-b.power||b.n-a.n);
  const signature=`${game.events.length}`;
  if (lastSignature!==signature) {lastSignature=signature;hintIndex=0;}
  const best=E.choose(game.observation(0)).move;
  if (best) {const index=moves.findIndex(m=>m.key===best.key);if(index>=0)moves.unshift(...moves.splice(index,1));}
  if (!moves.length) {showError('没有可压过的牌，请点击“不要”。');return;}
  const move=moves[hintIndex++%moves.length];selected=new Set(move.cards.map(c=>c.id));refreshSelection();
  if ($('move-choice')) $('move-choice').value=move.key;
  showError(`提示 ${((hintIndex-1)%moves.length)+1}/${moves.length} · 再点可切换`);
};
$('auto').onchange=()=>{render();pump();};$('retry').onclick=()=>pump();
function fillModelPicker(selected=aiSettings.model){
  const vendor=$('agent-vendor').value;
  $('agent-model').replaceChildren();
  for(const model of availableModels.filter(m=>m.vendor===vendor))$('agent-model').add(new Option(model.label,model.id));
  $('agent-model').add(new Option('自定义模型 ID…','custom'));
  const found=availableModels.find(m=>m.vendor===vendor);
  $('agent-model').value=availableModels.some(m=>m.id===selected&&m.vendor===vendor)?selected:selected===vendor+'/'&&found?found.id:'custom';
  $('custom-model').value=selected?.startsWith(vendor+'/')?selected:vendor+'/';
  refreshCustomModel();
}
function fillVendorPicker(selected=aiSettings.model){
  const vendors=[...new Set([...Object.keys(AgentSettings.vendorNames),...availableModels.map(m=>m.vendor),selected.split('/')[0]])];
  $('agent-vendor').replaceChildren(...vendors.map(v=>new Option(AgentSettings.vendorNames[v]||v,v)));
  $('agent-vendor').add(new Option('其他厂家（手动填写 ID）','other'));
  $('agent-vendor').value=selected.split('/')[0];fillModelPicker(selected);
}
function refreshCustomModel(){$('custom-model-field').hidden=$('agent-model').value!=='custom';}
function draftModel(){return $('agent-model').value==='custom'?$('custom-model').value.trim():$('agent-model').value;}
$('agent-vendor').onchange=()=>fillModelPicker($('agent-vendor').value==='other'?'':$('agent-vendor').value+'/');
$('agent-model').onchange=refreshCustomModel;
for(const difficulty of AgentSettings.difficulties)$('agent-difficulty').add(new Option(difficulty.label,difficulty.id));
function refreshSettingsDraft(){
  $('model-controls').hidden=$('agent-mode').value!=='llm';
  $('difficulty-detail').textContent=AgentSettings.difficulties.find(x=>x.id===$('agent-difficulty').value)?.description||'';
}
async function checkApi(){
  if(staticDemo)throw Error('GitHub Pages 离线试玩版：可玩本地规则模式。使用 CherryIN 请下载源码并运行 StartWeb.cmd。');
  if(location.protocol==='file:')throw Error('请用 StartWeb.cmd 启动后打开本机网址，才能使用 CherryIN。');
  const r=await fetch('/api/llm/status',{signal:AbortSignal.timeout(5000)}),data=await r.json();
  if(!r.ok)throw Error(data.error||'无法读取 CherryIN 配置');
  return data;
}
$('mobile-settings-open').onclick=async()=>{
  $('agent-mode').value=aiMode;fillVendorPicker();$('agent-difficulty').value=aiSettings.difficulty;$('agent-protocol').value=aiSettings.protocol;
  refreshSettingsDraft();$('api-status').textContent='正在检查本机 CherryIN 配置…';settingsDialog.showModal();
  try{const d=await checkApi();$('api-status').textContent=d.configured?`已配置 CherryIN 密钥 · 本次启动已调用 ${d.calls}/${d.maxCalls} 次`:'尚未配置 CherryIN API Key。离线模式可直接玩。';}
  catch(e){$('api-status').textContent=e.message;}
};
$('agent-mode').onchange=$('agent-difficulty').onchange=refreshSettingsDraft;
$('apply-ai').onclick=async()=>{
  if(busy||checkingSettings)return;
  const mode=$('agent-mode').value,settings={model:draftModel(),difficulty:$('agent-difficulty').value,protocol:$('agent-protocol').value};
  checkingSettings=true;$('apply-ai').disabled=true;
  try{
    if(mode==='llm'){
      const info=AgentSettings.modelInfo(settings.model,settings.protocol);
      if($('agent-vendor').value!=='other'&&info.vendor!==$('agent-vendor').value)throw Error('自定义模型 ID 的厂家前缀与所选厂家不一致');
      if(!(await checkApi()).configured)throw Error('请先在本机设置 CHERRYIN_API_KEY 或填写 cherryin.config.json。');
    }else{settings.model=aiSettings.model;settings.protocol=aiSettings.protocol;}
    if(suspended)throw Error('牌局已暂停，请先继续游戏');
    if(busy)throw Error('请等当前出牌结束后再应用设置');
    if(aiMode==='llm'&&mode==='llm'&&agents)agents.configure(settings);
    else if(mode!==aiMode||!agents){const next=mode==='llm'?new LLMAgentPool(settings):new AgentPool();agents?.close();agents=next;}
    aiMode=mode;aiSettings=settings;
    try{localStorage.setItem(settingsKey,JSON.stringify(aiSettings));}catch{}
    updateModeLabel();settingsDialog.close();showError('');$('retry').hidden=true;render();pump();
  }catch(e){$('api-status').textContent=e.message;}
  finally{checkingSettings=false;$('apply-ai').disabled=busy;}
};
$('refresh-models').onclick=async()=>{
  if($('refresh-models').disabled)return;
  $('refresh-models').disabled=true;$('catalog-status').textContent='正在向 CherryIN 获取模型列表…';
  try{
    const selected=draftModel()||aiSettings.model;
    const response=await fetch('/api/llm/models',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'模型列表获取失败');
    availableModels=data.models;fillVendorPicker(selected);
    $('catalog-status').textContent=`已获取 ${availableModels.length} 个模型。请选择支持文本生成的模型；列表也可能包含图片等专用模型。`;
  }catch(e){$('catalog-status').textContent=`${e.message}。可手动填写控制台模型 ID。`;}
  finally{$('refresh-models').disabled=false;}
};
$('sort').onclick=()=>autoArrange('rank');
$('sort-suit').onclick=()=>autoArrange('rank');
$('rules').onclick=()=>$('rules-dialog').showModal();$('close-rules').onclick=()=>$('rules-dialog').close();
$('restart').onclick=()=>{if (confirm('重新开局会清除当前比赛进度，是否继续？')) {$('result-dialog').close();showError('');start(true);}};
$('next').onclick=()=>{
  $('result-dialog').close();selected.clear();hintIndex=0;
  if (game.champion!==null) start(true);else {game.startRound();render();pump();}
};
$('result-dialog').addEventListener('cancel',event=>event.preventDefault());
window.addEventListener('resize',()=>render());
document.addEventListener('keydown',event=>{
  if(suspended)return;
  if (settingsDialog.open || $('rules-dialog').open || $('result-dialog').open || ['INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)) return;
  if (event.key==='Enter' && !$('play').disabled) $('play').click();
  if (event.key.toLowerCase()==='h') $('hint').click();
  if (event.key==='Escape') $('clear').click();
});
function freezeGame(){
  generation++;suspended=true;busy=false;
  if(agents?.exportState)pendingContexts=agents.exportState();
  agents?.close();agents=null;document.querySelector('.app').inert=true;
}
function resumeGame(){
  if(needsRedeal){game.startRound();handLayout={round:0,ids:[],groups:[]};selected.clear();needsRedeal=false;pendingContexts=[];}
  agents=aiMode==='llm'?new LLMAgentPool(aiSettings):new AgentPool();agents.importState?.(pendingContexts);
  suspended=false;document.querySelector('.app').inert=false;$('resume-dialog').close();$('exit-dialog').close();updateModeLabel();render();pump();
}
function showResume(){
  document.querySelector('.app').inert=true;
  $('resume-title').textContent=exitKind==='interrupt'?'已中断本副牌':'牌局已暂停';
  $('resume-detail').textContent=exitKind==='interrupt'?`我方 ${E.label(game.levels[0])} · 对方 ${E.label(game.levels[1])}，进入后按保留级数重新发牌，本副不计胜负。`:'已保存当前手牌、轮次、出牌顺序和 AI 决策记录。可关闭本页，下次打开继续。';
  $('resume-game').textContent=exitKind==='interrupt'?'重新发牌，进入游戏':'继续当前牌局';
  if(!$('resume-dialog').open)$('resume-dialog').showModal();
}
$('exit-game').onclick=()=>{
  settingsDialog.close();$('result-dialog').close();freezeGame();$('exit-error').textContent='';$('exit-dialog').showModal();
};
$('exit-cancel').onclick=()=>resumeGame();
$('exit-dialog').addEventListener('cancel',event=>{event.preventDefault();resumeGame();});
for(const kind of ['pause','interrupt'])$('exit-'+kind).onclick=()=>{
  if(!saveSession(kind)){$('exit-error').textContent='保存失败，请取消退出后检查浏览器存储空间。';return;}
  exitKind=kind;
  GameExit.leave();
};
$('resume-game').onclick=()=>resumeGame();
$('resume-dialog').addEventListener('cancel',e=>e.preventDefault());
start();
if(staticDemo){
  $('agent-mode').querySelector('option[value="llm"]').disabled=true;
  $('mode-label').textContent='GitHub Pages · 离线试玩';
}
