import { createStarfield } from './starfield.js';
import { createVisitCounter } from './visit-counter.js';
import { createWelcomeDepth } from './welcome-depth.js';
import { createVisitorLight } from './visitor-light.js';
import { createWelcomePuzzle } from './welcome-puzzle.js';
import { createHangingMascot } from './hanging-mascot.js';
import { createParticleBrand } from './particle-brand.js';
import { createApplauseCustomizer } from './applause-customizer.js';
import { createFooterWave } from './footer-wave.js';
import { createVisitorCards } from './visitor-cards.js';
import { createSectionArrivals } from './section-arrivals.js';
import { createBackgroundMusic, createBackToTopSound, createPuzzleCompleteSound, createPuzzleErrorSound, createCreditsClickSound } from './audio.js';
import { createClapAudio } from './clap-audio.js';
import { createClapInput } from './clap-input.js';

// This entry point deliberately has no connection to the original site's services.
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const body = document.body, reduced = matchMedia('(prefers-reduced-motion: reduce)');
const key = name => `fartopsy-welcome-demo-${name}`;
const memory = new Map();
function read(name) { if (memory.has(name)) return memory.get(name); try { return localStorage.getItem(key(name)); } catch { return null; } }
function save(name,value) { memory.set(name,String(value)); try { localStorage.setItem(key(name),String(value)); } catch {} }
const count = name => { const n = Number(read(name)); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
let motionWanted = read('motion') !== 'off', soundWanted = read('sound') !== 'off';
const motionAllowed = () => motionWanted && !reduced.matches;
const introCovering = () => body.classList.contains('credits-open') ||
  (document.documentElement.classList.contains('intro-active') && !document.documentElement.classList.contains('intro-revealing'));
const controllers = [], media = $$('img[data-animated]');
let poseTimer = 0, poseFrame = 0;
function updateImage(img) {
  const enabled = motionAllowed() && !document.hidden && !introCovering() && img.dataset.inView === 'true';
  const source = enabled ? img.dataset.animated : img.dataset.still;
  if (source && img.getAttribute('src') !== source) img.setAttribute('src',source);
}
function refresh() {
  body.classList.toggle('motion-on',motionAllowed());
  body.classList.toggle('motion-paused',!motionAllowed());
  body.classList.toggle('document-hidden',document.hidden);
  const button = $('#motion-toggle');
  button.textContent = motionAllowed() ? 'Motion on' : 'Motion off';
  button.setAttribute('aria-pressed',String(motionAllowed()));
  button.title = reduced.matches ? 'Motion follows your system preference' : 'Toggle decorative motion';
  controllers.forEach(controller=>controller?.refresh?.()); media.forEach(updateImage);
}
function refreshSound() {
  const button=$('#sound-toggle'); button.textContent=soundWanted?'Effects on':'Effects off';
  button.setAttribute('aria-pressed',String(soundWanted));
  if(!soundWanted) clapAudio.stop();
}
body.classList.add('enhanced');
const backgroundMusic=createBackgroundMusic({mediaActive:()=>body.classList.contains('credits-open')});
const backSound=createBackToTopSound(), winSound=createPuzzleCompleteSound(), errorSound=createPuzzleErrorSound(), clickSound=createCreditsClickSound();
const clapAudio=createClapAudio({enabled:()=>soundWanted}); clapAudio.preload();
function cue(sound) { if(soundWanted) sound.play(); }

// The puzzle gates only the Welcome continuation; initialize before observers.
controllers.push(createWelcomePuzzle({motionAllowed,
  introCovering:()=>document.documentElement.classList.contains('intro-active') || body.classList.contains('credits-open'),
  onSolve:()=>cue(winSound), onIncorrect:()=>cue(errorSound), onUnlock:refresh,
}));
for(const factory of [createHangingMascot,createParticleBrand,createFooterWave,createStarfield,
  createWelcomeDepth,createVisitorLight,createVisitorCards,createSectionArrivals]) controllers.push(factory({motionAllowed,introCovering}));
controllers.push(createApplauseCustomizer({motionAllowed}));
const counter = (selector,label,value) => {
  const instance=createVisitCounter({element:$(selector),motionAllowed,introCovering});
  instance.update(value,{label}); controllers.push(instance); return instance;
};
const visits=Math.min(Number.MAX_SAFE_INTEGER,count('visits')+1); save('visits',visits);
counter('#views','local visits',visits); counter('#letters-count','sample letters sent',24); counter('#online-now','local session',1);
const claps=counter('#clap-total','local claps',count('claps'));
$('#visitor-status').textContent='Saved in this browser.';
$('#online-now-note').textContent='Standalone local preview';
const clapButton=$('#clap-button'), clapStatus=$('#clap-status');
clapButton.disabled=false; clapStatus.hidden=false; clapStatus.textContent='Local claps — saved only in this browser.';
const clapInput=createClapInput({enabled:()=>!document.hidden && !introCovering(),intervalMs:150,
  changed:({cooling})=>clapButton.setAttribute('aria-disabled',String(cooling)),
  onPress() {
    const next=Math.min(Number.MAX_SAFE_INTEGER,count('claps')+1); save('claps',next); claps.update(next,{label:'local claps'});
    clapAudio.play(); clearTimeout(poseTimer); cancelAnimationFrame(poseFrame);
    clapButton.classList.remove('clapping');
    if(motionAllowed()) poseFrame=requestAnimationFrame(()=>clapButton.classList.add('clapping'));
    poseTimer=setTimeout(()=>clapButton.classList.remove('clapping'),540);
  },
});
clapButton.addEventListener('click',()=>clapInput.press());
window.addEventListener('storage',event=>{
  if(event.key===null) memory.clear();
  else if(event.key.startsWith(key(''))) memory.delete(event.key.slice(key('').length));
  if(event.key===null || event.key===key('claps')) claps.update(count('claps'),{label:'local claps'});
});

media.forEach(img=>{img.dataset.still ||= img.getAttribute('src');});
const observed=[...media,...$$('.hero,.flight-scene')];
const observer=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries) {
    target.dataset.inView=String(isIntersecting);
    target.classList.toggle('in-view',isIntersecting); target.classList.toggle('offscreen',!isIntersecting);
    if(target.matches('img[data-animated]')) updateImage(target);
  }
},{threshold:.01});
observed.forEach(element=>observer.observe(element));
$('#motion-toggle').addEventListener('click',()=>{motionWanted=!motionAllowed();save('motion',motionWanted?'on':'off');refresh();});
$('#sound-toggle').addEventListener('click',()=>{soundWanted=!soundWanted;save('sound',soundWanted?'on':'off');refreshSound();});
document.addEventListener('fartopsy:intro-ready',refresh);
document.addEventListener('fartopsy:welcome-unlocked',refresh);
document.addEventListener('visibilitychange',refresh);
reduced.addEventListener('change',refresh);
window.addEventListener('hashchange',refresh);

const triggers=new Map();
function showDialog(dialog,trigger) {
  if(dialog.open) return;
  triggers.set(dialog,trigger); dialog.showModal(); body.classList.add('credits-open');
  cue(clickSound); backgroundMusic.refresh(); refresh();
}
$$('[data-export-page]').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();
  $('[data-export-message]').textContent=`${link.dataset.exportPage} belongs to the full website. This independent copy contains only Welcome and its intro.`;
  showDialog($('#export-note'),link);
}));
$('.credits-button').addEventListener('click',event=>showDialog($('#credits-view'),event.currentTarget));
$$('.export-dialog').forEach(dialog=>{
  dialog.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{
    body.classList.toggle('credits-open',Boolean($('.export-dialog[open]'))); backgroundMusic.refresh(); refresh();
    triggers.get(dialog)?.focus({preventScroll:true});triggers.delete(dialog);
  });
});
$$('a[href="#top"],a[href="#main"],a[data-nav="welcome"],a.wordmark').forEach(link=>link.addEventListener('click',event=>{
  event.preventDefault();if(link.getAttribute('href')==='#top')cue(backSound);
  window.scrollTo({top:0,behavior:motionAllowed()?'smooth':'instant'});
  (link.getAttribute('href')==='#main'?$('#main'):$('.wordmark')).focus({preventScroll:true});
}));
refreshSound(); refresh();
window.addEventListener('pagehide',()=>{
  observer.disconnect();controllers.forEach(controller=>controller?.dispose?.());clapInput.dispose();clapAudio.dispose();backgroundMusic.dispose();
  [backSound,winSound,errorSound,clickSound].forEach(sound=>sound.dispose?.());clearTimeout(poseTimer);cancelAnimationFrame(poseFrame);
});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
