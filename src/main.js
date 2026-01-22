let levelData;
let world;
let loading = true;
let loadError = null;
let gridSize = 50;
let assetStatus = null;
let uiFont = null;
let spriteShader = null;
let occluderShader = null;

const SPRITE_VERT = `
precision mediump float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const SPRITE_FRAG = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uAlphaCutoff;
varying vec2 vTexCoord;
void main() {
  vec4 texColor = texture2D(uTexture, vTexCoord);
  if (texColor.a < uAlphaCutoff) {
    discard;
  }
  gl_FragColor = vec4(texColor.rgb, 1.0);
}
`;

const OCCLUDER_VERT = `
precision mediump float;
attribute vec3 aPosition;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
void main() {
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const OCCLUDER_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uDitherScale;
uniform float uAmbient;
float bayer4(vec2 p) {
  p = mod(p, 4.0);
  float x = p.x;
  float y = p.y;
  float v = 0.0;
  if (x < 1.0 && y < 1.0) v = 0.0;
  else if (x < 2.0 && y < 1.0) v = 8.0;
  else if (x < 3.0 && y < 1.0) v = 2.0;
  else if (x < 4.0 && y < 1.0) v = 10.0;
  else if (x < 1.0 && y < 2.0) v = 12.0;
  else if (x < 2.0 && y < 2.0) v = 4.0;
  else if (x < 3.0 && y < 2.0) v = 14.0;
  else if (x < 4.0 && y < 2.0) v = 6.0;
  else if (x < 1.0 && y < 3.0) v = 3.0;
  else if (x < 2.0 && y < 3.0) v = 11.0;
  else if (x < 3.0 && y < 3.0) v = 1.0;
  else if (x < 4.0 && y < 3.0) v = 9.0;
  else if (x < 1.0 && y < 4.0) v = 15.0;
  else if (x < 2.0 && y < 4.0) v = 7.0;
  else if (x < 3.0 && y < 4.0) v = 13.0;
  else v = 5.0;
  return v / 16.0;
}
void main() {
  float threshold = bayer4(floor(gl_FragCoord.xy / max(uDitherScale, 1.0)));
  if (threshold > uAlpha) {
    discard;
  }
  vec3 litColor = uColor * uAmbient;
  gl_FragColor = vec4(litColor, 1.0);
}
`;

const inputState = {
  jumpHeld: false,
};

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  spriteShader = createSpriteShader();
  occluderShader = createOccluderShader();
  frameRate(60);

  loadLevel();
}

function draw() {
  const dt = Math.min(0.033, deltaTime / 1000);

  background(180, 210, 240);

  if (loading) {
    drawLoading();
    return;
  }

  if (!world) {
    drawLoading();
    return;
  }

  updateSystems(world, dt);
  renderSystem(world);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

async function loadLevel() {
  try {
    const response = await fetch("levels/level1.json");
    if (!response.ok) {
      throw new Error(`Failed to load level: ${response.status}`);
    }
    levelData = await response.json();
  } catch (err) {
    loadError = err;
    console.error(err);
    levelData = {};
  }

  assetStatus = await loadAssets(levelData || {});
  uiFont = assetStatus.uiFont || null;
  world = createWorld();
  world.resources.textures.playerFront = assetStatus.front;
  world.resources.textures.playerBack = assetStatus.back;
  buildLevel(world, levelData || {});
  loading = false;
}

function createWorld() {
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
    },
  };
}

function createEntity(worldRef) {
  const id = worldRef.nextEntityId++;
  worldRef.entities.add(id);
  return id;
}

function addComponent(worldRef, name, entity, data) {
  worldRef.components[name].set(entity, data);
  return data;
}

function updateSystems(worldRef, dt) {
  inputSystem(worldRef);
  cameraControlSystem(worldRef, dt);
  movementSystem(worldRef, dt);
  gravitySystem(worldRef, dt);
  physicsSystem(worldRef, dt);
  cameraSystem(worldRef);
}

function buildLevel(worldRef, level) {
  gridSize = level.gridSize || gridSize;

  const gravityValue = level.gravity ?? 18;
  const playerDef = level.player || {};
  const playerSpriteDef = playerDef.sprite || {};
  const renderingDef = level.rendering || {};
  const playerSize = playerDef.size || { w: 1, d: 1, h: 1.5 };
  const playerSpeed = playerDef.speed ?? 4;
  const playerTurnSpeed = playerDef.turnSpeed ?? 2.6;
  const jumpHeight = playerDef.jumpHeight ?? 1.5;
  const spawn = playerDef.spawn || { x: 2.5, y: 1, z: 2.5 };

  worldRef.resources.rendering.occluderAlpha =
    renderingDef.occluderAlpha ?? worldRef.resources.rendering.occluderAlpha;
  worldRef.resources.rendering.occluderDitherScale =
    renderingDef.occluderDitherScale ??
    worldRef.resources.rendering.occluderDitherScale;
  worldRef.resources.rendering.occluderConeRadius =
    renderingDef.occluderConeRadius ??
    worldRef.resources.rendering.occluderConeRadius;
  worldRef.resources.rendering.occluderConeHeight =
    renderingDef.occluderConeHeight ??
    worldRef.resources.rendering.occluderConeHeight;
  worldRef.resources.rendering.occluderConeSamples =
    renderingDef.occluderConeSamples ??
    worldRef.resources.rendering.occluderConeSamples;
  worldRef.resources.rendering.occluderConeRings =
    renderingDef.occluderConeRings ??
    worldRef.resources.rendering.occluderConeRings;
  worldRef.resources.rendering.occluderConeHeights =
    renderingDef.occluderConeHeights ??
    worldRef.resources.rendering.occluderConeHeights;
  worldRef.resources.rendering.occluderFadeDistance =
    renderingDef.occluderFadeDistance ??
    worldRef.resources.rendering.occluderFadeDistance;
  worldRef.resources.rendering.occluderAmbient =
    renderingDef.occluderAmbient ?? worldRef.resources.rendering.occluderAmbient;

  const blocks = level.blocks || [];
  for (const block of blocks) {
    const blockEntity = createEntity(worldRef);
    addComponent(worldRef, "Transform", blockEntity, {
      pos: { x: block.x + 0.5, y: block.y, z: block.z + 0.5 },
      rotY: 0,
    });
    addComponent(worldRef, "Collider", blockEntity, { w: 1, d: 1, h: 1 });
    addComponent(worldRef, "Renderable", blockEntity, {
      color: block.color || [110, 145, 110],
      kind: "block",
    });
    addComponent(worldRef, "StaticBlock", blockEntity, {});
    worldRef.resources.blockSet.add(blockKey(block.x, block.y, block.z));
  }

  const player = createEntity(worldRef);
  addComponent(worldRef, "Transform", player, {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    rotY: 0,
  });
  addComponent(worldRef, "Velocity", player, { x: 0, y: 0, z: 0 });
  addComponent(worldRef, "MoveIntent", player, {
    throttle: 0,
    turn: 0,
    jumpRequested: false,
    grounded: false,
  });
  addComponent(worldRef, "Gravity", player, { value: gravityValue });
  addComponent(worldRef, "Collider", player, {
    w: playerSize.w,
    d: playerSize.d,
    h: playerSize.h,
  });
  addComponent(worldRef, "Renderable", player, {
    color: [210, 90, 70],
    kind: "player",
  });
  addComponent(worldRef, "BillboardSprite", player, {
    front: playerSpriteDef.frontKey || "playerFront",
    back: playerSpriteDef.backKey || "playerBack",
    width: playerSpriteDef.width ?? playerSize.w,
    height: playerSpriteDef.height ?? playerSize.h,
    offsetY:
      playerSpriteDef.offsetY ?? (playerSpriteDef.height ?? playerSize.h) / 2,
    fps: playerSpriteDef.fps ?? 12,
    idleFrame: playerSpriteDef.idleFrame ?? 0,
    alphaCutoff: playerSpriteDef.alphaCutoff ?? 0.4,
  });
  addComponent(worldRef, "Speed", player, { value: playerSpeed });
  addComponent(worldRef, "TurnSpeed", player, { value: playerTurnSpeed });
  addComponent(worldRef, "Jump", player, {
    velocity: Math.sqrt(2 * gravityValue * jumpHeight),
  });
  addComponent(worldRef, "Player", player, {});
  worldRef.resources.playerId = player;

  const npcDefs = level.npcs || [];
  const defaultFrontKey = playerSpriteDef.frontKey || "playerFront";
  const defaultBackKey = playerSpriteDef.backKey || "playerBack";

  for (let i = 0; i < npcDefs.length; i += 1) {
    const npcDef = npcDefs[i];
    const npc = createEntity(worldRef);
    const npcSpawn = npcDef.spawn || { x: 1.5, y: 1, z: 1.5 };
    const npcSize = npcDef.size || playerSize;
    const npcSprite = npcDef.sprite || {};

    addComponent(worldRef, "Transform", npc, {
      pos: { x: npcSpawn.x, y: npcSpawn.y, z: npcSpawn.z },
      rotY: npcDef.yaw ?? 0,
    });
    addComponent(worldRef, "Collider", npc, {
      w: npcSize.w,
      d: npcSize.d,
      h: npcSize.h,
    });
    addComponent(worldRef, "Renderable", npc, {
      color: npcDef.color || [70, 110, 200],
      kind: "npc",
    });
    addComponent(worldRef, "BillboardSprite", npc, {
      front: npcSprite.frontKey || defaultFrontKey,
      back: npcSprite.backKey || defaultBackKey,
      width: npcSprite.width ?? npcSize.w,
      height: npcSprite.height ?? npcSize.h,
      offsetY: npcSprite.offsetY ?? (npcSprite.height ?? npcSize.h) / 2,
      fps: npcSprite.fps ?? playerSpriteDef.fps ?? 12,
      idleFrame: npcSprite.idleFrame ?? playerSpriteDef.idleFrame ?? 0,
      alphaCutoff:
        npcSprite.alphaCutoff ?? playerSpriteDef.alphaCutoff ?? 0.4,
    });
    addComponent(worldRef, "NPC", npc, {
      id: npcDef.id || `npc-${i + 1}`,
    });
  }

  const cameraDef = level.camera || {};
  const cameraEntity = createEntity(worldRef);
  addComponent(worldRef, "Transform", cameraEntity, {
    pos: { x: spawn.x, y: spawn.y + 2, z: spawn.z + 4 },
    rotY: 0,
  });
  addComponent(worldRef, "CameraFollow", cameraEntity, {
    target: player,
    distance: cameraDef.distance ?? 4,
    height: cameraDef.height ?? 2.2,
    lookHeight: cameraDef.lookHeight ?? 1,
    side: cameraDef.side ?? 0,
    smooth: cameraDef.smooth ?? 0.15,
  });
  addComponent(worldRef, "CameraRig", cameraEntity, {
    yaw: worldRef.components.Transform.get(player).rotY,
  });
  worldRef.resources.cameraId = cameraEntity;
}

function inputSystem(worldRef) {
  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    const turn = (keyIsDown('d') ? 1 : 0) - (keyIsDown('a') ? 1 : 0);
    const throttle =
      (keyIsDown('w') ? 1 : 0) - (keyIsDown('s') ? 1 : 0);
    move.turn = turn;
    move.throttle = throttle;

    const jumpDown = keyIsDown('Space');
    if (jumpDown && !inputState.jumpHeld) {
      move.jumpRequested = true;
    }
    inputState.jumpHeld = jumpDown;

    worldRef.components.MoveIntent.set(entity, move);
  }
}

function cameraControlSystem(worldRef, dt) {
  for (const [entity, rig] of worldRef.components.CameraRig.entries()) {
    const follow = worldRef.components.CameraFollow.get(entity);
    if (!follow) {
      continue;
    }

    const target = follow.target;
    const move = worldRef.components.MoveIntent.get(target);
    const turnSpeed = worldRef.components.TurnSpeed.get(target)?.value ?? 0;

    if (move) {
      rig.yaw += move.turn * turnSpeed * dt;
    }

    const targetTransform = worldRef.components.Transform.get(target);
    if (targetTransform) {
      targetTransform.rotY = rig.yaw;
      worldRef.components.Transform.set(target, targetTransform);
    }

    worldRef.components.CameraRig.set(entity, rig);
  }
}

function movementSystem(worldRef, dt) {
  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    const transform = worldRef.components.Transform.get(entity);
    const speed = worldRef.components.Speed.get(entity)?.value ?? 0;

    if (move.throttle !== 0) {
      const forward = {
        x: Math.sin(transform.rotY),
        z: -Math.cos(transform.rotY),
      };
      vel.x = forward.x * speed * move.throttle;
      vel.z = forward.z * speed * move.throttle;
    } else {
      vel.x = 0;
      vel.z = 0;
    }

    if (move.jumpRequested && move.grounded) {
      const jump = worldRef.components.Jump.get(entity);
      vel.y = jump.velocity;
      move.grounded = false;
    }
    move.jumpRequested = false;

    worldRef.components.Velocity.set(entity, vel);
    worldRef.components.Transform.set(entity, transform);
    worldRef.components.MoveIntent.set(entity, move);
  }
}

function gravitySystem(worldRef, dt) {
  for (const [entity, gravity] of worldRef.components.Gravity.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    vel.y -= gravity.value * dt;
    worldRef.components.Velocity.set(entity, vel);
  }
}

function physicsSystem(worldRef, dt) {
  for (const [entity, transform] of worldRef.components.Transform.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!vel || !collider) {
      continue;
    }

    const move = worldRef.components.MoveIntent.get(entity);
    let grounded = false;

    const halfW = collider.w / 2;
    const halfD = collider.d / 2;
    const eps = 1e-4;
    const pos = { ...transform.pos };

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
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (x) => {
            if (x < closest) {
              closest = x;
            }
          }
        );
        if (closest !== Infinity) {
          nextX = Math.min(nextX, closest - halfW);
          vel.x = 0;
        }
      } else {
        let closest = -Infinity;
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (x) => {
            const edge = x + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
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
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, _y, z) => {
            if (z < closest) {
              closest = z;
            }
          }
        );
        if (closest !== Infinity) {
          nextZ = Math.min(nextZ, closest - halfD);
          vel.z = 0;
        }
      } else {
        let closest = -Infinity;
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, _y, z) => {
            const edge = z + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
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
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, y) => {
            if (y < closest) {
              closest = y;
            }
          }
        );
        if (closest !== Infinity) {
          nextY = Math.min(nextY, closest - collider.h);
          vel.y = 0;
        }
      } else {
        let closest = -Infinity;
        forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, y) => {
            const edge = y + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
        if (closest !== -Infinity) {
          nextY = Math.max(nextY, closest);
          vel.y = 0;
          grounded = true;
        }
      }
      pos.y = nextY;
    }

    transform.pos = pos;
    worldRef.components.Transform.set(entity, transform);
    worldRef.components.Velocity.set(entity, vel);

    if (move) {
      move.grounded = grounded;
      worldRef.components.MoveIntent.set(entity, move);
    }
  }
}

function cameraSystem(worldRef) {
  for (const [entity, follow] of worldRef.components.CameraFollow.entries()) {
    const targetTransform = worldRef.components.Transform.get(follow.target);
    const cameraTransform = worldRef.components.Transform.get(entity);
    const rig = worldRef.components.CameraRig.get(entity);
    if (!targetTransform || !cameraTransform) {
      continue;
    }

    const yaw = rig ? rig.yaw : targetTransform.rotY;
    const forward = {
      x: Math.sin(yaw),
      z: -Math.cos(yaw),
    };
    const right = {
      x: Math.cos(yaw),
      z: Math.sin(yaw),
    };

    const desired = {
      x: targetTransform.pos.x - forward.x * follow.distance + right.x * follow.side,
      y: targetTransform.pos.y + follow.height,
      z: targetTransform.pos.z - forward.z * follow.distance + right.z * follow.side,
    };

    cameraTransform.pos.x = lerp(cameraTransform.pos.x, desired.x, follow.smooth);
    cameraTransform.pos.y = lerp(cameraTransform.pos.y, desired.y, follow.smooth);
    cameraTransform.pos.z = lerp(cameraTransform.pos.z, desired.z, follow.smooth);

    const camWorld = gameToWorld(cameraTransform.pos);
    const lookAt = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + follow.lookHeight,
      z: targetTransform.pos.z,
    };
    const lookWorld = gameToWorld(lookAt);

    camera(
      camWorld.x,
      camWorld.y,
      camWorld.z,
      lookWorld.x,
      lookWorld.y,
      lookWorld.z,
      0,
      1,
      0
    );

    worldRef.components.Transform.set(entity, cameraTransform);
  }
}

function renderSystem(worldRef) {
  ambientLight(150);
  directionalLight(255, 255, 255, 0.3, -1, -0.4);

  noStroke();

  const cameraTransform = worldRef.components.Transform.get(
    worldRef.resources.cameraId
  );
  const cameraPos = cameraTransform?.pos || { x: 0, y: 0, z: 0 };
  const cameraWorld = gameToWorld(cameraPos);
  const cameraEntity = worldRef.resources.cameraId;
  const follow = cameraEntity
    ? worldRef.components.CameraFollow.get(cameraEntity)
    : null;
  let viewDir = { x: 0, y: 0, z: -1 };
  if (follow) {
    const targetTransform = worldRef.components.Transform.get(follow.target);
    if (targetTransform) {
      const lookAt = {
        x: targetTransform.pos.x,
        y: targetTransform.pos.y + follow.lookHeight,
        z: targetTransform.pos.z,
      };
      const dir = {
        x: lookAt.x - cameraPos.x,
        y: lookAt.y - cameraPos.y,
        z: lookAt.z - cameraPos.z,
      };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      viewDir = {
        x: dir.x / len,
        y: dir.y / len,
        z: dir.z / len,
      };
    }
  }
  const occluderMap = computeOccluders(worldRef, cameraPos);
  const occluderBlocks = [];
  const spriteDraws = [];

  for (const [entity, renderable] of worldRef.components.Renderable.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }

    const sprite = worldRef.components.BillboardSprite.get(entity);
    if (sprite) {
      const vel = worldRef.components.Velocity.get(entity);
      const horizontalSpeed = vel ? Math.hypot(vel.x, vel.z) : 0;
      const isMoving = horizontalSpeed > 0.01;
      const toCam = {
        x: cameraPos.x - transform.pos.x,
        z: cameraPos.z - transform.pos.z,
      };
      const toCamLen = Math.hypot(toCam.x, toCam.z) || 1;
      toCam.x /= toCamLen;
      toCam.z /= toCamLen;

      const forward = {
        x: Math.sin(transform.rotY),
        z: -Math.cos(transform.rotY),
      };
      const isFront = forward.x * toCam.x + forward.z * toCam.z > 0;
      const textureKey = isFront ? sprite.front : sprite.back;
      const spriteTex = worldRef.resources.textures[textureKey];
      const tex = spriteTex ? spriteTex.texture : null;

      const center = {
        x: transform.pos.x,
        y: transform.pos.y + sprite.offsetY,
        z: transform.pos.z,
      };
      const worldPos = gameToWorld(center);
      const toCamWorld = {
        x: cameraWorld.x - worldPos.x,
        y: cameraWorld.y - worldPos.y,
        z: cameraWorld.z - worldPos.z,
      };
      const horiz = Math.hypot(toCamWorld.x, toCamWorld.z);
      const billboardYaw = Math.atan2(toCamWorld.x, toCamWorld.z);
      const billboardPitch = Math.atan2(toCamWorld.y, horiz || 1);
      const depth =
        (center.x - cameraPos.x) * viewDir.x +
        (center.y - cameraPos.y) * viewDir.y +
        (center.z - cameraPos.z) * viewDir.z;

      if (spriteTex && isValidTexture(tex)) {
        spriteDraws.push({
          sprite,
          spriteTex,
          tex,
          worldPos,
          billboardYaw,
          billboardPitch,
          isMoving,
          depth,
        });
        continue;
      }
    }

    const center = {
      x: transform.pos.x,
      y: transform.pos.y + collider.h / 2,
      z: transform.pos.z,
    };
    const worldPos = gameToWorld(center);

    if (worldRef.components.StaticBlock.has(entity)) {
      const cellX = Math.floor(transform.pos.x);
      const cellY = Math.floor(transform.pos.y);
      const cellZ = Math.floor(transform.pos.z);
      const occluderAlpha = occluderMap.get(blockKey(cellX, cellY, cellZ));
      if (occluderAlpha !== undefined) {
        occluderBlocks.push({
          worldPos,
          collider,
          color: renderable.color,
          alpha: occluderAlpha,
        });
        continue;
      }
    }

    push();
    translate(worldPos.x, worldPos.y, worldPos.z);
    fill(renderable.color[0], renderable.color[1], renderable.color[2]);
    box(collider.w * gridSize, collider.h * gridSize, collider.d * gridSize);
    pop();
  }

  if (occluderBlocks.length > 0 && occluderShader) {
    shader(occluderShader);
    blendMode(REPLACE);
    occluderShader.setUniform(
      "uDitherScale",
      worldRef.resources.rendering.occluderDitherScale ?? 1
    );
    occluderShader.setUniform(
      "uAmbient",
      worldRef.resources.rendering.occluderAmbient ?? 150 / 255
    );
    for (const block of occluderBlocks) {
      const color = block.color || [100, 130, 100];
      occluderShader.setUniform(
        "uColor",
        [color[0] / 255, color[1] / 255, color[2] / 255]
      );
      occluderShader.setUniform(
        "uAlpha",
        block.alpha ?? worldRef.resources.rendering.occluderAlpha ?? 0.35
      );
      push();
      translate(block.worldPos.x, block.worldPos.y, block.worldPos.z);
      box(
        block.collider.w * gridSize,
        block.collider.h * gridSize,
        block.collider.d * gridSize
      );
      pop();
    }
    resetShader();
    blendMode(BLEND);
  }

  if (spriteDraws.length > 0) {
    const gl = drawingContext;
    if (gl && typeof gl.depthMask === "function") {
      gl.depthMask(true);
    }
    blendMode(REPLACE);
    spriteDraws.sort((a, b) => b.depth - a.depth);

    if (spriteShader) {
      shader(spriteShader);
    }

    for (const draw of spriteDraws) {
      push();
      translate(draw.worldPos.x, draw.worldPos.y, draw.worldPos.z);
      rotateY(draw.billboardYaw);
      rotateX(draw.billboardPitch);
      updateSpriteTexture(
        draw.spriteTex,
        draw.sprite.fps,
        draw.isMoving,
        draw.sprite.idleFrame
      );
      if (spriteShader) {
        spriteShader.setUniform("uTexture", draw.tex);
        spriteShader.setUniform(
          "uAlphaCutoff",
          draw.sprite.alphaCutoff ?? 0.4
        );
      } else {
        texture(draw.tex);
      }
      plane(draw.sprite.width * gridSize, draw.sprite.height * gridSize);
      pop();
    }
    if (spriteShader) {
      resetShader();
    } else {
      clearTexture();
    }
    blendMode(BLEND);
  }
}

function gameToWorld(pos) {
  // Game logic uses +Y up; p5 WEBGL uses +Y down, so flip here.
  return {
    x: pos.x * gridSize,
    y: -pos.y * gridSize,
    z: pos.z * gridSize,
  };
}

function drawLoading() {
  resetMatrix();
  noLights();
  translate(-width / 2 + 12, -height / 2 + 12);
  if (!uiFont) {
    return;
  }
  textFont(uiFont);
  fill(20);
  textAlign(LEFT, TOP);
  textSize(16);
  if (loadError) {
    text("Failed to load level JSON. Check console and server.", 0, 0);
  } else if (assetStatus && assetStatus.missing.length > 0) {
    text("Loaded with missing assets. Check console.", 0, 0);
  } else {
    text("Loading level...", 0, 0);
  }
}

function blockKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function isBlockAt(worldRef, x, y, z) {
  return worldRef.resources.blockSet.has(blockKey(x, y, z));
}

function computeOccluders(worldRef, cameraPos) {
  const occluders = new Map();
  const playerId = worldRef.resources.playerId;
  if (!playerId) {
    return occluders;
  }

  const transform = worldRef.components.Transform.get(playerId);
  const collider = worldRef.components.Collider.get(playerId);
  const sprite = worldRef.components.BillboardSprite.get(playerId);
  if (!transform || !collider) {
    return occluders;
  }

  const rendering = worldRef.resources.rendering;
  const radius = rendering.occluderConeRadius ?? 1.4;
  const height = rendering.occluderConeHeight ?? 0.9;
  const samples = rendering.occluderConeSamples ?? 12;
  const rings = Math.max(1, rendering.occluderConeRings ?? 3);
  const heightSteps = Math.max(1, rendering.occluderConeHeights ?? 3);
  const heightFractions = buildSymmetricFractions(heightSteps, 0.35);

  const baseY = transform.pos.y + (sprite?.offsetY ?? collider.h / 2);
  const center = { x: transform.pos.x, y: baseY, z: transform.pos.z };

  traceRayOccluders(worldRef, cameraPos, center, 1, occluders);

  for (let ring = 1; ring <= rings; ring += 1) {
    const rFrac = ring / rings;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * TWO_PI;
      const dx = Math.cos(angle) * radius * rFrac;
      const dz = Math.sin(angle) * radius * rFrac;
      for (const hFrac of heightFractions) {
        const dy = height * hFrac;
        const norm = Math.sqrt(rFrac * rFrac + hFrac * hFrac);
        const weight = Math.max(0, 1 - norm);
        if (weight <= 0) {
          continue;
        }
        traceRayOccluders(
          worldRef,
          cameraPos,
          { x: center.x + dx, y: center.y + dy, z: center.z + dz },
          weight,
          occluders
        );
      }
    }
  }

  return occluders;
}

function traceRayOccluders(worldRef, start, end, weight, outMap) {
  const dir = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 1e-6) {
    return;
  }

  dir.x /= len;
  dir.y /= len;
  dir.z /= len;

  let x = Math.floor(start.x);
  let y = Math.floor(start.y);
  let z = Math.floor(start.z);
  const endX = Math.floor(end.x);
  const endY = Math.floor(end.y);
  const endZ = Math.floor(end.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = Infinity;
  let tMaxY = Infinity;
  let tMaxZ = Infinity;

  if (stepX > 0) {
    tMaxX = (x + 1 - start.x) / dir.x;
  } else if (stepX < 0) {
    tMaxX = (start.x - x) / -dir.x;
  }

  if (stepY > 0) {
    tMaxY = (y + 1 - start.y) / dir.y;
  } else if (stepY < 0) {
    tMaxY = (start.y - y) / -dir.y;
  }

  if (stepZ > 0) {
    tMaxZ = (z + 1 - start.z) / dir.z;
  } else if (stepZ < 0) {
    tMaxZ = (start.z - z) / -dir.z;
  }

  let steps = 0;
  const maxSteps = Math.ceil(len * 3) + 3;

  const baseAlpha = worldRef.resources.rendering.occluderAlpha ?? 0.35;
  const fadeDistance =
    worldRef.resources.rendering.occluderFadeDistance ?? 0;

  while (steps < maxSteps) {
    if (x === endX && y === endY && z === endZ) {
      break;
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }

    if (x === endX && y === endY && z === endZ) {
      break;
    }

    if (isBlockAt(worldRef, x, y, z)) {
      let combinedWeight = weight;
      if (fadeDistance > 0) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const cz = z + 0.5;
        const distToTarget = Math.hypot(cx - end.x, cy - end.y, cz - end.z);
        const fade = Math.max(0, 1 - distToTarget / fadeDistance);
        combinedWeight *= fade;
      }

      if (combinedWeight > 0) {
        const alpha = 1 - (1 - baseAlpha) * combinedWeight;
        const key = blockKey(x, y, z);
        const existing = outMap.get(key);
        if (existing === undefined || alpha < existing) {
          outMap.set(key, alpha);
        }
      }
    }

    steps += 1;
  }
}

function buildSymmetricFractions(count, maxAbs) {
  if (count <= 1) {
    return [0];
  }
  const fractions = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    fractions.push((t * 2 - 1) * maxAbs);
  }
  return fractions;
}

function clearTexture() {
  if (typeof noTexture === "function") {
    noTexture();
    return;
  }
  if (typeof texture === "function") {
    try {
      texture(null);
    } catch (err) {
      // Ignore texture clearing failures in p5 v2.
    }
  }
}

function updateSpriteTexture(spriteTex, fps, isMoving, idleFrame) {
  const img = spriteTex.source;
  const gfx = spriteTex.texture;
  if (!img || !gfx) {
    return;
  }

  let frame = idleFrame || 0;
  let shouldDraw = true;

  if (typeof img.setFrame === "function") {
    const total =
      typeof img.numFrames === "function" ? img.numFrames() : img.numFrames;
    if (!total || total <= 1) {
      shouldDraw = !spriteTex.staticDrawn;
    } else {
      const clampedIdle =
        ((idleFrame || 0) % total + total) % total;
      if (!isMoving || !fps || fps <= 0) {
        frame = clampedIdle;
        if (frame === spriteTex.lastFrame && spriteTex.staticDrawn) {
          shouldDraw = false;
        } else {
          img.setFrame(frame);
        }
      } else {
        frame = Math.floor((millis() * fps) / 1000) % total;
        if (frame === spriteTex.lastFrame) {
          shouldDraw = false;
        } else {
          img.setFrame(frame);
        }
      }
    }
  } else {
    shouldDraw = !spriteTex.staticDrawn;
  }

  if (!shouldDraw) {
    return;
  }

  gfx.clear();
  gfx.image(img, 0, 0, gfx.width, gfx.height);
  spriteTex.lastFrame = frame;
  spriteTex.staticDrawn = true;
}

function loadImageAsync(path) {
  if (typeof loadImage !== "function") {
    return Promise.reject(new Error("loadImage is not available"));
  }
  return Promise.resolve(loadImage(path));
}

function loadFontAsync(path) {
  if (typeof loadFont !== "function") {
    return Promise.reject(new Error("loadFont is not available"));
  }
  return Promise.resolve(loadFont(path));
}

async function loadAssets(level) {
  const playerSprite = level.player?.sprite || {};
  const frontPath = playerSprite.front || "assets/player_front.gif";
  const backPath = playerSprite.back || "assets/player_back.gif";
  const uiFontPath = level.uiFont || "assets/opensans.ttf";
  const missing = [];

  let front = null;
  let back = null;
  let font = null;

  try {
    front = await loadSpriteTexture(frontPath);
  } catch (err) {
    console.warn(`Missing sprite: ${frontPath}`, err);
    missing.push(frontPath);
    front = null;
  }

  try {
    back = await loadSpriteTexture(backPath);
  } catch (err) {
    console.warn(`Missing sprite: ${backPath}`, err);
    missing.push(backPath);
    back = null;
  }

  if (front && !isValidTexture(front.texture)) {
    console.warn(`Sprite is not a valid texture: ${frontPath}`, front);
    missing.push(frontPath);
    front = null;
  }
  if (back && !isValidTexture(back.texture)) {
    console.warn(`Sprite is not a valid texture: ${backPath}`, back);
    missing.push(backPath);
    back = null;
  }

  try {
    font = await loadFontAsync(uiFontPath);
  } catch (err) {
    console.warn(`Missing font: ${uiFontPath}`, err);
    missing.push(uiFontPath);
    font = null;
  }

  return { front, back, missing, uiFont: font };
}

function isValidTexture(tex) {
  if (!tex) {
    return false;
  }
  if (typeof p5 !== "undefined") {
    if (typeof p5.Image === "function" && tex instanceof p5.Image) {
      return !!tex._pInst;
    }
    if (typeof p5.Graphics === "function" && tex instanceof p5.Graphics) {
      return !!tex._pInst;
    }
  }
  return typeof tex === "object" && !!tex._pInst;
}

function createSpriteShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(SPRITE_VERT, SPRITE_FRAG);
}

function createOccluderShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(OCCLUDER_VERT, OCCLUDER_FRAG);
}

async function loadSpriteTexture(path) {
  const img = await loadImageAsync(path);
  if (!img || !img.width || !img.height) {
    throw new Error("Invalid image dimensions");
  }
  const gfx = createGraphics(img.width, img.height);
  gfx.pixelDensity(1);
  gfx.clear();
  gfx.image(img, 0, 0, gfx.width, gfx.height);
  return {
    source: img,
    texture: gfx,
    lastFrame: -1,
    staticDrawn: true,
  };
}

function forEachBlockInAabb(worldRef, minX, maxX, minY, maxY, minZ, maxZ, fn) {
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);

  for (let y = y0; y <= y1; y += 1) {
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (isBlockAt(worldRef, x, y, z)) {
          fn(x, y, z);
        }
      }
    }
  }
}
