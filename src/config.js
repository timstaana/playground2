window.Game = window.Game || {};
Game.config = {
  gridSize: 40,
  network: {
    enabled: true,
    url: null,
    sendInterval: 0.033,
    deferState: true,
    stateEpsilon: 0.0001,
    authoritative: false,
  },
};

Game.debug = {
  mode: 0,
  maxMode: 2,
  showFps: true,
};
