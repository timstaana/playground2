window.Game = window.Game || {};
Game.assets = Game.assets || {};

Game.assets.loadImageAsync = function loadImageAsync(path) {
  if (typeof loadImage !== "function") {
    return Promise.reject(new Error("loadImage is not available"));
  }
  return new Promise((resolve, reject) => {
    try {
      loadImage(
        path,
        (img) => resolve(img),
        (err) => reject(err || new Error(`Failed to load image: ${path}`))
      );
    } catch (err) {
      reject(err);
    }
  });
};

Game.assets.loadFontAsync = function loadFontAsync(path) {
  if (typeof loadFont !== "function") {
    return Promise.reject(new Error("loadFont is not available"));
  }
  return Promise.resolve(loadFont(path));
};

Game.assets.buildSpriteTexture = function buildSpriteTexture(img, options = {}) {
  if (!img || !img.width || !img.height) {
    throw new Error("Invalid image dimensions");
  }
  const forceGraphics = options.forceGraphics === true;
  const frameCount =
    typeof img.numFrames === "function" ? img.numFrames() : img.numFrames;
  const isAnimated = typeof frameCount === "number" && frameCount > 1;
  if (!forceGraphics && !isAnimated) {
    return {
      source: img,
      texture: img,
      lastFrame: -1,
      staticDrawn: true,
      direct: true,
    };
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
    direct: false,
  };
};

Game.assets.loadSpriteTexture = async function loadSpriteTexture(path) {
  const img = await Game.assets.loadImageAsync(path);
  return Game.assets.buildSpriteTexture(img, { forceGraphics: true });
};

Game.assets.loadAssets = async function loadAssets(level) {
  const playerSprite = level.player?.sprite || {};
  const frontPath = playerSprite.front || "assets/player_front.gif";
  const backPath = playerSprite.back || "assets/player_back.gif";
  const uiFontPath = level.uiFont || "assets/opensans.ttf";
  const streaming = level.paintingStreaming || level.streaming || {};
  const preloadAnimated =
    streaming.preloadAnimated ??
    streaming.preloadAnimatedPaintings ??
    false;
  const preloadAll = streaming.preloadAllPaintings ?? false;
  const missing = [];
  const paintings = {};

  let front = null;
  let back = null;
  let font = null;

  try {
    front = await Game.assets.loadSpriteTexture(frontPath);
  } catch (err) {
    console.warn(`Missing sprite: ${frontPath}`, err);
    missing.push(frontPath);
    front = null;
  }

  try {
    back = await Game.assets.loadSpriteTexture(backPath);
  } catch (err) {
    console.warn(`Missing sprite: ${backPath}`, err);
    missing.push(backPath);
    back = null;
  }

  if (front && !Game.rendering.isValidTexture(front.texture)) {
    console.warn(`Sprite is not a valid texture: ${frontPath}`, front);
    missing.push(frontPath);
    front = null;
  }
  if (back && !Game.rendering.isValidTexture(back.texture)) {
    console.warn(`Sprite is not a valid texture: ${backPath}`, back);
    missing.push(backPath);
    back = null;
  }

  try {
    font = await Game.assets.loadFontAsync(uiFontPath);
  } catch (err) {
    console.warn(`Missing font: ${uiFontPath}`, err);
    missing.push(uiFontPath);
    font = null;
  }

  const paintingDefs = Array.isArray(level.paintings) ? level.paintings : [];
  for (let i = 0; i < paintingDefs.length; i += 1) {
    const painting = paintingDefs[i] || {};
    const imagePath = painting.image || painting.src;
    if (!imagePath) {
      continue;
    }
    const lower = typeof imagePath === "string" ? imagePath.toLowerCase() : "";
    const isAnimated =
      painting.animate === true || lower.endsWith(".gif");
    const shouldPreload =
      preloadAll || painting.preload === true || (preloadAnimated && isAnimated);
    if (!shouldPreload) {
      continue;
    }
    const textureKey =
      painting.textureKey ||
      painting.key ||
      painting.id ||
      `painting-${i + 1}`;
    if (paintings[textureKey]) {
      continue;
    }
    try {
      paintings[textureKey] = await Game.assets.loadSpriteTexture(imagePath);
    } catch (err) {
      console.warn(`Missing painting: ${imagePath}`, err);
      missing.push(imagePath);
    }
  }

  return { front, back, paintings, missing, uiFont: font };
};
