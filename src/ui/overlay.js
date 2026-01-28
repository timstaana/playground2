window.Game = window.Game || {};
Game.ui = Game.ui || {};

Game.ui.fontFamily = "GameUI, sans-serif";

Game.ui.ensureOverlay = function ensureOverlay() {
  if (Game.ui.overlay && Game.ui.overlay.canvas) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.id = "ui-overlay";
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "10";

  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  Game.ui.overlay = { canvas, ctx };
  Game.ui.resizeOverlay();
};

Game.ui.ensureEditorPanel = function ensureEditorPanel() {
  if (Game.ui.editorPanel) {
    return;
  }
  const panel = document.createElement("div");
  panel.id = "editor-panel";
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.top = "52px";
  panel.style.width = "280px";
  panel.style.maxHeight = "70vh";
  panel.style.display = "none";
  panel.style.flexDirection = "column";
  panel.style.gap = "8px";
  panel.style.padding = "10px";
  panel.style.background = "rgba(12, 14, 18, 0.92)";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  panel.style.borderRadius = "8px";
  panel.style.color = "#e8f0f7";
  panel.style.fontFamily = Game.ui.fontFamily;
  panel.style.zIndex = "20";
  panel.style.pointerEvents = "auto";
  panel.style.backdropFilter = "blur(4px)";

  const header = document.createElement("div");
  header.style.fontWeight = "600";
  header.style.fontSize = "12px";
  header.style.letterSpacing = "0.02em";
  header.style.opacity = "0.85";
  header.textContent = "Entity";

  const textarea = document.createElement("textarea");
  textarea.style.width = "100%";
  textarea.style.minHeight = "200px";
  textarea.style.maxHeight = "40vh";
  textarea.style.resize = "vertical";
  textarea.style.background = "rgba(5, 6, 8, 0.9)";
  textarea.style.border = "1px solid rgba(255, 255, 255, 0.08)";
  textarea.style.borderRadius = "6px";
  textarea.style.color = "#dfe7ef";
  textarea.style.fontSize = "11px";
  textarea.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  textarea.style.padding = "8px";
  textarea.spellcheck = false;

  const status = document.createElement("div");
  status.style.fontSize = "11px";
  status.style.opacity = "0.7";
  status.style.minHeight = "14px";

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "8px";

  const apply = document.createElement("button");
  apply.textContent = "Apply";
  apply.style.flex = "1";
  apply.style.padding = "6px 8px";
  apply.style.borderRadius = "6px";
  apply.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  apply.style.background = "rgba(30, 140, 255, 0.85)";
  apply.style.color = "#fff";
  apply.style.cursor = "pointer";

  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.flex = "1";
  close.style.padding = "6px 8px";
  close.style.borderRadius = "6px";
  close.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  close.style.background = "rgba(60, 60, 60, 0.6)";
  close.style.color = "#fff";
  close.style.cursor = "pointer";

  buttonRow.appendChild(apply);
  buttonRow.appendChild(close);

  panel.appendChild(header);
  panel.appendChild(textarea);
  panel.appendChild(status);
  panel.appendChild(buttonRow);
  document.body.appendChild(panel);

  const stopPanelEvent = (event) => {
    event.stopPropagation();
  };
  const blockPanelContext = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  panel.addEventListener("mousedown", stopPanelEvent);
  panel.addEventListener("mouseup", stopPanelEvent);
  panel.addEventListener("wheel", stopPanelEvent);
  panel.addEventListener("contextmenu", blockPanelContext);

  Game.ui.editorPanel = {
    container: panel,
    header,
    textarea,
    status,
    apply,
    close,
    selectionKey: null,
    visible: false,
    worldRef: null,
    userHiddenKey: null,
    isEditing: false,
    isDirty: false,
  };

  textarea.addEventListener("focus", () => {
    const panelState = Game.ui.editorPanel;
    if (panelState) {
      panelState.isEditing = true;
    }
  });

  textarea.addEventListener("blur", () => {
    const panelState = Game.ui.editorPanel;
    if (panelState) {
      panelState.isEditing = false;
    }
  });

  textarea.addEventListener("input", () => {
    const panelState = Game.ui.editorPanel;
    if (panelState) {
      panelState.isDirty = true;
      panelState.status.textContent = "";
    }
  });

  close.addEventListener("click", () => {
    const panelState = Game.ui.editorPanel;
    panelState.visible = false;
    panelState.userHiddenKey = panelState.selectionKey;
    panel.style.display = "none";
  });

  apply.addEventListener("click", () => {
    const panelState = Game.ui.editorPanel;
    if (!panelState || !panelState.selectionKey) {
      return;
    }
    const worldRef = panelState.worldRef;
    const editor = worldRef?.resources?.editor;
    const selection = Game.systems?.getEditorSelection?.(worldRef, editor);
    if (!worldRef || !selection) {
      panelState.status.textContent = "No selection.";
      return;
    }
    try {
      const payload = JSON.parse(panelState.textarea.value);
      const result = Game.systems.applyEditorEntityJson(
        worldRef,
        selection,
        payload
      );
      if (result?.ok) {
        panelState.status.textContent = "Applied.";
        panelState.isDirty = false;
      } else {
        panelState.status.textContent = result?.message || "Apply failed.";
      }
    } catch (err) {
      panelState.status.textContent = "Invalid JSON.";
    }
  });

};

Game.ui.ensureEditorToolbar = function ensureEditorToolbar() {
  if (Game.ui.editorToolbar) {
    return;
  }
  const bar = document.createElement("div");
  bar.id = "editor-toolbar";
  bar.style.position = "fixed";
  bar.style.right = "16px";
  bar.style.top = "12px";
  bar.style.display = "none";
  bar.style.gap = "8px";
  bar.style.zIndex = "20";
  bar.style.pointerEvents = "auto";
  bar.style.fontFamily = Game.ui.fontFamily;

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy JSON";
  copyBtn.style.padding = "6px 10px";
  copyBtn.style.borderRadius = "6px";
  copyBtn.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  copyBtn.style.background = "rgba(60, 60, 60, 0.7)";
  copyBtn.style.color = "#fff";
  copyBtn.style.cursor = "pointer";

  const exportBtn = document.createElement("button");
  exportBtn.textContent = "Export";
  exportBtn.style.padding = "6px 10px";
  exportBtn.style.borderRadius = "6px";
  exportBtn.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  exportBtn.style.background = "rgba(20, 180, 130, 0.85)";
  exportBtn.style.color = "#fff";
  exportBtn.style.cursor = "pointer";

  bar.appendChild(copyBtn);
  bar.appendChild(exportBtn);
  document.body.appendChild(bar);

  const stopToolbarEvent = (event) => {
    event.stopPropagation();
  };
  const blockToolbarContext = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  bar.addEventListener("mousedown", stopToolbarEvent);
  bar.addEventListener("mouseup", stopToolbarEvent);
  bar.addEventListener("wheel", stopToolbarEvent);
  bar.addEventListener("contextmenu", blockToolbarContext);

  Game.ui.editorToolbar = {
    container: bar,
    copyBtn,
    exportBtn,
    worldRef: null,
  };

  copyBtn.addEventListener("click", async () => {
    const toolbar = Game.ui.editorToolbar;
    const panel = Game.ui.editorPanel;
    const worldRef = toolbar.worldRef;
    if (!worldRef || !Game.systems?.exportLevelData) {
      if (panel) {
        panel.status.textContent = "No world to copy.";
      }
      return;
    }
    const payload = Game.systems.exportLevelData(worldRef);
    if (!payload) {
      if (panel) {
        panel.status.textContent = "Copy failed.";
      }
      return;
    }
    const json = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const temp = document.createElement("textarea");
        temp.value = json;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      if (panel) {
        panel.status.textContent = "Copied level JSON.";
      }
    } catch (err) {
      if (panel) {
        panel.status.textContent = "Copy failed.";
      }
    }
  });

  exportBtn.addEventListener("click", () => {
    const toolbar = Game.ui.editorToolbar;
    const panel = Game.ui.editorPanel;
    const worldRef = toolbar.worldRef;
    if (!worldRef || !Game.systems?.exportLevelData) {
      if (panel) {
        panel.status.textContent = "No world to export.";
      }
      return;
    }
    const payload = Game.systems.exportLevelData(worldRef);
    if (!payload) {
      if (panel) {
        panel.status.textContent = "Export failed.";
      }
      return;
    }
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "level-export.json";
    anchor.click();
    URL.revokeObjectURL(url);
    if (panel) {
      panel.status.textContent = "Exported level-export.json.";
    }
  });
};

Game.ui.resizeOverlay = function resizeOverlay() {
  const overlay = Game.ui.overlay;
  if (!overlay || !overlay.canvas) {
    return;
  }

  overlay.canvas.width = window.innerWidth;
  overlay.canvas.height = window.innerHeight;
};

Game.ui.clearOverlay = function clearOverlay() {
  const overlay = Game.ui.overlay;
  if (!overlay || !overlay.ctx) {
    return;
  }

  overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
};

Game.ui.wrapText = function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
};

Game.ui.renderDialogueOverlay = function renderDialogueOverlay(worldRef) {
  Game.ui.ensureOverlay();
  Game.ui.ensureEditorPanel();
  Game.ui.ensureEditorToolbar();
  const overlay = Game.ui.overlay;
  if (!overlay || !overlay.ctx) {
    return;
  }

  const ctx = overlay.ctx;
  const width = overlay.canvas.width;
  const height = overlay.canvas.height;
  ctx.clearRect(0, 0, width, height);

  if (worldRef) {
    const cameraId = worldRef.resources.cameraId;
    const dialogueState = cameraId
      ? worldRef.components.DialogueState.get(cameraId)
      : null;
    if (dialogueState && dialogueState.mode === "dialogue") {
      const dialogue = worldRef.components.Dialogue.get(dialogueState.targetId);
      const lines = Array.isArray(dialogue?.lines) ? dialogue.lines : [];
      const message = lines.length > 0 ? lines.join("\n") : "";
      if (message) {
        const margin = 18;
        const padding = 16;
        const boxWidth = Math.max(0, width - margin * 2);
        const boxHeight = Math.min(height * 0.28, 190);
        const x = margin;
        const y = height - margin - boxHeight;

        ctx.save();
        ctx.fillStyle = "rgba(15, 18, 24, 0.92)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.lineWidth = 1;

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, boxWidth, boxHeight, 8);
        } else {
          const radius = 8;
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + boxWidth - radius, y);
          ctx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
          ctx.lineTo(x + boxWidth, y + boxHeight - radius);
          ctx.quadraticCurveTo(
            x + boxWidth,
            y + boxHeight,
            x + boxWidth - radius,
            y + boxHeight
          );
          ctx.lineTo(x + radius, y + boxHeight);
          ctx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
        }
        ctx.fill();
        ctx.stroke();

        const fontFamily = Game.ui.fontFamily;
        let textX = x + padding;
        let textY = y + padding;

        ctx.textBaseline = "top";
        if (dialogue?.name) {
          ctx.font = `600 13px ${fontFamily}`;
          ctx.fillStyle = "rgba(220, 220, 220, 0.9)";
          ctx.fillText(dialogue.name, textX, textY);
          textY += 18;
        }

        const textColor =
          Array.isArray(dialogue?.color) && dialogue.color.length >= 3
            ? dialogue.color
            : [255, 255, 255];
        ctx.fillStyle = `rgb(${textColor[0]}, ${textColor[1]}, ${textColor[2]})`;
        ctx.font = `16px ${fontFamily}`;

        const availableWidth = boxWidth - padding * 2;
        const paragraphs = message.split("\n");
        const renderedLines = [];
        for (const paragraph of paragraphs) {
          const wrapped = Game.ui.wrapText(ctx, paragraph, availableWidth);
          for (const line of wrapped) {
            renderedLines.push(line);
          }
        }

        const lineHeight = 20;
        const maxLines = Math.floor((boxHeight - padding * 2) / lineHeight);
        for (let i = 0; i < renderedLines.length && i < maxLines; i += 1) {
          ctx.fillText(renderedLines[i], textX, textY);
          textY += lineHeight;
        }

        ctx.restore();
      }
    }
  }

  Game.ui.renderDebugHud?.(ctx);
  Game.ui.renderTouchControls?.();
  Game.ui.updateEditorPanel?.(worldRef);
};

Game.ui.updateEditorPanel = function updateEditorPanel(worldRef) {
  const panel = Game.ui.editorPanel;
  if (!panel) {
    return;
  }
  const debugMode = Game.debug?.mode ?? 0;
  if (!worldRef || debugMode <= 0) {
    panel.visible = false;
    panel.container.style.display = "none";
    if (Game.ui.editorToolbar) {
      Game.ui.editorToolbar.container.style.display = "none";
    }
    return;
  }
  const editor = worldRef.resources?.editor;
  const selection = Game.systems?.getEditorSelection?.(worldRef, editor);
  if (!selection) {
    panel.visible = false;
    panel.container.style.display = "none";
    if (Game.ui.editorToolbar) {
      Game.ui.editorToolbar.container.style.display = "none";
    }
    return;
  }
  const key = `${selection.type}:${selection.entity}`;
  if (panel.userHiddenKey === key) {
    panel.visible = false;
    panel.container.style.display = "none";
    if (Game.ui.editorToolbar) {
      Game.ui.editorToolbar.container.style.display = "none";
    }
    return;
  }
  panel.worldRef = worldRef;
  panel.visible = true;
  panel.container.style.display = "flex";
  if (Game.ui.editorToolbar) {
    Game.ui.editorToolbar.worldRef = worldRef;
    Game.ui.editorToolbar.container.style.display = "flex";
  }
  panel.header.textContent =
    selection.type === "block"
      ? `Block ${selection.entity}`
      : `Entity ${selection.entity}`;
  if (panel.selectionKey !== key) {
    panel.selectionKey = key;
    panel.userHiddenKey = null;
    panel.status.textContent = "";
    const payload = Game.systems.buildEditorEntityJson(worldRef, selection);
    panel.textarea.value = payload ? JSON.stringify(payload, null, 2) : "{}";
    panel.isDirty = false;
  } else if (!panel.isEditing && !panel.isDirty) {
    const payload = Game.systems.buildEditorEntityJson(worldRef, selection);
    const nextValue = payload ? JSON.stringify(payload, null, 2) : "{}";
    if (panel.textarea.value !== nextValue) {
      panel.textarea.value = nextValue;
    }
  }
};

Game.ui.renderDebugHud = function renderDebugHud(ctx) {
  const debug = Game.debug || {};
  const debugMode = debug.mode ?? 0;
  const showFps = debug.showFps ?? debugMode > 0;
  if (!showFps) {
    return;
  }
  if (!ctx) {
    return;
  }
  const fps =
    typeof frameRate === "function" ? Math.round(frameRate()) : null;
  const padding = 10;
  const fontFamily = Game.ui.fontFamily;
  const label = fps !== null ? `FPS ${fps}` : "FPS --";

  ctx.save();
  ctx.font = `600 12px ${fontFamily}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const textWidth = ctx.measureText(label).width;
  const boxWidth = textWidth + padding * 2;
  const boxHeight = 20;
  ctx.fillStyle = "rgba(10, 12, 16, 0.6)";
  ctx.fillRect(padding, padding, boxWidth, boxHeight);
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(label, padding * 2, padding + 4);
  ctx.restore();
};

Game.ui.renderTouchControls = function renderTouchControls() {
  const overlay = Game.ui.overlay;
  if (!overlay || !overlay.ctx) {
    return;
  }
  const touch = Game.systems?.inputState?.touch;
  const pending = touch?.pending;
  const hasPending = pending && pending.size > 0;
  const jumpPos = touch?.jumpPos;
  if (!touch || (!touch.active && !hasPending)) {
    if (!jumpPos) {
      return;
    }
  }

  const ctx = overlay.ctx;
  let origin = touch?.origin;
  let knob = touch?.knob || touch?.pos || origin;
  if (!touch.active && hasPending) {
    const entry = pending.values().next().value;
    if (entry) {
      origin = { x: entry.x, y: entry.y };
      knob = origin;
    }
  }
  const radius = touch.radius ?? 70;

  if (origin && knob) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(240, 240, 240, 0.7)";
    ctx.fillStyle = "rgba(120, 180, 255, 0.18)";

    ctx.beginPath();
    ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(240, 240, 240, 0.85)";
    ctx.beginPath();
    ctx.arc(knob.x, knob.y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (jumpPos) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 220, 120, 0.9)";
    ctx.fillStyle = "rgba(255, 220, 120, 0.2)";
    ctx.beginPath();
    ctx.arc(jumpPos.x, jumpPos.y, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
};
