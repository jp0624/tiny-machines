import {
  createApp,
  ref,
  computed,
  onMounted,
  onUnmounted,
} from 'vue/dist/vue.esm-bundler.js';
import {
  createWorld,
  blueprint,
  missions,
  clampPart,
  tools,
  STEP,
  BALL_RADIUS,
  BOX_WALL,
  BOX_DEPTH,
  SPAWN,
} from './physics.js';
import './style.css';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const toolTypes = Object.keys(tools);
const clone = (v) => JSON.parse(JSON.stringify(v));
createApp({
  setup() {
    const canvas = ref(null),
      level = ref(0),
      free = ref(false),
      parts = ref(blueprint(0).slice(0, 1)),
      selected = ref(1),
      running = ref(false),
      paused = ref(false),
      muted = ref(true),
      hint = ref(false),
      power = ref(1),
      stats = ref({ elapsed: 0, speed: 0, fanHit: false, gearHit: false }),
      message = ref('Pip needs a snack! Add a ramp, then press Go.'),
      won = ref(false),
      badges = ref([]),
      saved = ref(false);
    let world,
      raf,
      ctx,
      last = 0,
      accumulator = 0,
      history = [],
      future = [],
      drag = null,
      audio,
      lastSound = 0,
      nextId = 100;
    try {
      badges.value = JSON.parse(localStorage.getItem('tiny-badges') || '[]');
    } catch {}
    const mission = computed(() => missions[level.value]),
      item = computed(() => parts.value.find((p) => p.id === selected.value)),
      canUndo = ref(false),
      canRedo = ref(false);
    function tone(freq = 440) {
      if (muted.value) return;
      try {
        audio ??= new AudioContext();
        audio.resume();
        if (audio.currentTime - lastSound < 0.09) return;
        lastSound = audio.currentTime;
        const o = audio.createOscillator(),
          g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.05, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
        o.connect(g).connect(audio.destination);
        o.start();
        o.stop(audio.currentTime + 0.14);
      } catch {}
    }
    function flags() {
      canUndo.value = history.length > 0;
      canRedo.value = future.length > 0;
    }
    function snapshot() {
      history.push(clone(parts.value));
      if (history.length > 60) history.shift();
      future = [];
      flags();
    }
    function event(type) {
      if (type === 'win') {
        won.value = true;
        running.value = false;
        message.value = free.value
          ? 'Brilliant invention! Pip made it.'
          : 'Snack delivered! You earned a maker badge.';
        if (!free.value && !badges.value.includes(level.value)) {
          badges.value.push(level.value);
          try {
            localStorage.setItem('tiny-badges', JSON.stringify(badges.value));
          } catch {}
        }
        tone(880);
      } else if (type === 'fan') tone(600);
      else if (type === 'gear') tone(220);
      else tone(330);
    }
    function rebuild() {
      world?.destroy();
      accumulator = 0;
      world = createWorld(
        parts.value,
        level.value,
        power.value,
        event,
        free.value,
      );
      stats.value = world.state;
    }
    function reset() {
      running.value = false;
      paused.value = false;
      won.value = false;
      rebuild();
      message.value =
        'Ready for another experiment. Edit your parts or press Go.';
    }
    function edit() {
      if (running.value || paused.value) reset();
      won.value = false;
    }
    function add(type) {
      edit();
      if (parts.value.length >= 18) {
        message.value = 'Your bench holds 18 parts. Remove one to make room.';
        return;
      }
      snapshot();
      const id = nextId++;
      parts.value.push({ id, type, x: 480, y: 280, angle: tools[type].angle });
      selected.value = id;
      rebuild();
      message.value =
        'Drag the new ' +
        type +
        ' into place. Use the handles below for precise changes.';
      tone(550);
    }
    function update(field, value) {
      if (!item.value) return;
      edit();
      snapshot();
      Object.assign(
        item.value,
        clampPart({ ...item.value, [field]: Number(value) }),
      );
      rebuild();
    }
    function remove() {
      if (!item.value) return;
      edit();
      snapshot();
      parts.value = parts.value.filter((p) => p.id !== selected.value);
      selected.value = parts.value[0]?.id;
      rebuild();
    }
    function undo() {
      if (!history.length) return;
      edit();
      future.push(clone(parts.value));
      parts.value = history.pop();
      selected.value = parts.value[0]?.id;
      flags();
      rebuild();
    }
    function redo() {
      if (!future.length) return;
      edit();
      history.push(clone(parts.value));
      parts.value = future.pop();
      selected.value = parts.value[0]?.id;
      flags();
      rebuild();
    }
    function plan() {
      edit();
      snapshot();
      parts.value = blueprint(level.value);
      selected.value = 1;
      rebuild();
      message.value =
        'Blueprint connected! Press Go, watch what happens, then change it.';
    }
    function choose(i) {
      running.value = false;
      paused.value = false;
      won.value = false;
      free.value = i === missions.length;
      level.value = free.value ? 0 : i;
      parts.value = free.value ? [] : blueprint(i).slice(0, 1);
      history = [];
      future = [];
      flags();
      selected.value = parts.value[0]?.id;
      hint.value = false;
      rebuild();
      message.value = free.value
        ? 'Build anything. The snack box is optional.'
        : mission.value.brief;
    }
    function go() {
      tone(700);
      if (won.value) reset();
      if (paused.value) {
        paused.value = false;
        running.value = true;
        return;
      }
      if (running.value) {
        running.value = false;
        paused.value = true;
        message.value = 'Paused. Resume to keep this exact motion.';
        return;
      }
      rebuild();
      running.value = true;
      message.value =
        'Off you go, Pip! Watch the path and improve your machine.';
    }
    function save() {
      try {
        localStorage.setItem(
          'tiny-machine',
          JSON.stringify({
            parts: parts.value,
            level: level.value,
            free: free.value,
            power: power.value,
          }),
        );
        saved.value = true;
        message.value = 'Invention saved on this device.';
      } catch {
        message.value =
          'Storage is unavailable. Your current invention still works.';
      }
    }
    function load() {
      try {
        const d = JSON.parse(localStorage.getItem('tiny-machine'));
        if (!d || !Array.isArray(d.parts)) throw Error();
        edit();
        snapshot();
        parts.value = d.parts
          .filter(
            (p) =>
              p &&
              Object.hasOwn(tools, p.type) &&
              [p.x, p.y, p.angle].every(Number.isFinite),
          )
          .slice(0, 18)
          .map((p) => clampPart({ ...p, id: nextId++ }));
        level.value = Math.max(
          0,
          Math.min(missions.length - 1, Math.trunc(Number(d.level) || 0)),
        );
        free.value = !!d.free;
        power.value = Math.max(0.5, Math.min(1.5, Number(d.power) || 1));
        selected.value = parts.value[0]?.id;
        reset();
        message.value = 'Saved invention restored.';
      } catch {
        message.value = 'No saved invention yet. Build one and press Save.';
      }
    }
    function point(e) {
      const r = canvas.value.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * 1000) / r.width,
        y: ((e.clientY - r.top) * 650) / r.height,
      };
    }
    function down(e) {
      if (running.value || paused.value) return;
      const p = point(e),
        hit = [...parts.value].reverse().find((o) => {
          const a = (-o.angle * Math.PI) / 180,
            dx = p.x - o.x,
            dy = p.y - o.y;
          const tool = tools[o.type];
          return tool.width
            ? Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <
                tool.width / 2 + 8 &&
                Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <
                  tool.height / 2 + 12
            : Math.hypot(dx, dy) < 60;
        });
      if (hit) {
        selected.value = hit.id;
        snapshot();
        drag = { x: p.x - hit.x, y: p.y - hit.y };
        canvas.value.setPointerCapture(e.pointerId);
      }
    }
    function move(e) {
      if (!drag || !item.value) return;
      const p = point(e);
      Object.assign(
        item.value,
        clampPart({ ...item.value, x: p.x - drag.x, y: p.y - drag.y }),
      );
      rebuild();
    }
    function up() {
      drag = null;
    }
    function key(e) {
      if (['INPUT', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        go();
      }
      if (e.key === 'Escape') reset();
      if (e.key.toLowerCase() === 'z') undo();
      if (e.key.toLowerCase() === 'y') redo();
      if (e.key === 'Delete') remove();
      if (e.key.toLowerCase() === 'r' && item.value)
        update('angle', item.value.angle + 10);
      const type = toolTypes[Number(e.key) - 1];
      if (type && !e.ctrlKey && !e.metaKey && !e.altKey) add(type);
      if (e.key.startsWith('Arrow') && item.value) {
        e.preventDefault();
        const f = ['ArrowLeft', 'ArrowRight'].includes(e.key) ? 'x' : 'y';
        update(
          f,
          item.value[f] + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -10 : 10),
        );
      }
    }
    function path(vertices, fill, stroke = '#183d49', width = 4) {
      ctx.beginPath();
      vertices.forEach((v, i) =>
        i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y),
      );
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
    function circle(x, y, r, fill, stroke = '#183d49') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    function text(t, x, y, size = 18, color = '#183d49') {
      ctx.fillStyle = color;
      ctx.font = `900 ${size}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(t, x, y);
    }
    function draw(t) {
      if (!ctx || !world) return;
      ctx.clearRect(0, 0, 1000, 650);
      // painted bench grid is deliberately translucent: the full-screen illustration remains visible.
      ctx.fillStyle = '#f4ffe8bb';
      ctx.fillRect(0, 0, 1000, 650);
      ctx.strokeStyle = '#368a7630';
      ctx.lineWidth = 1;
      for (let x = 0; x < 1000; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 650);
        ctx.stroke();
      }
      for (let y = 0; y < 650; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1000, y);
        ctx.stroke();
      }
      for (const f of world.floor) path(f.vertices, '#28bcb9');
      const box = mission.value.box;
      const left = box.x - box.width / 2,
        right = box.x + box.width / 2,
        base = box.y + BOX_DEPTH;
      ctx.fillStyle = '#fabbcc65';
      ctx.fillRect(left, box.y, box.width, BOX_DEPTH);
      text('SNACK BOX', box.x, box.y + 27, 16, '#7f1749');
      for (const p of parts.value) {
        if (p.type === 'fan') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.angle * Math.PI) / 180);
          ctx.fillStyle = '#5ee8f139';
          ctx.fillRect(0, -75, 320, 150);
          ctx.setLineDash([9, 9]);
          ctx.strokeStyle = '#087e94';
          ctx.lineWidth = 2;
          ctx.strokeRect(0, -75, 320, 150);
          ctx.setLineDash([]);
          for (let j = 0; j < 3; j++) {
            const q = ((reduced ? 0 : t) / 12 + j * 85) % 300;
            ctx.strokeStyle = '#00a2b8';
            ctx.beginPath();
            ctx.moveTo(q, -40 + j * 40);
            ctx.lineTo(q + 23, -40 + j * 40);
            ctx.stroke();
          }
          circle(0, 0, 37, '#13dce2');
          ctx.save();
          ctx.rotate(running.value ? t / 110 : 0);
          for (let j = 0; j < 3; j++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.fillStyle = '#fff269';
            ctx.beginPath();
            ctx.ellipse(17, 0, 23, 10, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
          circle(0, 0, 9, '#ff8d41');
          ctx.restore();
        }
      }
      for (const b of world.ramps) {
        const tool = tools[b.label];
        path(b.vertices, tool.color);
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        ctx.fillStyle = '#ffffff9c';
        for (let x = -tool.width / 2 + 12; x < tool.width / 2 - 10; x += 28)
          ctx.fillRect(x, -tool.height / 2 + 4, 12, 4);
        if (b.label === 'spring') text('⇧', 0, 7, 23);
        ctx.restore();
      }
      for (const b of world.gears) {
        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        for (let j = 0; j < 12; j++) {
          ctx.rotate(Math.PI / 6);
          ctx.fillStyle = '#a377ff';
          ctx.strokeStyle = '#183d49';
          ctx.lineWidth = 4;
          ctx.fillRect(35, -9, 20, 18);
          ctx.strokeRect(35, -9, 20, 18);
        }
        circle(0, 0, 43, '#b492ff');
        circle(0, 0, 15, '#fff3a3');
        ctx.restore();
      }
      const b = world.ball;
      ctx.save();
      ctx.translate(b.position.x, b.position.y);
      ctx.rotate(b.angle);
      circle(0, 0, BALL_RADIUS, '#ff7354');
      circle(-6, -3, 3, '#183d49');
      circle(6, -3, 3, '#183d49');
      ctx.strokeStyle = '#183d49';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 2, 6, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      for (const wall of world.box)
        path(wall.vertices, won.value ? '#bafa58' : '#ff7daa', '#922655', 3);
      ctx.fillStyle = '#fff1b5';
      ctx.fillRect(left - BOX_WALL / 2, box.y, BOX_WALL, 5);
      ctx.fillRect(right - BOX_WALL / 2, box.y, BOX_WALL, 5);
      ctx.fillRect(left + 9, base - 2, box.width - 18, 3);
      if (!running.value && !paused.value && !won.value) {
        text('PIP', SPAWN.x, SPAWN.y - 29, 15);
        if (item.value) {
          const p = item.value;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.angle * Math.PI) / 180);
          ctx.setLineDash([8, 5]);
          ctx.strokeStyle = '#e23a77';
          ctx.lineWidth = 4;
          const tool = tools[p.type],
            width = (tool.width ?? 108) + 16,
            height = (tool.height ?? 108) + 22;
          ctx.strokeRect(-width / 2, -height / 2, width, height);
          ctx.restore();
        }
      }
      if (won.value) {
        ctx.fillStyle = '#ffed49ee';
        ctx.beginPath();
        ctx.roundRect(310, 40, 380, 90, 22);
        ctx.fill();
        text('SNACK-TASTIC!', 500, 80, 33);
        text('Your invention works!', 500, 109, 19);
      }
    }
    function frame(t) {
      const dt = Math.min(50, last ? t - last : 0);
      last = t;
      if (running.value) {
        accumulator += dt;
        while (running.value && accumulator >= STEP) {
          world.step();
          accumulator -= STEP;
        }
        stats.value = world.state;
        if (world.state.y > 750 || world.state.elapsed > 16000) {
          running.value = false;
          paused.value = false;
          message.value =
            'Pip missed the box. Reset the ball, move a part, and try again!';
        }
      }
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    onMounted(() => {
      ctx = canvas.value.getContext('2d');
      rebuild();
      raf = requestAnimationFrame(frame);
      window.addEventListener('keydown', key);
    });
    onUnmounted(() => {
      cancelAnimationFrame(raf);
      world?.destroy();
      window.removeEventListener('keydown', key);
    });
    return {
      tools,
      toolTypes,
      missions,
      canvas,
      level,
      free,
      parts,
      selected,
      running,
      paused,
      muted,
      hint,
      power,
      stats,
      message,
      won,
      badges,
      saved,
      mission,
      item,
      canUndo,
      canRedo,
      add,
      update,
      remove,
      undo,
      redo,
      plan,
      choose,
      go,
      reset,
      save,
      load,
      down,
      move,
      up,
      tone,
    };
  },
  template: `
<main class="workshop">
 <header><a class="brand" href="/" aria-label="Tiny Machines home"><span class="brand-icon">⚙</span><span>TINY<br><b>MACHINES</b></span></a><div class="tagline">BIG IDEAS.<br><b>TINY INVENTORS.</b></div><div class="top-actions"><span class="badges">★ {{badges.length}} / {{missions.length}}</span><button @click="muted=!muted;tone()">{{muted?'♫ Sound off':'♫ Sound on'}}</button></div></header>
 <section class="game" aria-label="Invention workshop">
 <nav class="missions" aria-label="Choose challenge"><button v-for="(challenge,i) in missions" :key="challenge.name" :class="{active:!free&&level===i}" :aria-pressed="!free&&level===i" @click="choose(i)">{{i+1}} · {{challenge.name}} <span v-if="badges.includes(i)">★</span></button><button :class="{active:free}" :aria-pressed="free" @click="choose(missions.length)">Free build</button></nav>
 <div class="mission-bar"><div><p class="eyebrow">{{free?'OPEN WORKSHOP':'MAKER MISSION '+(level+1)}}</p><h1>{{free?'What will you invent?':mission.name}}</h1><p>{{free?'Combine any of the six tools and see where Pip lands.':mission.brief}}</p></div><button class="hint" @click="hint=!hint">{{hint?'Hide tip':'Need a spark? ✦'}}</button></div>
 <div v-if="hint" class="tip">{{mission.tip}} <button @click="plan">Try a working blueprint</button></div>
 <div class="bench"><canvas ref="canvas" width="1000" height="650" tabindex="0" aria-label="Physics workbench. Select a part below, then arrow keys move it, R rotates, Space runs. Drag parts with a pointer." @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></canvas><div class="telemetry" aria-label="Live experiment data"><span>{{(stats.elapsed/1000).toFixed(1)}}s</span><span>Speed {{stats.speed.toFixed(1)}}</span><span :class="{lit:stats.fanHit}">Breeze {{stats.fanHit?'✓':'○'}}</span><span :class="{lit:stats.gearHit}">Gear {{stats.gearHit?'✓':'○'}}</span></div></div>
 <div class="runbar"><button class="go" @click="go">{{running?'Ⅱ Pause':paused?'▶ Resume':won?'↻ Replay':'▶ Go, Pip!'}}</button><button @click="reset">↺ Reset ball</button><p role="status" aria-live="polite">{{message}}</p><button v-if="won&&!free&&level<missions.length-1" @click="choose(level+1)" class="next">Next mission →</button></div>
 </section>
 <aside class="toolbox" aria-label="Parts and editing"><div class="tool-heading"><h2>THE PARTS BOX</h2><span>{{parts.length}} / 18</span></div><div class="part-buttons"><button v-for="(type,i) in toolTypes" :key="type" @click="add(type)"><span class="part-symbol" :class="type" aria-hidden="true">{{tools[type].symbol}}</span><b>{{tools[type].name}}</b><small>{{tools[type].description}} · {{i+1}}</small></button></div><div class="editor"><label>Selected part<select v-model="selected"><option v-if="!parts.length" :value="undefined">Add a part first</option><option v-for="(p,i) in parts" :value="p.id">{{i+1}} · {{p.type}}</option></select></label><template v-if="item"><div class="coords"><label>X<input type="number" min="45" max="955" :value="Math.round(item.x)" @change="update('x',$event.target.value)"></label><label>Y<input type="number" min="70" max="550" :value="Math.round(item.y)" @change="update('y',$event.target.value)"></label></div><label>Angle {{item.angle}}°<input type="range" min="-90" max="90" step="5" :value="item.angle" @change="update('angle',$event.target.value)"></label><button class="remove" @click="remove">Remove selected part</button></template><label>Motor & breeze power<select v-model.number="power" @change="reset"><option :value="0.5">Gentle · 50%</option><option :value="1">Regular · 100%</option><option :value="1.5">Turbo · 150%</option></select></label></div><div class="history"><button @click="undo" :disabled="!canUndo">↶ Undo</button><button @click="redo" :disabled="!canRedo">Redo ↷</button></div><div class="history"><button @click="save">Save invention</button><button @click="load">Load</button></div><p class="help">Drag parts on the bench, or choose one and use the controls.<br><b>Keys:</b> 1–6 add tools · arrows move · R rotates · Space runs · Esc resets · Z / Y undo / redo.</p><p class="note">A playful physics simulation. All saves stay on this device.</p></aside>
 <footer>AN ORIGINAL PLAY LAB BY JOHN PARKER <span>DROP. TINKER. TRY AGAIN. ✦</span></footer>
</main>`,
}).mount('#app');
