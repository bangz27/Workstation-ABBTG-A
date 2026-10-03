/* register the service worker (installable PWA) */
(function(){
  if(!('serviceWorker' in navigator))return;
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js',{scope:'./'}).catch(function(e){try{console.warn('SW register failed',e);}catch(_){}} );
  });
})();
