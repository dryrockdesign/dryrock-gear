# Client-side change (Seviye A)

In `protected/tool.html`, REPLACE the existing local STL handler:

```js
$('dlStl').onclick=()=>{ const p=curParams;
  dl(stlBlob(g1geoms), `...`);
  if(p.mode==='pair') setTimeout(()=>dl(stlBlob(g2geoms), `...`),400);
};
```

WITH this version that asks the server (the gear math leaves the browser):

```js
async function serverSTL(which){
  const res = await fetch('/api/export-stl', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ ...curParams, which })
  });
  if(res.status===401){ location.href='/api/login'; return; }   // session expired
  if(!res.ok){ alert('Export failed.'); return; }
  const blob = await res.blob();
  const name = (res.headers.get('Content-Disposition')||'').match(/filename="(.+?)"/)?.[1] || 'gear.stl';
  dl(blob, name);
}
$('dlStl').onclick = async ()=>{
  await serverSTL('pinion');
  if(curParams.mode==='pair') await serverSTL('gear');
};
```

Then DELETE the local geometry helpers from the browser file so nothing valuable
remains client-side: `gearShape`, `geomsFor`, `gatherTris`, `stlBlob`.

## What the browser keeps (Seviye A)
- Sliders, the VDI 2736 numbers (cheap, not the product), the 3D preview.
NOTE: preview still uses geometry math. For TRUE copy-proof (Seviye B), also move
preview server-side — see SETUP_SERVER.md §B.
