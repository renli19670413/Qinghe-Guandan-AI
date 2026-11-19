(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.GameSession=factory(root.Guandan);
})(globalThis,E=>{
  const clone=x=>JSON.parse(JSON.stringify(x));
  function snapshot(game,ui={},kind='pause'){
    if(!['pause','interrupt'].includes(kind))throw Error('退出方式无效');
    const state=kind==='pause'?clone(game):{levels:game.levels.slice(),level:game.level,round:game.round,phase:'redeal',previous:null,champion:null,events:[]};
    return {version:1,kind,state,ui:kind==='pause'?clone(ui):{...clone(ui),selected:[],handLayout:{round:0,ids:[],groups:[]},contexts:[]}};
  }
  function restore(data){
    const s=data?.state;
    if(!s||!Array.isArray(s.levels)||s.levels.length!==2||s.levels.some(x=>!Number.isInteger(x)||x<2||x>14)||!Number.isInteger(s.level)||s.level<2||s.level>14||!Number.isInteger(s.round)||s.round<1)throw Error('存档级数无效');
    if(data.kind!=='interrupt'&&(!['play','return','over'].includes(s.phase)||!Array.isArray(s.hands)||s.hands.length!==4||!Array.isArray(s.events)))throw Error('存档牌局无效');
    return {game:Object.assign(new E.Game(),clone(s)),ui:clone(data.ui||{}),redeal:data.kind==='interrupt'};
  }
  return {snapshot,restore};
});
