// Spustit jednou v kartě s Google Mapami (po uložení katalogu). Uloží do localStorage tři kusy kódu,
// které se pak volají krátce přes eval(localStorage.najdiXXX) – přežijí navigaci mezi stránkami Map.
//   najdiPREP(obec): na stránce výsledků hledání naroluje seznam, spáruje adresy s katalogem a připraví frontu
//   najdiGO: otevře další salon z fronty
//   najdiEXT: přečte z detailu telefon, web, otevírací dobu, adresu, kategorii a přidá záznam do najdiRES
localStorage.setItem('najdiMAX', '6');
localStorage.setItem(
  'najdiPREP',
  `(async(mesto)=>{const KAT=JSON.parse(localStorage.getItem('najdiKAT'));const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/\\b(ulice|tr|trida|nam|namesti)\\b\\.?/g,'').replace(/[^a-z0-9]/g,'');for(let k=0;k<20&&!document.querySelector('div[role=feed]');k++)await new Promise(r=>setTimeout(r,500));const feed=document.querySelector('div[role=feed]');for(let i=0;i<8&&feed;i++){feed.scrollTop=feed.scrollHeight;await new Promise(r=>setTimeout(r,1200));}const town=norm(mesto);const seen={};const items=[];for(const a of document.querySelectorAll('a.hfpxzc')){const c=a.closest('[role=article]')||a.parentElement;const t=c.innerText.replace(/\\s+/g,' ');if(/Sponzorov/.test(t))continue;const m=t.match(/·\\s+(?:·\\s+)?([^·]+?)\\s(\\d+[a-z]?)(?:\\/(\\d+[a-z]?))?(?:,[^·]*?)?\\s+(?:Otev|Zav|Brzy|Trvale|Dočas)/);if(!m)continue;const id=[m[2],m[3]].filter(Boolean).map(c=>KAT[norm(m[1])+'|'+c.toLowerCase()+'|'+town]).find(Boolean);if(!id)continue;const n=a.getAttribute('aria-label').replace(/–Navštívený odkaz/,'');if(seen[id]&&seen[id]!==n){seen[id]='X';continue}seen[id]=n;items.push({id,n,href:a.href,m:mesto});}const hotovo=new Set(JSON.parse(localStorage.getItem('najdiRES')||'[]').map(r=>r[0]));const CH=new Set(JSON.parse(localStorage.getItem('najdiCHYBI')||'[]'));const q=items.filter(x=>seen[x.id]!=='X'&&!hotovo.has(x.id)&&(!CH.size||CH.has(x.id))).filter((x,i,arr)=>arr.findIndex(y=>y.id===x.id)===i).slice(0,Number(localStorage.getItem('najdiMAX')||6));sessionStorage.q=JSON.stringify(q);return mesto+': vysledku '+document.querySelectorAll('a.hfpxzc').length+', fronta '+q.length})`,
);
localStorage.setItem(
  'najdiGO',
  `(()=>{const q=JSON.parse(sessionStorage.q||'[]');if(!q.length)return 'konec';const x=q.shift();sessionStorage.q=JSON.stringify(q);sessionStorage.cur=JSON.stringify(x);setTimeout(()=>location.href=x.href,50);return 'jdu '+x.n})()`,
);
localStorage.setItem(
  'najdiEXT',
  `(async()=>{const x=JSON.parse(sessionStorage.cur||'null');if(!x)return 'nic';for(let k=0;k<25&&!document.querySelector('[data-item-id="address"]');k++)await new Promise(r=>setTimeout(r,400));const g=(id)=>document.querySelector('[data-item-id^="'+id+'"]');const hours=[...document.querySelectorAll('table tr')].map(tr=>tr.innerText.replace(/\\s+/g,' ').trim()).filter(t=>/^(pond|úter|stře|čtvr|pátek|sobota|neděle)/.test(t));const h1=document.querySelector('h1')?.innerText||'';const rec=[x.id,x.m,x.n,h1,(g('phone:tel:')?.getAttribute('data-item-id')||'').replace('phone:tel:',''),g('authority')?.href||'',hours.join(';'),(g('address')?.getAttribute('aria-label')||'').replace('Adresa: ',''),(document.querySelector('button[jsaction*="category"]')?.innerText||'')];if(!rec[3]&&!rec[7])return 'prazdne '+x.n;const res=JSON.parse(localStorage.getItem('najdiRES')||'[]');res.push(rec);localStorage.setItem('najdiRES',JSON.stringify(res));sessionStorage.cur='null';return 'ok '+x.n+(rec[4]?' tel':'')+(rec[6]?' hod':'')})()`,
);
'nástroje uloženy';
