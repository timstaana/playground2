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

  Game.ui.renderTouchControls?.();
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
