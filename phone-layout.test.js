const {test}=require('node:test'),assert=require('node:assert/strict'),{metrics}=require('./phone-layout.js');
test('phone landscape fits every rank and preserves a visible table even with browser toolbars',()=>{
 for(const [w,h]of [[393,852],[852,393],[780,240],[740,220],[667,300],[932,430]])for(const [columns,stack]of [[15,4],[13,8],[7,10],[27,1]]){
  const m=metrics(w,h,columns,stack);
  assert(m.gameWidth>=m.gameHeight);
  assert(m.cardWidth*columns+(columns-1)*m.gap<=m.gameWidth-m.rail-m.statusSpace-18);
  assert(m.zone<=m.gameHeight-34-48);
  assert(m.contentHeight*m.scale<=m.zone-27+.01);
  assert(m.step>=10);assert(m.font>=8);
 }
});
test('the same phone has identical hand geometry before and after physical rotation',()=>{
 assert.deepEqual(metrics(393,852,15,5),metrics(852,393,15,5));
});
