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
