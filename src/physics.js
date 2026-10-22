import Matter from 'matter-js';
const {Engine,Bodies,Body,Composite,Constraint,Events}=Matter;
export const missions=[
 {name:'The snack express',brief:'Roll Pip into the pink snack cup. Try joining ramps into a downhill path.',tip:'A gentle slope turns a drop into a roll.',goal:{x:760,y:550,w:130,h:90},spawn:{x:160,y:100},need:'cup'},
 {name:'Across the fizzy gap',brief:'The middle floor is missing! Use a fan to carry Pip across the gap.',tip:'Fans push only inside their striped air zone.',goal:{x:830,y:550,w:130,h:90},spawn:{x:160,y:100},need:'fan'},
 {name:'The power parade',brief:'Touch a powered gear and ride a fan breeze before reaching the cup.',tip:'The gear is a real pinned body. Its rotating edge can nudge Pip.',goal:{x:830,y:550,w:130,h:90},spawn:{x:160,y:100},need:'both'}
];
export function blueprint(i){return [
 {id:1,type:'ramp',x:270,y:230,angle:20},
 {id:2,type:'ramp',x:530,y:340,angle:20},
 {id:3,type:'fan',x:510,y:475,angle:-20},
 {id:4,type:'gear',x:680,y:420,angle:0}
 ];}
export function createWorld(parts,index=0,power=1,onEvent=()=>{}){
 const spec=missions[index]||missions[0],engine=Engine.create({gravity:{x:0,y:1,scale:.001}});
 const floor=index===0?[Bodies.rectangle(500,620,1100,40,{isStatic:true})]:[Bodies.rectangle(100,620,300,40,{isStatic:true}),Bodies.rectangle(850,620,340,40,{isStatic:true})];
 Composite.add(engine.world,[...floor,Bodies.rectangle(-20,300,40,700,{isStatic:true}),Bodies.rectangle(1020,300,40,700,{isStatic:true})]);
 const gears=[],ramps=[],fans=parts.filter(p=>p.type==='fan');
 for(const p of parts){const angle=p.angle*Math.PI/180;if(p.type==='ramp'){
 const b=Bodies.rectangle(p.x,p.y,300,18,{isStatic:true,angle,friction:.01,restitution:.12,label:'ramp'});ramps.push(b);Composite.add(engine.world,b);
 }else if(p.type==='gear'){
 const b=Bodies.polygon(p.x,p.y,12,49,{friction:1,restitution:.6,label:'gear',density:.05});Composite.add(engine.world,[b,Constraint.create({pointA:{x:p.x,y:p.y},bodyB:b,length:0,stiffness:1})]);gears.push(b);
 }}
 const ball=Bodies.circle(spec.spawn.x,spec.spawn.y,17,{restitution:.5,friction:.008,frictionAir:.001,label:'ball'});Composite.add(engine.world,ball);
 let fanHit=false,gearHit=false,won=false,elapsed=0;
 Events.on(engine,'collisionStart',e=>{for(const pair of e.pairs){if([pair.bodyA,pair.bodyB].includes(ball)){onEvent('bounce');if(pair.bodyA.label==='gear'||pair.bodyB.label==='gear'){gearHit=true;onEvent('gear')}}}});
 function step(dt=1000/120){if(won)return;elapsed+=dt;
 for(const g of gears)Body.setAngularVelocity(g,.045*power);
 for(const p of fans){const a=p.angle*Math.PI/180,dx=ball.position.x-p.x,dy=ball.position.y-p.y;const along=dx*Math.cos(a)+dy*Math.sin(a),across=-dx*Math.sin(a)+dy*Math.cos(a);if(along>-35&&along<320&&Math.abs(across)<75){Body.applyForce(ball,ball.position,{x:.0015*power*Math.cos(a),y:.0015*power*Math.sin(a)-.00035});if(!fanHit){fanHit=true;onEvent('fan')}}}
 Engine.update(engine,dt);
 const {x,y}=ball.position,g=spec.goal;
 if(x>g.x-g.w/2&&x<g.x+g.w/2&&y>g.y-g.h/2&&y<g.y+g.h/2&&(spec.need==='cup'||spec.need==='fan'&&fanHit||spec.need==='both'&&fanHit&&gearHit)){won=true;onEvent('win')}
 }
 return {engine,ball,gears,ramps,fans,floor,step,get state(){return {won,fanHit,gearHit,elapsed,x:ball.position.x,y:ball.position.y,speed:ball.speed}},destroy(){Composite.clear(engine.world,false);Engine.clear(engine)}};
}
export function clampPart(p){return {...p,x:Math.max(45,Math.min(955,p.x)),y:Math.max(70,Math.min(550,p.y)),angle:Math.max(-90,Math.min(90,p.angle))}}
