const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:8080/dashboard.html');await p.waitForTimeout(800);
console.log(await p.evaluate(()=>[...document.querySelectorAll('head style')].map(s=>JSON.stringify(s.textContent.slice(0,70))+' attrs='+[...s.attributes].map(a=>a.name).join(','))));
console.log(await p.evaluate(()=>Object.getOwnPropertyDescriptor(window.tailwind,'config')?'desc':'none'));
await b.close();})();
