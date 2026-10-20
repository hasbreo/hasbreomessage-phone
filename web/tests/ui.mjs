// DOM interaction checks. This is not a real-browser layout/screenshot test.
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {unlink} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://chat.test',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','MutationObserver','Event','MouseEvent','KeyboardEvent','localStorage'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HTMLElement.prototype.scrollIntoView=function(){};
globalThis.fetch=async()=>new Response(JSON.stringify({defaultHomeserver:'https://message.hasbreo.com',registrationTokenRequired:true,accountStorageBytes:25000000000}),{headers:{'Content-Type':'application/json'}});
const {act}=await import('react');
const out=new URL('./.tmp-ui.mjs',import.meta.url).pathname;
await build({entryPoints:['src/main.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outfile:out,logLevel:'silent'});
const settle=async(fn=()=>{})=>act(async()=>{await fn();await new Promise(r=>setTimeout(r,60));});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const click=async element=>{assert.ok(element,'Expected button/input to exist');await settle(()=>element.click());};
const type=async(el,text)=>{assert.ok(el);const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;await settle(()=>{setter.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));});};
let checks=0;const report=text=>{checks++;console.log('PASS '+text);};
try{
  await settle(()=>import(out));assert.match(document.body.textContent,/Your people/);report('welcome and server connection form render');
  await click(button('Create an account'));assert.ok(document.querySelector('input[autocomplete="new-password"]'));assert.match(document.body.textContent,/Invite code/);await click(button('Welcome back'));report('registration and login tabs');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Take a look inside')));assert.match(document.body.textContent,/exploring the demo/);assert.match(document.body.textContent,/Mira Chen/);report('demo opens labelled conversation');
  await type(document.querySelector('textarea'),'A new message from the DOM test');await click(document.querySelector('[aria-label="Send message"]'));assert.match(document.body.textContent,/A new message from the DOM test/);assert.equal(document.querySelector('textarea').value,'');report('send message and clear draft');
  await click([...document.querySelectorAll('[aria-label="Reply"]')].at(-1));assert.match(document.body.textContent,/Replying to @you/);await type(document.querySelector('textarea'),'A threaded little reply');await click(document.querySelector('[aria-label="Send message"]'));assert.match(document.body.textContent,/A threaded little reply/);report('reply composer and delivery');
  await click([...document.querySelectorAll('[aria-label="React"]')].at(-1));await type(document.querySelector('[aria-label="Search emojis"]'),'green heart');await click(button('💚'));assert.ok(document.querySelector('.reactions'));report('emoji reaction');
  await click(document.querySelector('[aria-label="New conversation"]'));await click(button('Group chat'));await type(document.querySelector('input[placeholder="The good company"]'),'DOM test group');await click([...document.querySelectorAll('.person-row')][0]);await click([...document.querySelectorAll('.person-row')][1]);await click(button('Create group'));assert.equal(document.querySelector('.chat-title h2').textContent,'DOM test group');report('group creation with selected members');
  await type(document.querySelector('textarea'),'Group message');await click(document.querySelector('[aria-label="Send message"]'));assert.match(document.body.textContent,/Group message/);report('new group accepts messages');
  await click(document.querySelector('[aria-label="Add an emoji"]'));await type(document.querySelector('[aria-label="Search emojis"]'),'thumbs up');await click(button('👍'));assert(document.querySelector('textarea').value.includes('👍'));report('full searchable emoji picker inserts an emoji');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Quick replies')));await click(button('On my way'));assert(document.querySelector('textarea').value.includes('On my way'));report('web quick replies add to the composer');
  const drop=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(drop,'dataTransfer',{value:{types:['Files'],files:[new File(['test'],'dragged-note.txt',{type:'text/plain'})]}});await settle(()=>document.querySelector('.chat-pane').dispatchEvent(drop));assert.match(document.body.textContent,/dragged-note.txt/);assert(drop.defaultPrevented);report('dropping a file uploads to the selected chat and prevents navigation');
  assert.equal(document.documentElement.dataset.theme,'dark');await click(document.querySelector('[aria-label="Light mode"]'));assert.equal(document.documentElement.dataset.theme,'light');await click(document.querySelector('[aria-label="Dark mode"]'));assert.equal(document.documentElement.dataset.theme,'dark');report('dark by default and theme toggle');
  await click(document.querySelector('[aria-label="Settings"]'));assert.match(document.querySelector('[role="dialog"]').textContent,/Your history follows your login/);await click(button('Appearance & calls'));assert(document.querySelector('.settings-profile').closest('[hidden]'));assert(document.querySelector('.font-preview'));await type(document.querySelector('input[type="range"][max="22"]'),'20');assert.equal(document.documentElement.style.getPropertyValue('--message-font-size'),'20px');await click(button('Notifications'));assert(document.querySelector('.font-preview').closest('[hidden]'));await click(document.querySelector('[aria-label="Close"]'));report('settings tabs, adjustable message font and key backup guidance');
  await click(document.querySelector('[aria-label="Conversation details"]'));assert.match(document.querySelector('[role="dialog"]').textContent,/3 people/);await click(document.querySelector('[aria-label="Close"]'));report('group details and members');
  await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Connect your server')));assert.match(document.body.textContent,/Welcome back/);report('leave demo and return to real login');
  console.log(`\n${checks} DOM interaction checks passed.`);
}finally{await unlink(out).catch(()=>{});dom.window.close();setTimeout(()=>process.exit(process.exitCode||0),100).unref();}
