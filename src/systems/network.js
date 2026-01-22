window.Game = window.Game || {};
Game.net = Game.net || {};
Game.systems = Game.systems || {};

Game.net.getWebSocketUrl = function getWebSocketUrl() {
  if (Game.config?.network?.url) {
    return Game.config.network.url;
  }
  if (typeof window === "undefined" || !window.location) {
    return null;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
};

Game.net.getDefaultName = function getDefaultName(worldRef) {
  const stored = window.localStorage
    ? window.localStorage.getItem("playerName")
    : null;
  if (stored) {
    return stored;
  }
  const playerId = worldRef?.resources?.playerId;
  const label = playerId ? worldRef.components.Label.get(playerId) : null;
  if (label && label.text) {
    return label.text;
  }
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `player-${suffix}`;
};

Game.net.lerp = function lerp(a, b, t) {
  return a + (b - a) * t;
};

Game.net.lerpAngle = function lerpAngle(a, b, t) {
  const twoPi = Math.PI * 2;
  let diff = (b - a) % twoPi;
  if (diff > Math.PI) {
    diff -= twoPi;
  } else if (diff < -Math.PI) {
    diff += twoPi;
  }
  return a + diff * t;
};

Game.net.lerpFactor = function lerpFactor(base, dt) {
  if (!dt || dt <= 0) {
    return base;
  }
  const scaled = Math.max(0, dt * 60);
  return 1 - Math.pow(1 - base, scaled);
};

Game.net.normalizeState = function normalizeState(state, fallback) {
  const pos = state.pos || fallback?.pos || { x: 0, y: 0, z: 0 };
  const vel = state.vel || fallback?.vel || { x: 0, y: 0, z: 0 };
  return {
    pos: { x: pos.x ?? 0, y: pos.y ?? 0, z: pos.z ?? 0 },
    rotY: typeof state.rotY === "number" ? state.rotY : fallback?.rotY ?? 0,
    vel: { x: vel.x ?? 0, y: vel.y ?? 0, z: vel.z ?? 0 },
    name: state.name ?? fallback?.name ?? null,
  };
};

Game.net.connect = function connect(worldRef, options = {}) {
  if (!worldRef) {
    return;
  }
  const net = worldRef.resources.network;
  if (!net || net.socket || net.enabled === false) {
    return;
  }

  const url = options.url || Game.net.getWebSocketUrl();
  if (!url) {
    console.warn("No websocket URL configured.");
    return;
  }

  net.authoritative =
    options.authoritative ?? Game.config.network?.authoritative ?? net.authoritative;
  net.sendInterval =
    options.sendInterval ?? Game.config.network?.sendInterval ?? net.sendInterval;
  net.name = options.name || net.name || Game.net.getDefaultName(worldRef);
  net.remoteEntities = net.remoteEntities || new Map();
  net.localState = null;

  const socket = new WebSocket(url);
  net.socket = socket;
  net.connected = false;
  net.lastSentAt = 0;

  socket.addEventListener("open", () => {
    net.connected = true;
    socket.send(JSON.stringify({ type: "join", name: net.name }));
  });

  socket.addEventListener("message", (event) => {
    let msg = null;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      console.warn("Invalid network message", err);
      return;
    }
    Game.net.handleMessage(worldRef, msg);
  });

  socket.addEventListener("close", () => {
    net.connected = false;
    net.socket = null;
    net.id = null;
    net.localState = null;
    Game.net.clearRemotePlayers(worldRef);
  });

  socket.addEventListener("error", (err) => {
    console.warn("WebSocket error", err);
  });
};

Game.net.handleMessage = function handleMessage(worldRef, msg) {
  if (!worldRef || !msg) {
    return;
  }
  const net = worldRef.resources.network;
  if (!net) {
    return;
  }

  if (msg.type === "welcome") {
    net.id = msg.id || net.id;
    if (msg.name) {
      net.name = msg.name;
      if (window.localStorage) {
        window.localStorage.setItem("playerName", msg.name);
      }
    }
    const playerId = worldRef.resources.playerId;
    if (playerId && msg.name) {
      const label = worldRef.components.Label.get(playerId);
      if (label) {
        label.text = msg.name;
        worldRef.components.Label.set(playerId, label);
      }
    }
    return;
  }

  if (msg.type === "state") {
    Game.net.applyState(worldRef, msg.players || []);
  }
};

Game.net.applyState = function applyState(worldRef, players) {
  const net = worldRef.resources.network;
  if (!net || !net.id) {
    return;
  }
  const seen = new Set();
  for (const state of players) {
    if (!state || !state.id) {
      continue;
    }
    seen.add(state.id);
    if (state.id === net.id) {
      if (!net.authoritative) {
        continue;
      }
      const playerEntity = worldRef.resources.playerId;
      if (playerEntity) {
        Game.net.updatePlayerFromState(worldRef, playerEntity, state, true);
      }
      continue;
    }
    const remoteEntity = Game.net.ensureRemotePlayer(worldRef, state);
    Game.net.updatePlayerFromState(worldRef, remoteEntity, state, false);
  }

  for (const [id, entity] of net.remoteEntities.entries()) {
    if (!seen.has(id)) {
      Game.ecs.removeEntity(worldRef, entity);
      net.remoteEntities.delete(id);
    }
  }
};

Game.net.ensureRemotePlayer = function ensureRemotePlayer(worldRef, state) {
  const net = worldRef.resources.network;
  if (net.remoteEntities.has(state.id)) {
    return net.remoteEntities.get(state.id);
  }

  const entity = Game.ecs.createEntity(worldRef);
  const normalized = Game.net.normalizeState(state, null);
  const localPlayer = worldRef.resources.playerId;
  const baseCollider = localPlayer
    ? worldRef.components.Collider.get(localPlayer)
    : null;
  const baseSprite = localPlayer
    ? worldRef.components.BillboardSprite.get(localPlayer)
    : null;
  const baseRenderable = localPlayer
    ? worldRef.components.Renderable.get(localPlayer)
    : null;

  Game.ecs.addComponent(worldRef, "Transform", entity, {
    pos: { ...normalized.pos },
    rotY: normalized.rotY,
  });
  Game.ecs.addComponent(worldRef, "Velocity", entity, {
    x: normalized.vel.x,
    y: normalized.vel.y,
    z: normalized.vel.z,
  });
  Game.ecs.addComponent(worldRef, "Collider", entity, {
    w: baseCollider?.w ?? 1,
    d: baseCollider?.d ?? 1,
    h: baseCollider?.h ?? 1.5,
  });
  Game.ecs.addComponent(worldRef, "Renderable", entity, {
    color: baseRenderable?.color || [210, 90, 70],
    kind: "player",
  });
  const spriteFallback = {
    front: "playerFront",
    back: "playerBack",
    width: baseCollider?.w ?? 1,
    height: baseCollider?.h ?? 1.5,
    offsetY: (baseCollider?.h ?? 1.5) / 2,
    fps: 12,
    idleFrame: 0,
    alphaCutoff: 0.4,
  };
  Game.ecs.addComponent(worldRef, "BillboardSprite", entity, {
    ...(baseSprite || spriteFallback),
  });
  Game.ecs.addComponent(worldRef, "Label", entity, {
    text: normalized.name || state.id,
    color: null,
    offsetY: 0.1,
  });
  Game.ecs.addComponent(worldRef, "RemotePlayer", entity, {
    id: state.id,
    target: normalized,
    lastSeen: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });

  net.remoteEntities.set(state.id, entity);
  return entity;
};

Game.net.updatePlayerFromState = function updatePlayerFromState(
  worldRef,
  entity,
  state,
  isLocal
) {
  const net = worldRef.resources.network;
  const transform = worldRef.components.Transform.get(entity);
  const vel = worldRef.components.Velocity.get(entity);
  const fallback = {
    pos: transform?.pos,
    rotY: transform?.rotY,
    vel: vel ? { x: vel.x, y: vel.y, z: vel.z } : null,
    name: state?.name ?? null,
  };
  const normalized = Game.net.normalizeState(state, fallback);

  if (isLocal) {
    if (net) {
      net.localState = normalized;
    }
  } else {
    const remote = worldRef.components.RemotePlayer.get(entity);
    if (remote) {
      if (!remote.target && transform) {
        transform.pos = { ...normalized.pos };
        transform.rotY = normalized.rotY;
        worldRef.components.Transform.set(entity, transform);
      }
      if (!remote.target && vel) {
        vel.x = normalized.vel.x;
        vel.y = normalized.vel.y;
        vel.z = normalized.vel.z;
        worldRef.components.Velocity.set(entity, vel);
      }
      remote.target = normalized;
      remote.lastSeen = typeof performance !== "undefined" ? performance.now() : Date.now();
      worldRef.components.RemotePlayer.set(entity, remote);
    }
  }

  if (normalized.name) {
    const label = worldRef.components.Label.get(entity);
    if (label) {
      label.text = normalized.name;
      worldRef.components.Label.set(entity, label);
    }
  }

  if (isLocal && normalized.name && net && normalized.name !== net.name) {
    net.name = normalized.name;
  }
};

Game.net.clearRemotePlayers = function clearRemotePlayers(worldRef) {
  const net = worldRef.resources.network;
  if (!net || !net.remoteEntities) {
    return;
  }
  for (const entity of net.remoteEntities.values()) {
    Game.ecs.removeEntity(worldRef, entity);
  }
  net.remoteEntities.clear();
};

Game.net.stepSmoothing = function stepSmoothing(worldRef, dt) {
  const net = worldRef.resources.network;
  if (!net || !net.connected) {
    return;
  }
  const smoothing = net.smoothing || {};
  const localLerp = Game.net.lerpFactor(smoothing.local ?? 0.35, dt);
  const localRotLerp = Game.net.lerpFactor(smoothing.localRot ?? 0.35, dt);
  const localVelLerp = Game.net.lerpFactor(smoothing.localVel ?? 0.35, dt);
  const remoteLerp = Game.net.lerpFactor(smoothing.remote ?? 0.2, dt);
  const remoteRotLerp = Game.net.lerpFactor(smoothing.remoteRot ?? 0.25, dt);
  const remoteVelLerp = Game.net.lerpFactor(smoothing.remoteVel ?? 0.2, dt);
  const snapDistance = smoothing.snapDistance ?? 0.75;

  if (net.authoritative && net.localState) {
    const playerId = worldRef.resources.playerId;
    const transform = playerId
      ? worldRef.components.Transform.get(playerId)
      : null;
    const vel = playerId ? worldRef.components.Velocity.get(playerId) : null;
    if (transform) {
      const target = net.localState;
      const dx = target.pos.x - transform.pos.x;
      const dy = target.pos.y - transform.pos.y;
      const dz = target.pos.z - transform.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > snapDistance) {
        transform.pos = { ...target.pos };
      } else {
        transform.pos.x += dx * localLerp;
        transform.pos.y += dy * localLerp;
        transform.pos.z += dz * localLerp;
      }
      transform.rotY = Game.net.lerpAngle(
        transform.rotY,
        target.rotY ?? transform.rotY,
        localRotLerp
      );
      worldRef.components.Transform.set(playerId, transform);
    }
    if (vel && net.localState.vel) {
      vel.x = Game.net.lerp(vel.x, net.localState.vel.x, localVelLerp);
      vel.y = Game.net.lerp(vel.y, net.localState.vel.y, localVelLerp);
      vel.z = Game.net.lerp(vel.z, net.localState.vel.z, localVelLerp);
      worldRef.components.Velocity.set(playerId, vel);
    }
  }

  for (const [entity, remote] of worldRef.components.RemotePlayer.entries()) {
    const target = remote?.target;
    if (!target || !target.pos) {
      continue;
    }
    const transform = worldRef.components.Transform.get(entity);
    const vel = worldRef.components.Velocity.get(entity);
    if (transform) {
      const dx = target.pos.x - transform.pos.x;
      const dy = target.pos.y - transform.pos.y;
      const dz = target.pos.z - transform.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > snapDistance) {
        transform.pos = { ...target.pos };
      } else {
        transform.pos.x += dx * remoteLerp;
        transform.pos.y += dy * remoteLerp;
        transform.pos.z += dz * remoteLerp;
      }
      transform.rotY = Game.net.lerpAngle(
        transform.rotY,
        target.rotY ?? transform.rotY,
        remoteRotLerp
      );
      worldRef.components.Transform.set(entity, transform);
    }
    if (vel && target.vel) {
      vel.x = Game.net.lerp(vel.x, target.vel.x, remoteVelLerp);
      vel.y = Game.net.lerp(vel.y, target.vel.y, remoteVelLerp);
      vel.z = Game.net.lerp(vel.z, target.vel.z, remoteVelLerp);
      worldRef.components.Velocity.set(entity, vel);
    }
  }
};

Game.systems.networkInputSystem = function networkInputSystem(worldRef) {
  const net = worldRef.resources.network;
  if (!net || !net.connected || !net.socket) {
    return;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const intervalMs = (net.sendInterval || 0.05) * 1000;
  if (now - net.lastSentAt < intervalMs) {
    return;
  }

  const playerId = worldRef.resources.playerId;
  const move = playerId ? worldRef.components.MoveIntent.get(playerId) : null;
  if (!move) {
    return;
  }

  const payload = {
    type: "input",
    turn: move.turn ?? 0,
    throttle: move.throttle ?? 0,
    jump: move.jumpRequested ? 1 : 0,
  };

  try {
    if (net.authoritative) {
      net.socket.send(JSON.stringify(payload));
    } else {
      const playerId = worldRef.resources.playerId;
      const transform = playerId
        ? worldRef.components.Transform.get(playerId)
        : null;
      const vel = playerId ? worldRef.components.Velocity.get(playerId) : null;
      if (transform) {
        const statePayload = {
          type: "state",
          pos: transform.pos,
          rotY: transform.rotY,
          vel: vel ? { x: vel.x, y: vel.y, z: vel.z } : { x: 0, y: 0, z: 0 },
          name: net.name,
        };
        net.socket.send(JSON.stringify(statePayload));
      }
    }
    net.lastSentAt = now;
  } catch (err) {
    console.warn("Failed to send input", err);
  }
};

Game.systems.networkSmoothingSystem = function networkSmoothingSystem(
  worldRef,
  dt
) {
  Game.net.stepSmoothing(worldRef, dt);
};
