let levelData;
let world;
let loading = true;
let loadError = null;
let assetStatus = null;
let uiFont = null;
let renderState = null;
let loadingScreen = null;

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  frameRate(60);

  loadingScreen = document.getElementById("loading-screen");
  setLoadingScreen(true, "Loading...");

  // --- iOS Safari: stop selection/callout/drag/scroll/zoom on the canvas ---
  const el = canvas.elt;

  // CSS
  el.style.touchAction = "none";              // stop browser gestures
  el.style.webkitTouchCallout = "none";       // disable iOS callout
  el.style.webkitUserSelect = "none";         // disable selection
  el.style.userSelect = "none";
  el.style.webkitUserDrag = "none";           // disable drag ghost
  el.style.userDrag = "none";
  el.style.webkitTapHighlightColor = "transparent";

  // JS (non-passive) – required for iOS
  const block = (e) => {
    // If you want pinch zoom inside your game, remove this for multi-touch.
    e.preventDefault();
  };

  el.addEventListener("touchstart", block, { passive: false });
  el.addEventListener("touchmove",  block, { passive: false });
  el.addEventListener("touchend",   block, { passive: false });
  el.addEventListener("touchcancel",block, { passive: false });

  // Long-press context menu / callout fallback
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  // Optional: prevent page scroll/bounce if a finger starts on canvas
  document.body.style.overscrollBehavior = "none";
  document.documentElement.style.overscrollBehavior = "none";
  // ------------------------------------------------------------------------

  renderState = {
    spriteShader: Game.rendering.createSpriteShader(),
    blockShader: Game.rendering.createBlockShader(),
    uiFont: null,
  };

  Game.ui?.ensureOverlay?.();
  Game.systems.attachTouchEvents?.(el);
  Game.systems.attachDebugCameraMouseEvents?.(el);

  loadLevel();
}

function setLoadingScreen(visible, message) {
  if (!loadingScreen) {
    return;
  }
  if (typeof message === "string") {
    loadingScreen.textContent = message;
  }
  if (visible) {
    loadingScreen.classList.remove("hidden");
  } else {
    loadingScreen.classList.add("hidden");
  }
}


function draw() {
  const rawDt = deltaTime / 1000;
  const dt = Math.min(0.033, rawDt);

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
    setLoadingScreen(true, "Loading level...");
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

  setLoadingScreen(true, "Loading assets...");
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
  if (Game.config?.network?.enabled) {
    Game.net?.connect?.(world);
  }
  loading = false;
  if (loadError) {
    setLoadingScreen(true, "Failed to load level.");
  } else if (assetStatus && assetStatus.missing.length > 0) {
    setLoadingScreen(true, "Missing assets.");
  } else {
    setLoadingScreen(false);
  }
}

function keyPressed(event) {
  let handled = false;
  if (key === "`" || keyCode === 192) {
    const debug = Game.debug || {};
    const maxMode =
      typeof debug.maxMode === "number" && debug.maxMode > 0
        ? debug.maxMode
        : 2;
    debug.mode = ((debug.mode ?? 0) + 1) % (maxMode + 1);
    Game.debug = debug;
    const input = Game.systems?.inputState?.debugCamera;
    if (input) {
      input.rightDragging = false;
      input.lookDeltaX = 0;
      input.lookDeltaY = 0;
    }
    handled = true;
  } else if (key === "Backspace" || keyCode === 8) {
    if (Game.systems?.deleteSelectedEditorBlock?.(world)) {
      handled = true;
    }
  }
  if (handled) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    return false;
  }
}

function mousePressed() {
  if (mouseButton === RIGHT) {
    return;
  }
  if (Game.systems?.inputState) {
    const lastTouchTime = Game.systems.inputState.lastTouchTime || 0;
    if (Date.now() - lastTouchTime < 300) {
      return;
    }
    Game.systems.inputState.mouseDown = true;
    Game.systems.inputState.mouseDownButton = mouseButton;
    Game.systems.inputState.mouseDownPosition = { x: mouseX, y: mouseY };
    Game.systems.inputState.mouseDownTime = Date.now();
    Game.systems.inputState.clickRequested = true;
    Game.systems.inputState.clickPosition = { x: mouseX, y: mouseY };
  }
}

function mouseReleased() {
  if (mouseButton === RIGHT) {
    return;
  }
  if (Game.systems?.inputState) {
    Game.systems.inputState.mouseDown = false;
    Game.systems.inputState.mouseDownButton = null;
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
  Game.systems.editorSystem?.(worldRef);
  Game.systems.debugCameraControlSystem?.(worldRef, dt);
  Game.systems.interactionSystem(worldRef);
  Game.systems.networkInputSystem?.(worldRef);
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
  Game.systems.networkSmoothingSystem?.(worldRef, dt);
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
