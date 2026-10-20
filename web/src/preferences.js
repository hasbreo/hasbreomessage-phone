export const preferenceDefaults={fontSize:15,messageTone:'mint',callTone:'aurora',noiseSuppression:true,echoCancellation:true};
export function preferences(){try{return {...preferenceDefaults,...JSON.parse(localStorage.getItem('hasbreo.preferences')||'{}')}}catch{return {...preferenceDefaults}}}
export function savePreference(key,value){if(!(key in preferenceDefaults))throw Error('Unknown setting');const next={...preferences(),[key]:value};if(key==='fontSize')next.fontSize=Math.max(12,Math.min(22,Number(value)||15));localStorage.setItem('hasbreo.preferences',JSON.stringify(next));applyPreferences();globalThis.window?.dispatchEvent(new Event('hasbreo:preferences'));return next}
export function applyPreferences(){globalThis.document?.documentElement.style.setProperty('--message-font-size',preferences().fontSize+'px')}
export const toneOptions={mint:'Mint droplets',aurora:'Aurora',orbit:'Orbit',soft:'Soft chime',none:'Silent'};
let context;
export async function unlockAudio(){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;context ||= new C();if(context.state==='suspended')await context.resume();return context}
export async function playTone(name,ring=false){if(name==='none')return;const ctx=await unlockAudio();if(!ctx||ctx.state!=='running')return;
 const notes={mint:[659.25,880,783.99],aurora:[440,554.37,659.25],orbit:[523.25,783.99,1046.5],soft:[587.33,739.99]};
 for(const [index,hz]of(notes[name]||notes.mint).entries()){const start=ctx.currentTime+index*(ring?.22:.11),osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(ring?.07:.055,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+(ring?.42:.27));osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+(ring?.45:.3));}
}
