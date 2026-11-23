# Tiny Machines · Invention Workshop
An original full-screen illustrated physics game by John Parker. Build rolling paths for Pip with ramps, fans, powered gears, platforms, bumpers, and springs. Six missions, free build, pointer dragging, precise keyboard/numeric editing, undo/redo, run/pause/reset, local saves and optional synthesized audio.

## Run
Node 20.19+ or 22.12+. `npm ci`, `npm run dev`. `npm test` exercises real rigid-body mission solutions, failure paths, airflow and motor constraints. `npm run build` creates `dist` for Vercel's Vite preset.

## Controls
1–6 add ramp, fan, gear, platform, bumper, or spring. Select a part, then arrow keys move and R rotates. Space runs/pauses; Escape resets ball. Z/Y undo/redo. Pointer/touch drag edits parts; numeric X/Y and angle inputs offer precise alternatives. Sounds start only when opted in. Reduced motion disables transitions; physics animation remains necessary to play. No accounts, analytics or external data. Saves remain on the device.

## Engineering
Matter.js at fixed 120 Hz, bounded frame accumulation, restitution/friction collision response, constraint-pinned powered polygon gears and oriented fan force zones. Pip has angular motion and rolls on frictional surfaces. A delivery counts when Pip drops through the open top, settles on the physical box floor, and uses the mission’s required tools. World reconstruction cleanly resets bodies without mutating the editable model. Edit history snapshots are separate from runtime physics. The illustration is original generated artwork; interactive bodies are drawn in Canvas. Fictional physics for play, not engineering advice.
