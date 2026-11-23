import Matter from 'matter-js';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;
export const STEP = 1000 / 120;
export const BALL_RADIUS = 17;
export const SPAWN = { x: 160, y: 100 };
export const BOX_DEPTH = 60;
export const BOX_WALL = 12;

export const tools = {
  ramp: {
    name: 'Ramp',
    symbol: '▰',
    description: 'Roll downhill',
    angle: 20,
    width: 300,
    height: 18,
    color: '#ffb83e',
  },
  fan: { name: 'Fan', symbol: '✣', description: 'Push with air', angle: -20 },
  gear: { name: 'Gear', symbol: '⚙', description: 'Powered spin', angle: 0 },
  platform: {
    name: 'Platform',
    symbol: '▬',
    description: 'Bridge a gap',
    angle: 0,
    width: 210,
    height: 20,
    color: '#65cbae',
  },
  bumper: {
    name: 'Bumper',
    symbol: '◆',
    description: 'Bounce & redirect',
    angle: 20,
    width: 140,
    height: 22,
    color: '#ff8585',
    restitution: 0.82,
  },
  spring: {
    name: 'Spring',
    symbol: '⇧',
    description: 'Launch Pip',
    angle: 20,
    width: 100,
    height: 24,
    color: '#70c8f0',
  },
};

const starter = ['ramp', 270, 230, 20];
const originalRoute = [
  starter,
  ['ramp', 530, 340, 20],
  ['fan', 510, 475, 0],
  ['gear', 680, 420, 0],
];
const benchFloor = [[500, 620, 1100, 40]];
const gapFloor = [
  [100, 620, 300, 40],
  [850, 620, 340, 40],
];

export const missions = [
  {
    name: 'The snack express',
    brief: 'Roll Pip into the pink snack box.',
    tip: 'A gentle slope turns a drop into a roll.',
    box: { x: 705, y: 480, width: 210 },
    route: originalRoute.slice(0, 2),
    required: [],
  },
  {
    name: 'Across the fizzy gap',
    brief: 'Use a fan to get Pip across the missing floor and into the box.',
    tip: 'Fans push inside the striped air zone. Rotate one to change its direction.',
    box: { x: 750, y: 480, width: 210 },
    floor: gapFloor,
    route: originalRoute.slice(0, 3),
    required: ['fan'],
  },
  {
    name: 'The power parade',
    brief: 'Ride a fan breeze and touch a powered gear before landing.',
    tip: 'The rotating edge of a gear can nudge Pip across the gap.',
    box: { x: 805, y: 480, width: 210 },
    floor: gapFloor,
    route: originalRoute,
    required: ['fan', 'gear'],
  },
  {
    name: 'Bridge builder',
    brief: 'Roll Pip across a platform suspended over the gap.',
    tip: 'Tilt a platform slightly so Pip rolls off the far end.',
    box: { x: 650, y: 450, width: 180 },
    floor: [
      [120, 620, 260, 40],
      [650, 620, 270, 40],
    ],
    route: [starter, ['platform', 431, 292, 12]],
    required: ['platform'],
  },
  {
    name: 'Bounce lab',
    brief: 'Bounce off a bumper and land inside the box.',
    tip: 'The bumper sends Pip away faster than a ramp. Change its angle to aim.',
    box: { x: 490, y: 510, width: 180 },
    route: [
      ['ramp', 270, 480, 20],
      ['bumper', 160, 280, 28],
    ],
    required: ['bumper'],
  },
  {
    name: 'Spring delivery',
    brief: 'Launch Pip from a spring into the raised box.',
    tip: 'A spring launches perpendicular to its surface. Tilt it right to send Pip right.',
    box: { x: 380, y: 310, width: 210 },
    floor: [
      [140, 620, 280, 40],
      [380, 386, 222, 20],
    ],
    route: [
      ['ramp', 350, 520, 20],
      ['spring', 160, 321, 16],
    ],
    required: ['spring'],
  },
];

export function blueprint(index) {
  return (missions[index] ?? missions[0]).route.map(
    ([type, x, y, angle], i) => ({
      id: i + 1,
      type,
      x,
      y,
      angle,
    }),
  );
}

export function createWorld(
  parts,
  index = 0,
  power = 1,
  onEvent = () => {},
  freeBuild = false,
) {
  const mission = missions[index] ?? missions[0];
  const engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.001 } });
  const add = (bodies) => Composite.add(engine.world, bodies);
  const floor = (mission.floor ?? benchFloor).map((dimensions) =>
    Bodies.rectangle(...dimensions, { isStatic: true }),
  );
  add([
    ...floor,
    Bodies.rectangle(-20, 300, 40, 700, { isStatic: true }),
    Bodies.rectangle(1020, 300, 40, 700, { isStatic: true }),
  ]);

  const { x, y, width } = mission.box;
  const bottom = y + BOX_DEPTH;
  const left = x - width / 2;
  const right = x + width / 2;
  const boxSurface = { isStatic: true, restitution: 0, friction: 0.6 };
  const box = [
    Bodies.rectangle(left, (y + bottom) / 2, BOX_WALL, bottom - y, boxSurface),
    Bodies.rectangle(right, (y + bottom) / 2, BOX_WALL, bottom - y, boxSurface),
    Bodies.rectangle(x, bottom, width + BOX_WALL, BOX_WALL, {
      ...boxSurface,
      label: 'box-base',
    }),
  ];
  add(box);

  const gears = [];
  const ramps = [];
  const fans = [];
  for (const part of parts) {
    const angle = (part.angle * Math.PI) / 180;
    if (part.type === 'fan') {
      fans.push(part);
    } else if (part.type === 'gear') {
      const gear = Bodies.polygon(part.x, part.y, 12, 49, {
        angle,
        friction: 1,
        restitution: 0.6,
        label: 'gear',
        density: 0.05,
      });
      add([
        gear,
        Constraint.create({
          pointA: { x: part.x, y: part.y },
          bodyB: gear,
          length: 0,
          stiffness: 1,
        }),
      ]);
      gears.push(gear);
    } else if (tools[part.type]?.width) {
      const tool = tools[part.type];
      const surface = Bodies.rectangle(
        part.x,
        part.y,
        tool.width,
        tool.height,
        {
          isStatic: true,
          angle,
          friction: 0.8,
          restitution: tool.restitution ?? 0.08,
          label: part.type,
        },
      );
      add(surface);
      ramps.push(surface);
    }
  }

  const ball = Bodies.circle(SPAWN.x, SPAWN.y, BALL_RADIUS, {
    restitution: 0.22,
    friction: 0.7,
    frictionStatic: 1,
    frictionAir: 0.002,
    label: 'ball',
  });
  add(ball);
  const used = new Set();
  let won = false;
  let elapsed = 0;
  let launch;
  let entered = false;
  let baseContact = false;

  function mark(type) {
    if (used.has(type)) return;
    used.add(type);
    onEvent(type);
  }

  Events.on(engine, 'collisionStart', ({ pairs }) => {
    for (const { bodyA, bodyB } of pairs) {
      if (bodyA !== ball && bodyB !== ball) continue;
      const surface = bodyA === ball ? bodyB : bodyA;
      if (surface.label !== 'spring' && Object.hasOwn(tools, surface.label))
        mark(surface.label);
      onEvent('bounce');
      if (surface.label === 'spring') {
        const normal = {
          x: Math.sin(surface.angle),
          y: -Math.cos(surface.angle),
        };
        const above =
          (ball.position.x - surface.position.x) * normal.x +
          (ball.position.y - surface.position.y) * normal.y;
        if (
          above > 0 &&
          ball.velocity.x * normal.x + ball.velocity.y * normal.y < 0
        ) {
          launch = { x: normal.x * 13, y: normal.y * 13 };
        }
      }
    }
  });

  Events.on(engine, 'collisionActive', ({ pairs }) => {
    baseContact = pairs.some(
      ({ bodyA, bodyB }) =>
        (bodyA === ball && bodyB === box[2]) ||
        (bodyB === ball && bodyA === box[2]),
    );
  });

  function step(dt = STEP) {
    if (won) return;
    elapsed += dt;
    for (const gear of gears) Body.setAngularVelocity(gear, 0.045 * power);
    for (const fan of fans) {
      const angle = (fan.angle * Math.PI) / 180;
      const dx = ball.position.x - fan.x;
      const dy = ball.position.y - fan.y;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if (along < -35 || along > 320 || Math.abs(across) >= 75) continue;
      Body.applyForce(ball, ball.position, {
        x: 0.0015 * power * Math.cos(angle),
        y: 0.0015 * power * Math.sin(angle) - 0.00035,
      });
      mark('fan');
    }

    const previousY = ball.position.y;
    baseContact = false;
    Engine.update(engine, dt);
    if (launch) {
      Body.setVelocity(ball, launch);
      mark('spring');
      launch = undefined;
    }
    const inside =
      ball.position.x > left + BOX_WALL / 2 + BALL_RADIUS - 1 &&
      ball.position.x < right - BOX_WALL / 2 - BALL_RADIUS + 1;
    if (ball.position.y < y) entered = false;
    if (inside && previousY < y && ball.position.y >= y) entered = true;
    if (
      entered &&
      inside &&
      baseContact &&
      ball.speed < 1.2 &&
      (freeBuild || mission.required.every((type) => used.has(type)))
    ) {
      won = true;
      onEvent('win');
    }
  }

  return {
    engine,
    ball,
    gears,
    ramps,
    fans,
    floor,
    box,
    step,
    get state() {
      return {
        won,
        fanHit: used.has('fan'),
        gearHit: used.has('gear'),
        used: [...used],
        elapsed,
        x: ball.position.x,
        y: ball.position.y,
        speed: ball.speed,
      };
    },
    destroy() {
      Events.off(engine);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    },
  };
}

export function clampPart(part) {
  return {
    ...part,
    x: Math.max(45, Math.min(955, part.x)),
    y: Math.max(70, Math.min(550, part.y)),
    angle: Math.max(-90, Math.min(90, part.angle)),
  };
}
