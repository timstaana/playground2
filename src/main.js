let levelData;
let world;
let loading = true;
let loadError = null;
let assetStatus = null;
let uiFont = null;
let renderState = null;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  frameRate(60);
  renderState = {
    spriteShader: Game.rendering.createSpriteShader(),
    occluderShader: Game.rendering.createOccluderShader(),
    uiFont: null,
  };
  Game.ui?.ensureOverlay?.();
  Game.systems.attachTouchEvents?.(canvas?.elt);

  loadLevel();
}

function draw() {
  const dt = Math.min(0.033, deltaTime / 1000);

  background(180, 210, 240);

  if (loading || !world) {
    Game.ui?.renderDialogueOverlay?.(null);
    drawLoading();
    return;
  }

  updateSystems(world, dt);
  Game.systems.renderSystem(world, renderState);
  Game.ui?.renderDialogueOverlay?.(world);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  Game.ui?.resizeOverlay?.();
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

  assetStatus = await Game.assets.loadAssets(levelData || {});
  uiFont = assetStatus.uiFont || null;
  if (renderState) {
    renderState.uiFont = uiFont;
  }
  world = Game.ecs.createWorld();
  world.resources.textures.playerFront = assetStatus.front;
  world.resources.textures.playerBack = assetStatus.back;
  if (assetStatus.paintings) {
    for (const [key, texture] of Object.entries(assetStatus.paintings)) {
      world.resources.textures[key] = texture;
    }
  }
  Game.level.buildLevel(world, levelData || {});
  loading = false;
}

function keyPressed() {
  if (key === "`" || keyCode === 192) {
    Game.debug.enabled = !Game.debug.enabled;
  }
}

function mousePressed() {
  if (Game.systems?.inputState) {
    const lastTouchTime = Game.systems.inputState.lastTouchTime || 0;
    if (Date.now() - lastTouchTime < 300) {
      return;
    }
    Game.systems.inputState.clickRequested = true;
  }
}

function touchStarted(event) {
  Game.systems.handleTouchStart?.(event);
  return false;
}

function touchMoved(event) {
  Game.systems.handleTouchMove?.(event);
  return false;
}

function touchEnded(event) {
  Game.systems.handleTouchEnd?.(event);
  return false;
}

function updateSystems(worldRef, dt) {
  Game.systems.inputSystem(worldRef);
  Game.systems.interactionSystem(worldRef);
  Game.systems.paintingStreamingSystem?.(worldRef);
  const cameraId = worldRef.resources.cameraId;
  const lightbox = cameraId
    ? worldRef.components.Lightbox.get(cameraId)
    : null;
  const dialogueState = cameraId
    ? worldRef.components.DialogueState.get(cameraId)
    : null;
  const locked =
    (lightbox && lightbox.mode === "lightbox") ||
    (dialogueState && dialogueState.mode === "dialogue");
  if (!locked) {
    Game.systems.cameraControlSystem(worldRef, dt);
    Game.systems.movementSystem(worldRef, dt);
    Game.systems.gravitySystem(worldRef, dt);
    Game.systems.physicsSystem(worldRef, dt);
  }
  Game.systems.cameraSystem(worldRef);
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
