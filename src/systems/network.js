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
    pos: { x: state.pos?.x ?? 0, y: state.pos?.y ?? 1, z: state.pos?.z ?? 0 },
    rotY: state.rotY ?? 0,
  });
  Game.ecs.addComponent(worldRef, "Velocity", entity, {
    x: state.vel?.x ?? 0,
    y: state.vel?.y ?? 0,
    z: state.vel?.z ?? 0,
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
    text: state.name || state.id,
    color: null,
    offsetY: 0.1,
  });
  Game.ecs.addComponent(worldRef, "RemotePlayer", entity, {
    id: state.id,
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
  const transform = worldRef.components.Transform.get(entity);
  if (transform && state.pos) {
    transform.pos = {
      x: state.pos.x ?? transform.pos.x,
      y: state.pos.y ?? transform.pos.y,
      z: state.pos.z ?? transform.pos.z,
    };
    if (typeof state.rotY === "number") {
      transform.rotY = state.rotY;
    }
    worldRef.components.Transform.set(entity, transform);
  }

  const vel = worldRef.components.Velocity.get(entity);
  if (vel && state.vel) {
    vel.x = state.vel.x ?? 0;
    vel.y = state.vel.y ?? 0;
    vel.z = state.vel.z ?? 0;
    worldRef.components.Velocity.set(entity, vel);
  }

  if (state.name) {
    const label = worldRef.components.Label.get(entity);
    if (label) {
      label.text = state.name;
      worldRef.components.Label.set(entity, label);
    }
  }

  if (isLocal && state.name) {
    const net = worldRef.resources.network;
    if (net && state.name !== net.name) {
      net.name = state.name;
    }
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

Game.systems.networkSystem = function networkSystem(worldRef) {
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
    net.socket.send(JSON.stringify(payload));
    net.lastSentAt = now;
  } catch (err) {
    console.warn("Failed to send input", err);
  }

  if (move.jumpRequested) {
    move.jumpRequested = false;
    worldRef.components.MoveIntent.set(playerId, move);
  }
};
