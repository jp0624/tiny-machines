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
    const guide = ref(null);
    let resumeAfterGuide = false;
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
      message = ref('Pip needs a snack! Add a ramp, then press Go.'),
      won = ref(false),
      badges = ref([]);
    let world,
      raf,
      ctx,
      last = 0,
      accumulator = 0,
      history = [],
      future = [],
      drag = null,
      previewPartId = null,
      audio,
      lastSound = 0,
      nextId = 100;
    try {
      badges.value = JSON.parse(localStorage.getItem('tiny-badges') || '[]');
    } catch {}
    const mission = computed(() => missions[level.value]),
      available = computed(() => free.value ? toolTypes : mission.value.allowedParts ?? toolTypes),
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
      );
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
      if (!available.value.includes(type)) {
        message.value = tools[type].name + ' is locked for this mission.';
        return;
      }
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
        ' into place.';
      tone(550);
    }
    function update(field, value, recordHistory = true) {
      if (!item.value) return;
      edit();
      if (recordHistory) snapshot();
      Object.assign(
        item.value,
        clampPart({ ...item.value, [field]: Number(value) }),
      );
      rebuild();
    }
    function previewAngle(event) {
      const part = item.value;
      const angle = event.target.valueAsNumber;
      if (!part || part.angle === angle) return;
      update('angle', angle, previewPartId !== part.id);
      previewPartId = part.id;
    }
    function finishAnglePreview() {
      previewPartId = null;
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
      hint.value = false;
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
        message.value = 'Go, Pip, go!';
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
        'Go, Pip, go!';
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
        const savedLevel = Math.max(
          0,
          Math.min(missions.length - 1, Math.trunc(Number(d.level) || 0)),
        );
        if (level.value === savedLevel && free.value === !!d.free) {
          snapshot();
        } else {
          history = [];
          future = [];
          flags();
        }
        level.value = savedLevel;
        free.value = !!d.free;
        const validParts = d.parts.filter(p =>
          p && Object.hasOwn(tools, p.type) && [p.x, p.y, p.angle].every(Number.isFinite)
        );
        const permitted = validParts.filter(p => available.value.includes(p.type));
        parts.value = permitted.slice(0, 18).map(p => clampPart({ ...p, id: nextId++ }));
        power.value = Math.max(0.5, Math.min(1.5, Number(d.power) || 1));
        selected.value = parts.value[0]?.id;
        reset();
        message.value = permitted.length === validParts.length
          ? 'Saved invention restored.'
          : 'Build restored with the parts allowed in this mission.';
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
    function openGuide() {
      resumeAfterGuide = running.value;
      if (resumeAfterGuide) go();
      guide.value.showModal();
    }
    function closeGuide() {
      if (resumeAfterGuide && paused.value) go();
      resumeAfterGuide = false;
    }
    function key(e) {
      if (guide.value?.open) return;
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
      ctx.fillStyle = '#edf6e6';
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
      text(box.width < 100 ? 'SNACK' : 'SNACK BOX', box.x, box.y + 27, 16, '#7f1749');
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
      if (world.lid) {
        path(world.lid.vertices, '#ffe075');
        const remaining = mission.value.unlockWith.filter(type => !world.state.used.includes(type));
        text(remaining.map(type => tools[type].name).join(' + '), box.x, box.y - 12, 16);
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
        if (!won.value && (world.state.y > 750 || world.state.elapsed > 16000)) {
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
      available,
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
      message,
      won,
      badges,
      guide,
      openGuide,
      closeGuide,
      mission,
      item,
      canUndo,
      canRedo,
      add,
      update,
      previewAngle,
      finishAnglePreview,
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
  <header class="mast">
    <a class="brand" href="/" aria-label="Tiny Machines home"><i class="pip-face" aria-hidden="true">◡</i> Tiny <strong>Machines</strong></a>
    <span class="badges" :aria-label="badges.length+' of '+missions.length+' missions complete'">★ {{ badges.length }}/{{ missions.length }}</span>
    <button class="quiet" @click="muted=!muted;tone()" :aria-pressed="!muted">{{ muted ? 'Sound off' : 'Sound on' }}</button>
    <button class="guide-help" @click="openGuide" aria-label="How to play">?</button>
  </header>
  <section class="game" aria-label="Invention workshop">
    <div class="mission-head">
      <div><label class="mission-select">Choose mission
        <select aria-label="Choose mission" :value="free ? missions.length : level" @change="choose(Number($event.target.value))">
          <option v-for="(m,i) in missions" :key="m.name" :value="i">{{ i+1 }} · {{ m.expert ? 'Expert · ' : '' }}{{ m.name }} {{ badges.includes(i) ? '★' : '' }}</option>
          <option :value="missions.length">Free build</option>
        </select>
      </label><h1>{{ free ? 'Free build' : mission.name }}</h1></div>
      <button class="hint" @click="hint=!hint" :aria-expanded="hint">✦ Hint</button>
    </div>
    <div class="bench">
      <canvas ref="canvas" width="1000" height="650" tabindex="0" aria-label="Workbench. Drag parts to build a path into the snack box. Arrow keys move a selected part, R rotates and Space runs." @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up"></canvas>
      <div v-if="hint" class="tip"><p>{{ mission.tip }}</p><button @click="plan">Try a working blueprint</button><button aria-label="Close hint" @click="hint=false">×</button></div>
      <div v-if="won" class="delivery"><span aria-hidden="true">★</span> Snack delivered!</div>
    </div>
    <div class="runbar">
      <button class="go" @click="go">{{ running ? 'Ⅱ Pause' : paused ? '▶ Resume' : won ? '↻ Replay' : '▶ Go, Pip!' }}</button>
      <button @click="reset">Reset</button>
      <button v-if="won && !free && level < missions.length-1" class="next" @click="choose(level+1)">Next mission →</button>
      <p role="status">{{ message }}</p>
    </div>
  </section>
  <aside class="toolbox">
    <div class="tool-heading"><h2>Parts tray</h2><small>{{ parts.length }}/18</small></div>
    <div class="part-buttons">
      <button v-for="type in toolTypes" :key="type" :class="type" :disabled="!available.includes(type)" @click="add(type)" :aria-label="'Add '+tools[type].name" :title="available.includes(type) ? tools[type].description : 'Locked for this mission'">
        <i aria-hidden="true">{{ available.includes(type) ? tools[type].symbol : '🔒' }}</i>{{ tools[type].name }}
      </button>
    </div>
    <details><summary>Adjust a part</summary>
      <div class="settings">
        <label>Selected part<select v-model="selected"><option v-if="!parts.length" :value="undefined">Add a part first</option><option v-for="(p,i) in parts" :key="p.id" :value="p.id">{{ i+1 }} · {{ tools[p.type].name }}</option></select></label>
        <template v-if="item"><div class="coords"><label>X<input type="number" min="45" max="955" :value="Math.round(item.x)" @change="update('x',$event.target.value)"></label><label>Y<input type="number" min="70" max="550" :value="Math.round(item.y)" @change="update('y',$event.target.value)"></label></div>
        <label>Angle · {{ item.angle }}°<input type="range" min="-90" max="90" step="5" :value="item.angle" @input="previewAngle" @change="finishAnglePreview" @pointercancel="finishAnglePreview" @blur="finishAnglePreview"></label>
        <button @click="remove">Remove part</button></template>
      </div>
    </details>
    <details><summary>Workshop options</summary>
      <div class="settings"><label>Motor &amp; fan power<select v-model.number="power" @change="reset"><option :value="0.5">Gentle</option><option :value="1">Regular</option><option :value="1.5">Turbo</option></select></label>
      <div class="paired"><button @click="save">Save build</button><button @click="load">Load build</button></div></div>
    </details>
    <div class="paired history"><button @click="undo" :disabled="!canUndo">↶ Undo</button><button @click="redo" :disabled="!canRedo">↷ Redo</button></div>
  </aside>
  <dialog ref="guide" @close="closeGuide" aria-labelledby="guide-title">
    <i class="pip-face" aria-hidden="true">◡</i><h2 id="guide-title">Feed Pip!</h2>
    <ol><li>Pick a part from the tray.</li><li>Drag it onto Pip’s path. Open <b>Adjust a part</b> to tilt it.</li><li>Press <b>Go, Pip!</b> Get Pip inside the pink snack box to win.</li></ol>
    <p>Keys · 1–6 add parts, arrows move, R rotates, Space runs, Esc resets, Z/Y undo or redo.</p>
    <button class="go" @click="guide.close()">Back to the bench</button>
  </dialog>
</main>`,
}).mount('#app');
