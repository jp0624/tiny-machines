import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  BOX_DEPTH,
  BOX_WALL,
  STEP,
  createWorld,
  blueprint,
  clampPart,
  missions,
} from '../src/physics.js';

for (const [index, mission] of missions.entries()) {
  test(`Blueprint completes ${mission.name} by dropping into the box`, () => {
    const world = createWorld(blueprint(index), index);
    const { x, y, width } = mission.box;
    let enteredFromAbove = false;
    for (
      let elapsed = 0;
      elapsed < 16000 && !world.state.won;
      elapsed += STEP
    ) {
      const previousY = world.state.y;
      world.step();
      const state = world.state;
      if (
        previousY < y &&
        state.y >= y &&
        Math.abs(state.x - x) < width / 2 - BALL_RADIUS
      ) {
        enteredFromAbove = true;
      }
    }
    assert.equal(world.state.won, true);
    assert.equal(enteredFromAbove, true);
    assert.ok(
      Math.abs(world.state.y - (y + BOX_DEPTH - BOX_WALL / 2 - BALL_RADIUS)) <
        2,
    );
    for (const type of mission.required)
      assert.ok(world.state.used.includes(type));
    world.destroy();
  });
}

test('A failed route does not award a goal', () => {
  const world = createWorld([], 2);
  for (let n = 0; n < 1000; n++) world.step();
  assert.equal(world.state.won, false);
  assert.equal(world.state.gearHit, false);
  world.destroy();
});

test('Pip gains angular motion on a sloped ramp', () => {
  const world = createWorld(blueprint(0).slice(0, 1));
  for (let n = 0; n < 180; n++) world.step();
  assert.ok(world.state.used.includes('ramp'));
  assert.ok(world.state.x > 200);
  assert.ok(Math.abs(world.ball.angle) > Math.PI / 2);
  world.destroy();
});

test('Fan force changes the trajectory and the gear stays pinned', () => {
  const parts = blueprint(2);
  const a = createWorld(parts, 2);
  const b = createWorld(
    parts.filter((p) => p.type !== 'fan'),
    2,
  );
  for (let n = 0; n < 450; n++) {
    a.step();
    b.step();
  }
  assert.notEqual(a.state.x, b.state.x);
  assert.ok(Math.abs(a.gears[0].position.x - 680) < 3);
  a.destroy();
  b.destroy();
});

test('Editable bounds preserve the playfield', () => {
  assert.deepEqual(clampPart({ x: -90, y: 900, angle: 150 }), {
    x: 45,
    y: 550,
    angle: 90,
  });
});
