import { firebaseConfig } from "/firebase-config.js";

const halftone = document.querySelector(".halftone");

if (halftone instanceof HTMLElement) {
  const drawingCanvas = halftone.querySelector(".halftone-drawing");
  const resetButton = halftone.querySelector(".halftone-reset");
  const undoButton = halftone.querySelector(".halftone-undo");
  const sendButton = halftone.querySelector(".halftone-send");
  const sendButtonLabel = sendButton?.querySelector("span");
  const confirmDialog = halftone.querySelector(".halftone-confirm");
  const resetConfirmDialog = halftone.querySelector(".halftone-reset-confirm");

  if (
    drawingCanvas instanceof HTMLCanvasElement
    && resetButton instanceof HTMLButtonElement
    && undoButton instanceof HTMLButtonElement
    && sendButton instanceof HTMLButtonElement
    && sendButtonLabel instanceof HTMLElement
    && confirmDialog instanceof HTMLDialogElement
    && resetConfirmDialog instanceof HTMLDialogElement
  ) {
    const drawingContext = drawingCanvas.getContext("2d");

    if (drawingContext) {
      const strokes = [];
      const undoneStrokes = [];
      let activeStroke = null;
      let isSending = false;

      const getPenWidth = () => Math.max(2, Math.min(4, drawingCanvas.clientWidth / 240));

      const drawStroke = (stroke) => {
        if (stroke.length === 0) return;

        const width = drawingCanvas.clientWidth;
        const height = drawingCanvas.clientHeight;
        drawingContext.strokeStyle = "#000";
        drawingContext.fillStyle = "#000";
        drawingContext.lineWidth = getPenWidth();
        drawingContext.lineCap = "round";
        drawingContext.lineJoin = "round";

        if (stroke.length === 1) {
          const point = stroke[0];
          drawingContext.beginPath();
          drawingContext.arc(
            point.x * width,
            point.y * height,
            drawingContext.lineWidth / 2,
            0,
            Math.PI * 2,
          );
          drawingContext.fill();
          return;
        }

        drawingContext.beginPath();
        drawingContext.moveTo(stroke[0].x * width, stroke[0].y * height);
        for (let index = 1; index < stroke.length; index += 1) {
          drawingContext.lineTo(stroke[index].x * width, stroke[index].y * height);
        }
        drawingContext.stroke();
      };

      const redraw = () => {
        const width = drawingCanvas.clientWidth;
        const height = drawingCanvas.clientHeight;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        drawingCanvas.width = Math.max(1, Math.round(width * pixelRatio));
        drawingCanvas.height = Math.max(1, Math.round(height * pixelRatio));
        drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        drawingContext.clearRect(0, 0, width, height);
        strokes.forEach(drawStroke);
      };

      const updateButtonState = () => {
        const isEmpty = strokes.length === 0;
        resetButton.disabled = isEmpty || isSending;
        undoButton.disabled = isEmpty || isSending;
        sendButton.disabled = isEmpty || isSending;
      };

      const clearDrawing = () => {
        strokes.length = 0;
        undoneStrokes.length = 0;
        activeStroke = null;
        halftone.classList.remove("is-drawing", "has-drawing");
        redraw();
        updateButtonState();
      };

      const encodeSvgDrawing = () => {
        const viewBoxWidth = 1200;
        const viewBoxHeight = 320;
        const formatCoordinate = (value) => Number(value.toFixed(1));
        const shapes = strokes.map((stroke) => {
          const points = stroke.map(({ x, y }) => ({
            x: formatCoordinate(x * viewBoxWidth),
            y: formatCoordinate(y * viewBoxHeight),
          }));

          if (points.length === 1) {
            return `<circle cx="${points[0].x}" cy="${points[0].y}" r="2"/>`;
          }

          const path = points
            .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
            .join(" ");
          return `<path d="${path}"/>`;
        }).join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
        const bytes = new TextEncoder().encode(svg);
        const chunks = [];

        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
        }

        return `data:image/svg+xml;base64,${btoa(chunks.join(""))}`;
      };

      const setSendLabel = (label) => {
        sendButtonLabel.textContent = label;
      };

      const createDocumentId = () => {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const randomValues = crypto.getRandomValues(new Uint8Array(20));
        return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
      };

      const saveGuestbookDocument = async (fields) => {
        const projectId = encodeURIComponent(firebaseConfig.projectId);
        const documentName = `projects/${firebaseConfig.projectId}/databases/(default)/documents/guestbook/${createDocumentId()}`;
        const endpoint = new URL(
          `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
        );
        endpoint.searchParams.set("key", firebaseConfig.apiKey);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            writes: [{
              update: { name: documentName, fields },
              updateTransforms: [{
                fieldPath: "createdAt",
                setToServerValue: "REQUEST_TIME",
              }],
              currentDocument: { exists: false },
            }],
          }),
        });

        if (!response.ok) {
          throw new Error(`Firestore 저장 실패: ${response.status}`);
        }
      };

      const getPoint = (event) => {
        const bounds = drawingCanvas.getBoundingClientRect();
        return {
          x: (event.clientX - bounds.left) / bounds.width,
          y: (event.clientY - bounds.top) / bounds.height,
        };
      };

      drawingCanvas.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;

        event.preventDefault();
        undoneStrokes.length = 0;
        activeStroke = [getPoint(event)];
        strokes.push(activeStroke);
        halftone.classList.add("is-drawing", "has-drawing");
        drawingCanvas.setPointerCapture(event.pointerId);
        drawStroke(activeStroke);
        updateButtonState();
      });

      drawingCanvas.addEventListener("pointermove", (event) => {
        if (!activeStroke) return;

        const previousPoint = activeStroke[activeStroke.length - 1];
        const nextPoint = getPoint(event);
        activeStroke.push(nextPoint);

        drawingContext.strokeStyle = "#000";
        drawingContext.lineWidth = getPenWidth();
        drawingContext.lineCap = "round";
        drawingContext.lineJoin = "round";
        drawingContext.beginPath();
        drawingContext.moveTo(
          previousPoint.x * drawingCanvas.clientWidth,
          previousPoint.y * drawingCanvas.clientHeight,
        );
        drawingContext.lineTo(
          nextPoint.x * drawingCanvas.clientWidth,
          nextPoint.y * drawingCanvas.clientHeight,
        );
        drawingContext.stroke();
      });

      const finishDrawing = (event) => {
        if (!activeStroke) return;

        activeStroke = null;
        halftone.classList.remove("is-drawing");
        if (drawingCanvas.hasPointerCapture(event.pointerId)) {
          drawingCanvas.releasePointerCapture(event.pointerId);
        }
      };

      drawingCanvas.addEventListener("pointerup", finishDrawing);
      drawingCanvas.addEventListener("pointercancel", finishDrawing);
      resetButton.addEventListener("click", () => {
        if (strokes.length === 0 || isSending) return;

        resetConfirmDialog.returnValue = "";
        resetConfirmDialog.showModal();
      });
      resetConfirmDialog.addEventListener("close", () => {
        if (resetConfirmDialog.returnValue === "confirm") {
          clearDrawing();
        }
      });

      const undoDrawing = () => {
        if (strokes.length === 0 || isSending) return false;

        activeStroke = null;
        undoneStrokes.push(strokes.pop());
        halftone.classList.remove("is-drawing");
        halftone.classList.toggle("has-drawing", strokes.length > 0);
        redraw();
        updateButtonState();
        return true;
      };

      const redoDrawing = () => {
        if (undoneStrokes.length === 0 || isSending) return false;

        strokes.push(undoneStrokes.pop());
        halftone.classList.add("has-drawing");
        redraw();
        updateButtonState();
        return true;
      };

      undoButton.addEventListener("click", undoDrawing);
      document.addEventListener("keydown", (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

        const key = event.key.toLowerCase();
        const isZ = event.code === "KeyZ" || key === "z";
        const isY = event.code === "KeyY" || key === "y";
        const isUndo = isZ && !event.shiftKey;
        const isRedo = isY || (isZ && event.shiftKey);

        if ((isUndo && undoDrawing()) || (isRedo && redoDrawing())) {
          event.preventDefault();
        }
      });

      const sendDrawing = async () => {
        if (strokes.length === 0 || isSending) return;

        if (!firebaseConfig.apiKey?.trim() || !firebaseConfig.projectId?.trim()) {
          setSendLabel("설정 필요");
          window.setTimeout(() => setSendLabel("보내기"), 1600);
          return;
        }

        const image = encodeSvgDrawing();
        if (image.length > 750_000) {
          setSendLabel("그림이 너무 큼");
          window.setTimeout(() => setSendLabel("보내기"), 1600);
          return;
        }

        isSending = true;
        updateButtonState();
        setSendLabel("보내는 중");
        sendButton.setAttribute("aria-busy", "true");

        try {
          await saveGuestbookDocument({ image: { stringValue: image } });
          clearDrawing();
          setSendLabel("완료");
          window.dispatchEvent(new CustomEvent("guestbook:refresh"));
        } catch (error) {
          console.error("그림을 Firestore에 저장하지 못했습니다.", error);
          setSendLabel("다시 시도");
        } finally {
          isSending = false;
          sendButton.removeAttribute("aria-busy");
          updateButtonState();
          window.setTimeout(() => setSendLabel("보내기"), 1600);
        }
      };

      sendButton.addEventListener("click", () => {
        if (strokes.length === 0 || isSending) return;

        confirmDialog.returnValue = "";
        confirmDialog.showModal();
      });
      confirmDialog.addEventListener("close", () => {
        if (confirmDialog.returnValue === "confirm") {
          void sendDrawing();
        }
      });
      new ResizeObserver(redraw).observe(halftone);
      redraw();
      updateButtonState();
    }
  }

  const shaderCanvas = document.createElement("canvas");
  shaderCanvas.width = 240;
  shaderCanvas.height = 64;

  const dots = [...halftone.querySelectorAll(".halftone-dot")];
  const gl = shaderCanvas.getContext("webgl", {
    alpha: false,
    antialias: false,
  });

  if (gl) {
    const vertexShaderSource = `
      attribute vec2 a_position;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;

      uniform float u_time;
      uniform float u_speed;
      uniform vec2 u_resolution;

      float random(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        vec2 smoothLocal = local * local * (3.0 - 2.0 * local);

        float bottomLeft = random(cell);
        float bottomRight = random(cell + vec2(1.0, 0.0));
        float topLeft = random(cell + vec2(0.0, 1.0));
        float topRight = random(cell + vec2(1.0, 1.0));

        return mix(
          mix(bottomLeft, bottomRight, smoothLocal.x),
          mix(topLeft, topRight, smoothLocal.x),
          smoothLocal.y
        );
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.5;

        for (int octave = 0; octave < 3; octave++) {
          value += noise(point) * amplitude;
          point = point * 2.03 + vec2(13.1, 7.7);
          amplitude *= 0.5;
        }

        return value;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        float aspectRatio = u_resolution.x / u_resolution.y;
        vec2 blobCenter = vec2(
          0.5 + sin(u_time * 0.43) * 0.27,
          0.5 + cos(u_time * 0.61) * 0.13
        );
        vec2 blobOffset = (uv - blobCenter) * vec2(aspectRatio, 1.0);
        vec2 velocity = vec2(
          cos(u_time * 0.43) * 0.27 * 0.43 * aspectRatio,
          -sin(u_time * 0.61) * 0.13 * 0.61
        );
        vec2 direction = normalize(velocity + vec2(0.0001));
        vec2 normal = vec2(-direction.y, direction.x);
        float parallelDistance = dot(blobOffset, direction);
        float normalDistance = dot(blobOffset, normal);
        float stretch = mix(1.0, 2.4, u_speed);
        float shapedDistance = length(vec2(parallelDistance / stretch, normalDistance));
        vec2 noisePosition = uv * vec2(6.0, 1.6);
        noisePosition += vec2(u_time * 0.13, -u_time * 0.08);
        float edgeNoise = fbm(noisePosition);
        float blobRadius = mix(0.055, 0.12, u_speed);
        blobRadius += edgeNoise * mix(0.055, 0.11, u_speed);
        float monochrome = step(shapedDistance, blobRadius);

        gl_FragColor = vec4(vec3(monochrome), 1.0);
      }
    `;

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`하프톤 셰이더 컴파일 실패: ${message}`);
      }

      return shader;
    };

    const program = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`하프톤 셰이더 연결 실패: ${gl.getProgramInfoLog(program)}`);
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "u_time");
    const speedLocation = gl.getUniformLocation(program, "u_speed");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const pixels = new Uint8Array(shaderCanvas.width * shaderCanvas.height * 4);
    const columns = 30;
    const rows = 8;
    let previousFrameTime = 0;
    let previousTimestamp = 0;
    let effectTime = 0;

    gl.viewport(0, 0, shaderCanvas.width, shaderCanvas.height);
    gl.uniform2f(resolutionLocation, shaderCanvas.width, shaderCanvas.height);

    const applyBlobToDots = () => {
      gl.readPixels(
        0,
        0,
        shaderCanvas.width,
        shaderCanvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );

      const whiteCells = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const sampleX = Math.floor(((column + 0.5) / columns) * shaderCanvas.width);
          const sampleY = Math.floor(((rows - row - 0.5) / rows) * shaderCanvas.height);
          const pixelOffset = (sampleY * shaderCanvas.width + sampleX) * 4;

          if (pixels[pixelOffset] > 127) {
            whiteCells.push({ column, row });
          }
        }
      }

      dots.forEach((dot, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        let closestDistance = Infinity;

        whiteCells.forEach((whiteCell) => {
          const distance = Math.hypot(
            column - whiteCell.column,
            row - whiteCell.row,
          );
          closestDistance = Math.min(closestDistance, distance);
        });

        const influenceRadius = 5;
        const proximity = Math.max(0, 1 - closestDistance / influenceRadius);
        const intensity = proximity * proximity * (3 - 2 * proximity);
        const nextState = Math.round(intensity * 100).toString();

        if (dot.dataset.effectLevel === nextState) {
          return;
        }

        dot.dataset.effectLevel = nextState;
        dot.style.setProperty("--dot-scale", (1 + intensity * 1).toFixed(3));
        dot.style.setProperty("--primary-mix", `${(intensity * 100).toFixed(1)}%`);
      });
    };

    const render = (timestamp) => {
      if (!previousTimestamp) {
        previousTimestamp = timestamp;
      }

      const deltaTime = Math.min((timestamp - previousTimestamp) / 1000, 0.1);
      const speed = 2 + Math.sin((timestamp / 1000) * 0.65) * 0.5;
      const speedAmount = speed - 1.5;
      effectTime += deltaTime * speed;
      previousTimestamp = timestamp;

      if (timestamp - previousFrameTime >= 1000 / 30) {
        previousFrameTime = timestamp;
        gl.uniform1f(timeLocation, effectTime);
        gl.uniform1f(speedLocation, speedAmount);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        applyBlobToDots();
      }

      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
  }
}
