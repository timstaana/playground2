window.Game = window.Game || {};
Game.rendering = Game.rendering || {};

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
uniform vec2 uTextureSize;
uniform vec3 uOutlineColor;
uniform float uOutlineThickness;
uniform float uEnableOutline;
varying vec2 vTexCoord;
void main() {
  vec4 texColor = texture2D(uTexture, vTexCoord);
  float alpha = texColor.a;
  if (uEnableOutline > 0.5) {
    vec2 texel = uOutlineThickness / max(uTextureSize, vec2(1.0));
    float neighbor = 0.0;
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, 0.0)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, 0.0)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(0.0, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(0.0, -texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, -texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, -texel.y)).a);
    float edge = step(uAlphaCutoff, neighbor) * (1.0 - step(uAlphaCutoff, alpha));
    float border = 0.0;
    border += step(vTexCoord.x, texel.x);
    border += step(1.0 - texel.x, vTexCoord.x);
    border += step(vTexCoord.y, texel.y);
    border += step(1.0 - texel.y, vTexCoord.y);
    border = clamp(border, 0.0, 1.0) * step(uAlphaCutoff, alpha);
    if (edge > 0.0 || border > 0.0) {
      gl_FragColor = vec4(uOutlineColor, 1.0);
      return;
    }
  }
  if (alpha < uAlphaCutoff) {
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

Game.rendering.createSpriteShader = function createSpriteShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(SPRITE_VERT, SPRITE_FRAG);
};

Game.rendering.createOccluderShader = function createOccluderShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(OCCLUDER_VERT, OCCLUDER_FRAG);
};
