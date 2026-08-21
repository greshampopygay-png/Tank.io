import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, players: players.size }));

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

const WORLD = { w: 2400, h: 1400 };
const TICK = 30;
const PLAYER_SPEED = 280;
const TANK_RADIUS = 28;
const BULLET_SPEED = 760;
const BULLET_LIFE = 1.6;
const FIRE_COOLDOWN = 0.28;

const players = new Map();
const bullets = new Map();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}
function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(msg);
}
function spawnPosition() {
  const side = Math.random() < 0.5 ? 0 : 1;
  return {
    x: side ? WORLD.w - 180 : 180,
    y: 180 + Math.random() * (WORLD.h - 360)
  };
}
function safeName(name) {
  const n = String(name || "Player").replace(/[^\p{L}\p{N}_ -]/gu, "").trim();
  return n.slice(0, 16) || "Player";
}

wss.on("connection", (ws) => {
  const id = crypto.randomUUID();
  const pos = spawnPosition();

  const player = {
    id, ws, name: "Player",
    x: pos.x, y: pos.y, angle: 0,
    hp: 100, score: 0, kills: 0, deaths: 0,
    input: { up:false, down:false, left:false, right:false, fire:false, aim:0 },
    lastShot: 0
  };
  players.set(id, player);

  send(ws, { type:"welcome", id, world: WORLD });
  broadcast({ type:"system", text:`Игрок ${player.name} подключился.` });

  ws.on("message", raw => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === "join") {
        const old = player.name;
        player.name = safeName(m.name);
        if (old !== player.name) broadcast({ type:"system", text:`${player.name} вошёл в бой.` });
      }

      if (m.type === "input") {
        const i = m.input || {};
        player.input.up = !!i.up;
        player.input.down = !!i.down;
        player.input.left = !!i.left;
        player.input.right = !!i.right;
        player.input.fire = !!i.fire;
        if (Number.isFinite(i.aim)) player.input.aim = i.aim;
      }
    } catch {}
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type:"system", text:`${player.name} покинул бой.` });
  });
});

function respawn(p) {
  const pos = spawnPosition();
  p.x = pos.x; p.y = pos.y; p.hp = 100;
}

function update(dt) {
  const now = performance.now() / 1000;

  for (const p of players.values()) {
    let dx = (p.input.right ? 1 : 0) - (p.input.left ? 1 : 0);
    let dy = (p.input.down ? 1 : 0) - (p.input.up ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    if (dx || dy) {
      dx /= len; dy /= len;
      p.x = clamp(p.x + dx * PLAYER_SPEED * dt, TANK_RADIUS, WORLD.w - TANK_RADIUS);
      p.y = clamp(p.y + dy * PLAYER_SPEED * dt, TANK_RADIUS, WORLD.h - TANK_RADIUS);
    }
    p.angle = Number.isFinite(p.input.aim) ? p.input.aim : p.angle;

    if (p.input.fire && now - p.lastShot >= FIRE_COOLDOWN) {
      p.lastShot = now;
      const id = crypto.randomUUID();
      bullets.set(id, {
        id, owner:p.id,
        x:p.x + Math.cos(p.angle)*38,
        y:p.y + Math.sin(p.angle)*38,
        vx:Math.cos(p.angle)*BULLET_SPEED,
        vy:Math.sin(p.angle)*BULLET_SPEED,
        life:BULLET_LIFE
      });
    }
  }

  for (const [id, b] of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h) {
      bullets.delete(id);
      continue;
    }

    let hit = false;
    for (const p of players.values()) {
      if (p.id === b.owner || p.hp <= 0) continue;
      if (dist2(b, p) <= (TANK_RADIUS + 8) ** 2) {
        p.hp -= 25;
        hit = true;
        const shooter = players.get(b.owner);
        if (p.hp <= 0) {
          p.deaths++;
          if (shooter) { shooter.kills++; shooter.score += 100; }
          broadcast({ type:"kill", killer: shooter?.name || "Player", victim:p.name });
          respawn(p);
        }
        break;
      }
    }
    if (hit) bullets.delete(id);
  }
}

setInterval(() => update(1 / TICK), 1000 / TICK);

setInterval(() => {
  const state = {
    type:"state",
    players: [...players.values()].map(p => ({
      id:p.id, name:p.name, x:p.x, y:p.y, angle:p.angle,
      hp:p.hp, score:p.score, kills:p.kills, deaths:p.deaths
    })),
    bullets: [...bullets.values()].map(b => ({ x:b.x, y:b.y }))
  };
  broadcast(state);
}, 1000 / 20);

server.listen(PORT, HOST, () => {
  console.log(`TANCHIKI.io server listening on http://${HOST}:${PORT}`);
});