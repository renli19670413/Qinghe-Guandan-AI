(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.HandLayout=api;
})(globalThis,function(){
  // Layout is independent of game hands: only display positions change.
  function reconcile(ids,cards){
    const available=new Set(cards.map(c=>c.id));
    const kept=[...new Set(ids)].filter(id=>available.has(id));
    const seen=new Set(kept);
    return [...kept,...cards.filter(c=>!seen.has(c.id)).map(c=>c.id)];
  }
  function move(ids,moving,target,after=false){
    const selected=new Set(moving), block=ids.filter(id=>selected.has(id));
    if(!block.length || selected.has(target)) return ids.slice();
    const rest=ids.filter(id=>!selected.has(id));
    const index=rest.indexOf(target);
    if(index<0) return ids.slice();
    rest.splice(index+(after?1:0),0,...block);return rest;
  }
  function gather(ids,moving){
    const selected=new Set(moving),block=ids.filter(id=>selected.has(id));
    if(!block.length) return ids.slice();
    const first=ids.indexOf(block[0]), prefix=ids.slice(0,first);
    return [...prefix,...block,...ids.slice(first).filter(id=>!selected.has(id))];
  }
  function shift(ids,moving,direction){
    const selected=new Set(moving),positions=ids.map((id,i)=>selected.has(id)?i:-1).filter(i=>i>=0);
    if(!positions.length) return ids.slice();
    const edge=direction<0?positions[0]:positions.at(-1);
    const neighbor=ids[edge+(direction<0?-1:1)];
    return neighbor?move(ids,moving,neighbor,direction>0):ids.slice();
  }
  return {reconcile,move,gather,shift};
});
