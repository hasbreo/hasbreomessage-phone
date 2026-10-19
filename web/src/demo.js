const me='@you:demo.hasbreo.com';
let seq=0;
export function demoEvent(body,sender,ts=Date.now(),extra={}){const id=`$demo${++seq}`;return {getId:()=>id,getSender:()=>sender,getTs:()=>ts,getContent:()=>({body,msgtype:'m.text',...extra}),getType:()=>extra.type||'m.room.message',isRedacted:()=>false,isDecryptionFailure:()=>false,getStatus:()=>null};}
export function createDemo(){
  const now=Date.now();
  const people=[{user_id:'@mira:demo.hasbreo.com',display_name:'Mira Chen'},{user_id:'@rowan:demo.hasbreo.com',display_name:'Rowan Ellis'},{user_id:'@alex:demo.hasbreo.com',display_name:'Alex Parker'}];
  const rooms=[
    {id:'demo-mira',name:'Mira Chen',direct:true,people:[people[0]],events:[demoEvent('Hey! Found a little spot for Saturday ☀️',people[0].user_id,now-3600000),demoEvent('Coffee, then a walk by the water?',people[0].user_id,now-3540000),demoEvent('That sounds like an excellent plan.',me,now-3400000),demoEvent('And this is our new chat home. Text, photos, all the good stuff.',people[0].user_id,now-3300000),demoEvent('A little closer, wherever we are. 💚',people[0].user_id,now-3240000)]},
    {id:'demo-weekend',name:'The weekend club',direct:false,people:[people[0],people[1],people[2]],events:[demoEvent('One group. Absolutely no sensible plans.',people[1].user_id,now-7200000),demoEvent('I’m bringing snacks. That’s my contribution.',people[2].user_id,now-7100000)]},
    {id:'demo-rowan',name:'Rowan Ellis',direct:true,people:[people[1]],events:[demoEvent('The new place looks so good!',people[1].user_id,now-86400000),demoEvent('Thanks! Come over when you’re free.',me,now-86000000)]}
  ];
  return {me,people,rooms,active:'demo-mira'};
}
