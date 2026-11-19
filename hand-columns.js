(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.HandColumns=factory(root.Guandan);
})(globalThis,E=>{
  // Display order is by printed rank, independent from the level used to compare plays.
  const sort=cards=>cards.slice().sort((a,b)=>a.r-b.r||a.s-b.s||a.id.localeCompare(b.id));
  function reconcile(groups,cards){
    const ids=new Set(cards.map(c=>c.id)),seen=new Set();
    return (Array.isArray(groups)?groups:[]).map(g=>({key:g.key,name:g.name,ids:(Array.isArray(g.ids)?g.ids:[]).filter(id=>{if(!ids.has(id)||seen.has(id))return false;seen.add(id);return true;})})).filter(g=>g.ids.length);
  }
  function columns(cards,groups=[]){
    const byId=new Map(cards.map(c=>[c.id,c])),kept=reconcile(groups,cards),grouped=new Set(kept.flatMap(g=>g.ids)),normal=[];
    for(const c of sort(cards).filter(c=>!grouped.has(c.id))){
      let column=normal.at(-1);if(!column||column.rank!==c.r){column={rank:c.r,name:E.label(c.r),cards:[],group:false};normal.push(column);}column.cards.push(c);
    }
    return [...normal,...kept.map(g=>({...g,group:true,cards:g.ids.map(id=>byId.get(id))}))];
  }
  function pack(cards,selected,level,groups=[]){
    const ids=new Set(selected),picked=cards.filter(c=>ids.has(c.id));
    if(picked.length!==ids.size||!picked.length)throw Error('请先选择一组手牌');
    const options=E.classify(picked,level);if(!options.length)throw Error('所选牌不构成合法牌型，不能理成一组');
    const move=options[0],kept=reconcile(groups,cards).map(g=>({...g,ids:g.ids.filter(id=>!ids.has(id))})).filter(g=>g.ids.length);
    // Sort the selected cards by the same suit order inside the separate rightmost column.
    kept.push({key:move.key,name:move.name,ids:sort(picked).map(c=>c.id)});
    return kept;
  }
  return {sort,reconcile,columns,pack};
});
