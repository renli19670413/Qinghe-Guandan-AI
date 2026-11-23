(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.MobileTableLayout=api;api.mount();}
})(globalThis,()=>{
  function metrics(width,height,count,stack){
    const gameWidth=Math.max(width,height),gameHeight=Math.min(width,height),fieldHeight=gameHeight-34;
    count=Math.max(1,count);stack=Math.max(1,stack);
    const rail=76,gap=count>18?2:4,availableWidth=gameWidth-rail-18;
    const zone=Math.max(65,Math.min(28+44+(stack-1)*16,fieldHeight-48));
    const handHeight=zone-27,step=Math.max(10,Math.min(16,Math.floor((handHeight-28)/Math.max(1,stack-1))));
    const cardHeight=Math.max(24,Math.min(44,handHeight-(stack-1)*step));
    const contentHeight=cardHeight+(stack-1)*step;
    const cardWidth=Math.max(10,Math.min(38,Math.floor((availableWidth-(count-1)*gap)/count)));
    return {gameWidth,gameHeight,rail,gap,zone,step,cardHeight,contentHeight,cardWidth,scale:Math.min(1,handHeight/contentHeight),font:Math.max(8,Math.min(13,step-3,Math.floor(cardWidth*.34)))};
  }
  function mount(){
    const root=document.documentElement,app=document.querySelector('.app'),hand=document.getElementById('hand');
    const fullscreen=document.getElementById('phone-fullscreen'),notice=document.getElementById('display-notice');
    let frame;
    function fit(){
      if(document.activeElement?.matches('input,textarea,select'))return;
      const width=innerWidth,height=innerHeight;
      const phone=matchMedia('(pointer:coarse)').matches||width<820&&height<820;
      root.classList.toggle('phone-layout',phone);
      root.classList.toggle('phone-portrait',phone&&height>width);
      if(!phone)return;
      const columns=[...hand.querySelectorAll('.hand-column')];
      const sizes=columns.map(c=>c.children.length),m=metrics(width,height,columns.length,Math.max(1,...sizes));
      const values={'game-width':m.gameWidth,'game-height':m.gameHeight,'screen-width':width,'hand-zone':m.zone,'action-rail':m.rail,'column-width':m.cardWidth,'card-height':m.cardHeight,'stack-step':m.step,'hand-content-height':m.contentHeight,'phone-font':m.font,'column-gap':m.gap};
      for(const [key,value]of Object.entries(values))app.style.setProperty('--'+key,value+'px');
      app.style.setProperty('--hand-scale',m.scale);
      const fittedWidth=Math.max(10,Math.min(m.cardWidth,Math.floor((hand.clientWidth-8-(columns.length-1)*m.gap)/Math.max(1,columns.length))));
      app.style.setProperty('--column-width',fittedWidth+'px');
      app.style.setProperty('--phone-font',Math.max(8,Math.min(m.font,Math.floor(fittedWidth*.34)))+'px');
    }
    function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);}
    new MutationObserver(schedule).observe(hand,{childList:true,subtree:true});
    addEventListener('resize',schedule);addEventListener('orientationchange',schedule);
    document.addEventListener('focusout',schedule);
    document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'退出全屏':'全屏';schedule();});
    fullscreen.onclick=async()=>{
      try{
        if(document.fullscreenElement){await document.exitFullscreen();return;}
        await document.documentElement.requestFullscreen({navigationUI:'hide'});
        try{await screen.orientation.lock('landscape');}catch{}
        notice.textContent='已进入全屏横屏牌桌';
      }catch{notice.textContent='此浏览器未允许全屏。请横握手机，或在浏览器菜单选择“添加到主屏幕”，从桌面图标打开即可隐藏地址栏。';document.getElementById('mobile-settings').showModal();}
      schedule();
    };
    let installPrompt;
    addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.getElementById('install-game').hidden=false;});
    document.getElementById('install-game').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notice.textContent='请在手机浏览器菜单选择“添加到主屏幕”或“安装应用”，以后从桌面图标进入。';};
    fit();
  }
  return {metrics,mount};
});
