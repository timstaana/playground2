window.Game = window.Game || {};
Game.ecs = Game.ecs || {};

Game.ecs.createWorld = function createWorld() {
  return {
    nextEntityId: 1,
    entities: new Set(),
    components: {
      Transform: new Map(),
      Velocity: new Map(),
      MoveIntent: new Map(),
      Gravity: new Map(),
      Collider: new Map(),
      Renderable: new Map(),
      BillboardSprite: new Map(),
      Player: new Map(),
      RemotePlayer: new Map(),
      NPC: new Map(),
      Painting: new Map(),
      Interaction: new Map(),
      Lightbox: new Map(),
      Dialogue: new Map(),
      DialogueState: new Map(),
      DialogueFacing: new Map(),
      Highlight: new Map(),
      Label: new Map(),
      Speed: new Map(),
      TurnSpeed: new Map(),
      Jump: new Map(),
      CameraFollow: new Map(),
      CameraRig: new Map(),
      StaticBlock: new Map(),
    },
    resources: {
      blockSet: new Set(),
      playerId: null,
      cameraId: null,
      textures: {
        playerFront: null,
        playerBack: null,
      },
      cameraState: {
        pos: { x: 0, y: 0, z: 0 },
        lookAt: { x: 0, y: 0, z: 0 },
        fov: Math.PI / 3,
        aspect: 1,
      },
      debugCamera: {
        active: false,
        pos: { x: 0, y: 0, z: 0 },
        yaw: 0,
        pitch: 0,
        speed: 6,
        sensitivity: 0.004,
        maxPitch: Math.PI * 0.495,
      },
      rendering: {
        occluderAlpha: 0.35,
        occluderDitherScale: 1,
        occluderConeRadius: 1.4,
        occluderConeHeight: 0.9,
        occluderConeSamples: 12,
        occluderConeRings: 3,
        occluderConeHeights: 3,
        occluderFadeDistance: 3.5,
        occluderAmbient: 150 / 255,
        blockAoEnabled: true,
        blockAoStep: 0.12,
        blockAoMin: 0.55,
      },
      paintingStreaming: {
        loadRadius: 6,
        indicatorRadius: 6,
        maxConcurrent: 2,
        loading: new Map(),
        failed: new Set(),
        pending: new Map(),
        pendingPerFrame: 1,
      },
      network: {
        enabled: true,
        connected: false,
        authoritative: false,
        id: null,
        name: null,
        socket: null,
        sendInterval: 0.016,
        lastSentAt: 0,
        remoteEntities: new Map(),
        localState: null,
        smoothing: {
          local: 0.35,
          localRot: 0.35,
          localVel: 0.35,
          remote: 0.2,
          remoteRot: 0.25,
          remoteVel: 0.2,
          snapDistance: 0.75,
        },
      },
      interactionFocus: {
        targetId: null,
        weight: 0,
      },
    },
  };
};

Game.ecs.createEntity = function createEntity(worldRef) {
  const id = worldRef.nextEntityId++;
  worldRef.entities.add(id);
  return id;
};

Game.ecs.addComponent = function addComponent(worldRef, name, entity, data) {
  worldRef.components[name].set(entity, data);
  return data;
};

Game.ecs.removeEntity = function removeEntity(worldRef, entity) {
  if (!worldRef || !worldRef.entities.has(entity)) {
    return;
  }
  worldRef.entities.delete(entity);
  for (const map of Object.values(worldRef.components)) {
    map.delete(entity);
  }
};
