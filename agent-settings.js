(function(root,factory){
  const value=factory();
  if(typeof module==='object'&&module.exports)module.exports=value;else root.AgentSettings=value;
})(globalThis,()=>{
  const models=[
    {id:'gpt-5.4-mini',label:'GPT-5.4 mini · 轻量'},
    {id:'gpt-5.4',label:'GPT-5.4 · 均衡'},
    {id:'gpt-5.5',label:'GPT-5.5 · 进阶'}
  ];
  const cherryModels=[
    {id:'anthropic/claude-sonnet-4.5',label:'Claude Sonnet 4.5',vendor:'anthropic'},
    {id:'google/gemini-2.5-flash',label:'Gemini 2.5 Flash',vendor:'google'},
    {id:'openai/gpt-5.2-chat',label:'GPT-5.2 Chat',vendor:'openai'},
    {id:'deepseek/deepseek-v4-flash',label:'DeepSeek V4 Flash',vendor:'deepseek'}
  ];
  const vendorNames={openai:'OpenAI',anthropic:'Anthropic',google:'Google',deepseek:'DeepSeek',qwen:'通义千问',moonshot:'月之暗面',zhipu:'智谱',minimax:'MiniMax'};
  function modelInfo(id,protocol='auto'){
    if(typeof id!=='string'||id.length>180||!/^([a-z0-9][a-z0-9-]*)\/[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(id))throw Error('请填写 CherryIN 控制台的完整 厂家/模型 ID');
    if(!['auto','chat','responses'].includes(protocol))throw Error('接口类型无效');
    const vendor=id.split('/')[0];
    return {id,vendor,label:id.slice(vendor.length+1),protocol:protocol==='auto'?(/^openai\/(?:gpt-[5-9]|gpt-\d{2}|o[1-9])/.test(id)?'responses':'chat'):protocol};
  }
  const difficulties=[
    {id:'easy',label:'入门',effort:'none',tokens:650,history:6,memory:0,description:'主要看当前牌和自己的手牌，采用基础策略，不要求多轮预判。',strategy:'采取简单打法，优先成组出低牌或用低成本压制；不必预判多轮。'},
    {id:'normal',label:'标准',effort:'low',tokens:1800,history:24,memory:3,description:'参考近期出牌和自己的决策记录，注意搭档配合与炸弹保留。',strategy:'规划出牌组合，配合搭档。注意对手余牌、手中炸弹和接风机会。'},
    {id:'hard',label:'高手',effort:'medium',tokens:3600,history:42,memory:6,description:'加入公开记牌和更深入的末盘推演，通常更慢。',strategy:'使用已见牌点和未知对手牌点总数推测可能的强牌；考虑对手余牌、搭档借风、保住炸弹及末盘出完所需手数。未知牌的座位分配不可确定。'}
  ];
  return {models,cherryModels,vendorNames,modelInfo,difficulties,defaults:{model:'gpt-5.4-mini',difficulty:'normal'},cherryDefaults:{model:'google/gemini-2.5-flash',difficulty:'normal',protocol:'auto'}};
});
