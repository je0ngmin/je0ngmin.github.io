const halftone = document.querySelector(".halftone");

if (halftone instanceof HTMLElement) {
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
