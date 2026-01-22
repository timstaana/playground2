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
