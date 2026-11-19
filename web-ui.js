'use strict';
const settingsDialog=document.getElementById('mobile-settings');
document.getElementById('mobile-settings-close').onclick=()=>settingsDialog.close();
for(const id of ['rules','restart'])document.getElementById(id).addEventListener('click',()=>settingsDialog.close(),{capture:true});
