/* Network-first navigation prevents a stale install or a cached 404 from masking deployment updates. */
const CACHE='tulpar-core-v5';
const PRECACHE=['./','./index.html','./styles.css','./app.js','./core.mjs','./gateway-client.mjs','./backup.mjs','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('tulpar-core-')&&n!==CACHE).map(n=>caches.delete(n)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const isNavigation=req.mode==='navigate';
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(isNavigation){
   try{const response=await fetch(req);if(response.ok)await cache.put('./index.html',response.clone());return response}
   catch{return await cache.match('./index.html')||Response.error()}
  }
  // App assets must keep their correct content type; never use HTML as fallback for JavaScript.
  const cached=await cache.match(req);
  if(cached){event.waitUntil(fetch(req).then(response=>{if(response.ok)return cache.put(req,response.clone())}).catch(()=>{}));return cached}
  const response=await fetch(req);
  if(response.ok)event.waitUntil(cache.put(req,response.clone()));
  return response;
 })());
});
