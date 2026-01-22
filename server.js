const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const levelPath = path.join(__dirname, "levels", "level1.json");
let level = {};
try {
  level = JSON.parse(fs.readFileSync(levelPath, "utf8"));
} catch (err) {
  console.error("Failed to load level data", err);
}

const gravity = level.gravity ?? 18;
const playerDef = level.player || {};
const playerSize = playerDef.size || { w: 1, d: 1, h: 1.5 };
const playerSpeed = playerDef.speed ?? 4;
const playerTurnSpeed = playerDef.turnSpeed ?? 2.6;
const jumpHeight = playerDef.jumpHeight ?? 1.5;
const jumpVelocity = Math.sqrt(2 * gravity * jumpHeight);
const spawn = playerDef.spawn || { x: 2.5, y: 1, z: 2.5 };

const blockSet = new Set();
for (const block of level.blocks || []) {
  blockSet.add(blockKey(block.x, block.y, block.z));
}

const players = new Map();
let nextPlayerId = 1;

const TICK_RATE = 30;
const TICK_DT = 1 / TICK_RATE;

function blockKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function isBlockAt(x, y, z) {
  return blockSet.has(blockKey(x, y, z));
}

function forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, fn) {
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);

  for (let y = y0; y <= y1; y += 1) {
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (isBlockAt(x, y, z)) {
          fn(x, y, z);
        }
      }
    }
  }
}

function spawnPosition(index) {
  const ring = Math.floor(index / 8);
  const slot = index % 8;
  const angle = (slot / 8) * Math.PI * 2;
  const radius = 0.4 + ring * 0.5;
  return {
    x: spawn.x + Math.cos(angle) * radius,
    y: spawn.y,
    z: spawn.z + Math.sin(angle) * radius,
  };
}

function sanitizeName(name) {
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim().slice(0, 16);
  return trimmed.length > 0 ? trimmed : null;
}

function createPlayer(id, name) {
  const pos = spawnPosition(players.size);
  return {
    id,
    name: name || `player-${id}`,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    rotY: 0,
    vel: { x: 0, y: 0, z: 0 },
    grounded: false,
    input: { turn: 0, throttle: 0, jump: false },
  };
}

function simulatePlayer(player, dt) {
  player.rotY += player.input.turn * playerTurnSpeed * dt;

  const forwardX = Math.sin(player.rotY);
  const forwardZ = -Math.cos(player.rotY);
  player.vel.x = forwardX * playerSpeed * player.input.throttle;
  player.vel.z = forwardZ * playerSpeed * player.input.throttle;

  if (player.input.jump && player.grounded) {
    player.vel.y = jumpVelocity;
    player.grounded = false;
  }
  player.input.jump = false;

  player.vel.y -= gravity * dt;

  resolvePhysics(player, dt);
}

function resolvePhysics(player, dt) {
  const collider = playerSize;
  const halfW = collider.w / 2;
  const halfD = collider.d / 2;
  const eps = 1e-4;
  const pos = { ...player.pos };
  const vel = player.vel;
  let grounded = false;

  if (vel.x !== 0) {
    let nextX = pos.x + vel.x * dt;
    const minX = nextX - halfW + eps;
    const maxX = nextX + halfW - eps;
    const minY = pos.y + eps;
    const maxY = pos.y + collider.h - eps;
    const minZ = pos.z - halfD + eps;
    const maxZ = pos.z + halfD - eps;

    if (vel.x > 0) {
      let closest = Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (x) => {
        if (x < closest) {
          closest = x;
        }
      });
      if (closest !== Infinity) {
        nextX = Math.min(nextX, closest - halfW);
        vel.x = 0;
      }
    } else {
      let closest = -Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (x) => {
        const edge = x + 1;
        if (edge > closest) {
          closest = edge;
        }
      });
      if (closest !== -Infinity) {
        nextX = Math.max(nextX, closest + halfW);
        vel.x = 0;
      }
    }
    pos.x = nextX;
  }

  if (vel.z !== 0) {
    let nextZ = pos.z + vel.z * dt;
    const minX = pos.x - halfW + eps;
    const maxX = pos.x + halfW - eps;
    const minY = pos.y + eps;
    const maxY = pos.y + collider.h - eps;
    const minZ = nextZ - halfD + eps;
    const maxZ = nextZ + halfD - eps;

    if (vel.z > 0) {
      let closest = Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (_x, _y, z) => {
        if (z < closest) {
          closest = z;
        }
      });
      if (closest !== Infinity) {
        nextZ = Math.min(nextZ, closest - halfD);
        vel.z = 0;
      }
    } else {
      let closest = -Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (_x, _y, z) => {
        const edge = z + 1;
        if (edge > closest) {
          closest = edge;
        }
      });
      if (closest !== -Infinity) {
        nextZ = Math.max(nextZ, closest + halfD);
        vel.z = 0;
      }
    }
    pos.z = nextZ;
  }

  if (vel.y !== 0) {
    let nextY = pos.y + vel.y * dt;
    const minX = pos.x - halfW + eps;
    const maxX = pos.x + halfW - eps;
    const minY = nextY + eps;
    const maxY = nextY + collider.h - eps;
    const minZ = pos.z - halfD + eps;
    const maxZ = pos.z + halfD - eps;

    if (vel.y > 0) {
      let closest = Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (_x, y) => {
        if (y < closest) {
          closest = y;
        }
      });
      if (closest !== Infinity) {
        nextY = Math.min(nextY, closest - collider.h);
        vel.y = 0;
      }
    } else {
      let closest = -Infinity;
      forEachBlockInAabb(minX, maxX, minY, maxY, minZ, maxZ, (_x, y) => {
        const edge = y + 1;
        if (edge > closest) {
          closest = edge;
        }
      });
      if (closest !== -Infinity) {
        nextY = Math.max(nextY, closest);
        vel.y = 0;
        grounded = true;
      }
    }
    pos.y = nextY;
  }

  player.pos = pos;
  player.vel = vel;
  player.grounded = grounded;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function broadcastState() {
  const snapshot = [];
  for (const player of players.values()) {
    snapshot.push({
      id: player.id,
      name: player.name,
      pos: player.pos,
      rotY: player.rotY,
      vel: player.vel,
    });
  }
  const payload = JSON.stringify({ type: "state", players: snapshot });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on("connection", (ws) => {
  const id = `p${nextPlayerId++}`;
  const player = createPlayer(id, null);
  players.set(id, player);
  ws.playerId = id;

  ws.send(JSON.stringify({ type: "welcome", id, name: player.name }));

  ws.on("message", (data) => {
    let msg = null;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      return;
    }
    if (!msg || typeof msg.type !== "string") {
      return;
    }

    if (msg.type === "join") {
      const requested = sanitizeName(msg.name);
      if (requested) {
        player.name = requested;
      }
      return;
    }

    if (msg.type === "input") {
      player.input.turn = clamp(msg.turn ?? 0, -1, 1);
      player.input.throttle = clamp(msg.throttle ?? 0, -1, 1);
      if (msg.jump) {
        player.input.jump = true;
      }
    }
  });

  ws.on("close", () => {
    players.delete(id);
  });
});

setInterval(() => {
  for (const player of players.values()) {
    simulatePlayer(player, TICK_DT);
  }
  broadcastState();
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
