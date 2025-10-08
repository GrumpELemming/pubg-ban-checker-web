(function(){
  const BZR = (window.BZR = window.BZR || {});
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const easeOutCubic = (t)=>1-Math.pow(1-t,3);
  const rgba = (hex,a)=>{
    const r=parseInt(hex.slice(1,3),16);
    const g=parseInt(hex.slice(3,5),16);
    const b=parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  };
  BZR.utils = { clamp, easeOutCubic, rgba };
})();


/* === Safe DOM helpers (idempotent) === */
(function(){
  if (window.__BZR_SAFE_DOM__) return;
  window.__BZR_SAFE_DOM__ = true;
  window.safeStripTags = function(input){ if(input==null) return ""; return String(input).replace(/<[^>]*>/g,''); };
  window.safeSetText = function(el, text){ if(!el) return; el.textContent = text==null ? "" : String(text); };
  window.safeSetHTML = function(el, htmlLike){ if(!el) return; el.replaceChildren(document.createTextNode(window.safeStripTags(htmlLike))); };
  window.safeAppendText = function(parent, text){ if(!parent) return; parent.appendChild(document.createTextNode(text==null?'':String(text))); };
})();