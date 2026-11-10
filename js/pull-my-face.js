/*
 * Pull My Face
 * Drag the portrait and it stretches like a rough low-poly mesh with a CRT/neon glitch.
 *
 * Usage: wrap the portrait <img> in an element with [data-pull-face]. The <img> is the fallback:
 * it is what shows until WebGL is ready, and what stays if WebGL, the texture, or the context fails.
 * The canvas is only inserted on top once the first frame has been drawn.
 */
(() => {
  const stage = document.querySelector('[data-pull-face]');
  if (!stage) return;
  const base = stage.querySelector('img');
  if (!base) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MOT = reduce ? 0.4 : 1;
  const N = 10;           // mesh cells per side: big, ugly triangles
  const SCENE_H = 240;    // internal render height, PS1-ish
  const TICK = 1 / 30;    // mesh animates at 30 steps per second

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  // The canvas only draws. It ignores pointers so touches fall through to the page (scrolling) unless they land in the grab zone below.
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';

  // The grab zone is the only thing that takes pointer input. On touch screens it is inset from the picture's edges,
  // so a thumb scrolling the page past the face lands in the padding ring and scrolls instead of snagging.
  // touch-action:none applies only inside the zone (that is what lets the drag pull without the page scrolling).
  const grabber = document.createElement('div');
  grabber.setAttribute('aria-hidden', 'true');
  grabber.style.cssText = 'position:absolute;touch-action:none;cursor:default;user-select:none;-webkit-user-select:none;' +
    '-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;';
  const coarse = matchMedia('(pointer: coarse)');
  const TOUCH_PAD = '20%';   // padding ring on each side on touch screens: the grab zone is the middle 60%
  const sizeGrabber = () => { grabber.style.inset = coarse.matches ? TOUCH_PAD : '0'; };
  sizeGrabber();
  if (coarse.addEventListener) coarse.addEventListener('change', sizeGrabber);
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;   // the <img> stays

  // ---------- shaders
  const HP = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
  // pass 1: the face mesh, flat-lit, 4-bit colour with ordered dither, into a small offscreen texture
  const VS1 = `attribute vec2 aPos; attribute vec2 aUv; attribute float aShade;
varying vec2 vUv; varying float vShade;
void main(){ gl_Position = vec4(aPos, 0., 1.); vUv = aUv; vShade = aShade; }`;
  const FS1 = HP + `uniform sampler2D uTex; uniform float uClean; varying vec2 vUv; varying float vShade;
float bayer4(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  float x0 = mod(q.x, 2.0), y0 = mod(q.y, 2.0), x1 = floor(q.x / 2.0), y1 = floor(q.y / 2.0);
  return (abs(x0 - y0) * 8.0 + y0 * 4.0 + abs(x1 - y1) * 2.0 + y1) / 16.0;
}
void main(){
  vec3 t = texture2D(uTex, vUv).rgb;
  if (uClean > 0.5) { gl_FragColor = vec4(t, 1.); return; }
  // the flat yellow is never lit, dithered or tinted; only the face takes the shading
  vec3 bg = vec3(0.996, 0.953, 0.004);
  float face = smoothstep(0.12, 0.4, distance(t, bg));
  vec3 c = clamp(t * vShade, 0., 1.);
  c = floor(c * 15.0 + bayer4(gl_FragCoord.xy)) / 15.0;
  gl_FragColor = vec4(mix(bg, c, face), 1.);
}`;

  // pass 2: CRT treatment of the offscreen picture, scaled up with nearest filtering
  const VS2 = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;
  const FS2 = HP + `
uniform sampler2D uScene;
uniform vec2 uRes; uniform float uPx; uniform float uSize; uniform float uTime;
uniform float uG; uniform vec2 uCur; uniform float uHov; uniform float uCrt; uniform float uMot;
uniform vec2 uScenePx;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main(){
  vec2 sc = gl_FragCoord.xy / uRes;

  float tt = floor(uTime * 14.0);
  float t60 = floor(uTime * 60.0);
  float aspect = uRes.x / uRes.y;
  float cd = length((sc - uCur) * vec2(aspect, 1.0));
  float g = (uG + uHov * 0.55 * smoothstep(0.45, 0.0, cd)) * uCrt * uMot;

  // horizontal tearing bands + line wobble
  float rb = floor(sc.y * 48.0);
  float hit = step(1.0 - 0.10 * g, hash(vec2(rb, tt)));
  sc.x += hit * (hash(vec2(rb, tt + 7.0)) - 0.5) * 0.18 * g;
  float lineId = floor(gl_FragCoord.y / (uPx * 2.0));
  sc.x += (hash(vec2(lineId, t60)) - 0.5) * 0.004 * g;

  float kx = uSize / uRes.x;
  float ca = (0.0015 + 0.012 * g) * uCrt * kx;
  float bl = (0.0015 + 0.010 * g) * uCrt * kx;
  vec3 col;
  col.r = 0.5 * (texture2D(uScene, sc + vec2( ca + bl, 0.0)).r + texture2D(uScene, sc + vec2( ca - bl, 0.0)).r);
  col.g = 0.5 * (texture2D(uScene, sc + vec2( bl, 0.0)).g + texture2D(uScene, sc - vec2( bl, 0.0)).g);
  col.b = 0.5 * (texture2D(uScene, sc + vec2(-ca + bl, 0.0)).b + texture2D(uScene, sc + vec2(-ca - bl, 0.0)).b);

  // pure white (outside the picture) stays pure white; every effect below only touches the picture
  float paper = smoothstep(0.985, 1.0, min(col.r, min(col.g, col.b)));
  float fx = (1.0 - paper) * uCrt;

  // neon: glowing facet edges and tinted tears
  {
    float amt = fx;
    float act = clamp(0.35 + g, 0.0, 1.4);
    vec2 ex = vec2(uScenePx.x, 0.0), ey = vec2(0.0, uScenePx.y);
    float e = length(texture2D(uScene, sc + ex).rgb - texture2D(uScene, sc - ex).rgb)
            + length(texture2D(uScene, sc + ey).rgb - texture2D(uScene, sc - ey).rgb);
    float edge = smoothstep(0.45, 1.0, e);
    vec3 neonA = vec3(0.0, 1.0, 0.9), neonB = vec3(1.0, 0.1, 0.8);
    vec3 neon = mix(neonA, neonB, 0.5 + 0.5 * sin((sc.y * 3.0 + uTime * 0.6) * 6.2831853));
    col += neon * edge * 0.6 * amt * act;
    col = mix(col, neon, hit * 0.2 * amt);
  }

  // static fuzz
  float n = hash(gl_FragCoord.xy + t60 * 1.37);
  float n2 = hash(floor(gl_FragCoord.xy / (uPx * 2.0)) + t60 * 3.1);
  col += ((n - 0.5) * (0.04 + 0.17 * g) + (n2 - 0.5) * 0.05 * g) * fx;

  col *= 1.0 + 0.012 * sin(uTime * 60.0) * fx * uMot;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function compileShader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return null; }
    return p;
  }
  const P1 = program(VS1, FS1), P2 = program(VS2, FS2);
  if (!P1 || !P2) return;   // the <img> stays
  const loc = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  const U1 = loc(P1, ['uTex', 'uClean']);
  const U2 = loc(P2, ['uScene', 'uRes', 'uPx', 'uSize', 'uTime', 'uG', 'uCur', 'uHov', 'uCrt', 'uMot', 'uScenePx']);
  const A1 = { pos: gl.getAttribLocation(P1, 'aPos'), uv: gl.getAttribLocation(P1, 'aUv'), shade: gl.getAttribLocation(P1, 'aShade') };
  const A2 = gl.getAttribLocation(P2, 'p');

  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const meshBuf = gl.createBuffer();

  // ---------- rough mesh (jittered grid, random diagonals), built once
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = N + 1, vu = new Float32Array(V * V), vv = new Float32Array(V * V);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    let u = i / N, v = j / N;
    if (i > 0 && i < N && j > 0 && j < N) { u += (rnd() - 0.5) * 0.8 / N; v += (rnd() - 0.5) * 0.8 / N; }
    vu[j * V + i] = u; vv[j * V + i] = v;
  }
  const tris = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    if (rnd() > 0.5) tris.push(a, b, d, a, d, c); else tris.push(a, b, c, b, d, c);
  }
  const TRI = tris.length / 3;
  const px = new Float32Array(V * V), py = new Float32Array(V * V), pz = new Float32Array(V * V);
  const data = new Float32Array(TRI * 3 * 5);
  const L = [-0.45, 0.5, 0.74];

  // grab = rest-space point being pulled; (dx, dy) = its displacement; vertices are pinned along the picture edges
  const hist = [];   // recent spring positions, one per 30 Hz step: the far side of the face lags behind the grabbed spot
  const HIST = 8;
  function buildMesh(grab, pull, lowRes) {
    const R = 0.5 + 0.4 * pull;
    const n = hist.length;
    const bulge = 0.25 * pull;      // skin tents outward around the pulled point
    for (let k = 0; k < V * V; k++) {
      const u = vu[k], v = vv[k];
      const du = u - grab.u, dv = v - grab.v;
      const d = Math.hypot(du, dv);
      const cone = Math.max(0, 1 - d / R);
      const pin = Math.min(1, Math.min(u, 1 - u, v, 1 - v) / 0.1);
      const w = cone * pin;
      let hx = 0, hy = 0;
      if (n) { const i = Math.max(0, n - 1 - Math.round(Math.min(1, d / R) * 5)); hx = hist[i][0]; hy = hist[i][1]; }
      px[k] = u + hx * w + du * bulge * w;
      py[k] = v + hy * w + dv * bulge * w;
      pz[k] = (Math.hypot(hx, hy) * 2.2 + pull * 0.25) * w;
    }
    let o = 0;
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a];
      const wx = px[c] - px[a], wy = py[c] - py[a], wz = pz[c] - pz[a];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      let shade = 1 + 1.1 * (nx * L[0] + ny * L[1] + nz * L[2] - L[2]);
      shade = Math.round(Math.min(1.2, Math.max(0.8, shade)) * 6) / 6;
      for (const m of [a, b, c]) {
        // in the rough look, snap every vertex to a whole pixel of the low-res scene
        const fx_ = (px[m] * size + offX) / W, fy_ = (py[m] * size + offY) / H;
        const sx = lowRes ? Math.round(fx_ * sw) / sw : fx_;
        const sy = lowRes ? Math.round(fy_ * sh) / sh : fy_;
        data[o++] = sx * 2 - 1;
        data[o++] = sy * 2 - 1;
        data[o++] = vu[m]; data[o++] = vv[m];
        data[o++] = shade;
      }
    }
  }

  // ---------- sizing + offscreen target
  let W = 1, H = 1, offX = 0, offY = 0, dpr = 1, size = 1, cw = 1, ch = 1, sw = 1, sh = 1;
  let fbo = null, scene = null;
  function makeTarget() {
    if (scene) gl.deleteTexture(scene);
    if (fbo) gl.deleteFramebuffer(fbo);
    scene = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, scene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sw, sh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scene, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cw = Math.round(W * dpr); ch = Math.round(H * dpr);
    canvas.width = cw; canvas.height = ch;
    size = Math.min(W, H);
    offX = (W - size) / 2; offY = (H - size) / 2;
    sh = SCENE_H; sw = Math.max(2, Math.round(SCENE_H * W / H));
    makeTarget();
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else addEventListener('resize', resize);

  // ---------- state (effects run only while touched; the neon edge glow is always part of the look)
  let crt = 0;
  let drag = false, pid = -1;
  const grab = { u: 0.5, v: 0.5 };
  const tgt = { x: 0, y: 0 };
  let dx = 0, dy = 0, vx = 0, vy = 0;      // live spring
  let spull = 0, acc = 0;                  // mesh state is sampled in 30 Hz steps
  let hovering = false, hov = 0;
  const cur = { sx: 0.5, sy: 0.5 };
  let gS = 0, burst = 0;
  let lastP = null, lastPos = null, speed = 0;
  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);

  // pointer (client px) -> mesh uv + canvas-relative coords
  function toImg(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const sx = x / W, sy = 1 - y / H;
    return { u: (sx * W - offX) / size, v: (sy * H - offY) / size, sx, sy };
  }
  const inside = p => p.u >= 0 && p.u <= 1 && p.v >= 0 && p.v <= 1;

  grabber.addEventListener('pointerdown', e => {
    if (drag) return;
    const p = toImg(e.clientX, e.clientY);
    if (!inside(p)) return;
    grabber.setPointerCapture(e.pointerId);
    const still = Math.hypot(dx, dy) > 0.01 && Math.hypot(p.u - (grab.u + dx), p.v - (grab.v + dy)) < 0.3;
    if (!still) { grab.u = p.u; grab.v = p.v; dx = dy = vx = vy = 0; }
    tgt.x = p.u - grab.u; tgt.y = p.v - grab.v;
    drag = true; pid = e.pointerId;
    burst = Math.max(burst, 1.0);
    grabber.style.cursor = 'grabbing';
    e.preventDefault();
  });
  grabber.addEventListener('pointermove', e => {
    const p = toImg(e.clientX, e.clientY);
    cur.sx = p.sx; cur.sy = p.sy;
    if (!drag) {
      const now = inside(p);
      hovering = now;
      grabber.style.cursor = now ? 'grab' : 'default';
    }
    if (drag && e.pointerId === pid) {
      const rx = p.u - grab.u, ry = p.v - grab.v;
      const len = Math.hypot(rx, ry) || 1e-6, max = 0.7;
      const k = max * Math.tanh(len / max) / len;
      tgt.x = rx * k; tgt.y = ry * k;
    }
    lastPos = [e.clientX, e.clientY];
  });
  grabber.addEventListener('pointerleave', () => { if (!drag) { hovering = false; grabber.style.cursor = 'default'; } });
  function release(e) {
    if (!drag || e.pointerId !== pid) return;
    drag = false; pid = -1; burst = Math.max(burst, 0.5);
    grabber.style.cursor = 'grab';
    if (e.pointerType !== 'mouse') hovering = false;
  }
  grabber.addEventListener('pointerup', release);
  grabber.addEventListener('pointercancel', release);
  grabber.addEventListener('contextmenu', e => e.preventDefault());

  // if the GPU drops the context, pull the canvas and let the <img> fallback show again
  let dead = false;
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); dead = true; canvas.remove(); grabber.remove(); });

  let faceHi = null, faceLo = null;
  let last = performance.now();
  function frame(now) {
    if (dead) return;
    if (!visible) { last = now; requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;

    // spring: stiff and snappy while held, a violent twang on release
    const k = drag ? 900 : 260, c = drag ? 60 : 3.5;
    const tx = drag ? tgt.x : 0, ty = drag ? tgt.y : 0;
    let rem = dt;
    while (rem > 1e-6) {
      const s = Math.min(1 / 240, rem); rem -= s;
      vx += (-k * (dx - tx) - c * vx) * s;
      vy += (-k * (dy - ty) - c * vy) * s;
      dx += vx * s; dy += vy * s;
    }
    if (!drag && Math.abs(dx) + Math.abs(dy) < 1e-4 && Math.abs(vx) + Math.abs(vy) < 1e-3) { dx = dy = vx = vy = 0; }
    const pull = Math.min(1, Math.hypot(dx, dy) / 0.5);

    // the mesh only updates in 30 Hz steps
    acc += dt;
    if (acc >= TICK) { acc %= TICK; hist.push([dx, dy]); if (hist.length > HIST) hist.shift(); spull = pull; }

    // pointer speed -> glitch
    if (lastPos) {
      if (lastP) speed += (Math.hypot(lastPos[0] - lastP[0], lastPos[1] - lastP[1]) / H / dt - speed) * Math.min(1, dt * 12);
      lastP = lastPos;
    }
    if (!hovering && !drag) speed *= Math.exp(-dt * 6);

    const baseG = reduce ? 0.02 : 0.06;
    const want = baseG + (hovering ? 0.28 : 0) + Math.min(0.5, speed * 0.35) + (drag ? 0.4 + 0.35 * pull : 0) + pull * 0.15;
    gS += (want - gS) * (1 - Math.exp(-dt * (want > gS ? 14 : 4)));
    burst *= Math.exp(-dt * 3.5);
    const G = Math.min(1.3, gS + burst);

    hov += (((hovering || drag) ? 1 : 0) - hov) * (1 - Math.exp(-dt * (hovering ? 12 : 3)));

    // CRT level: only while touched / wobbling
    const active = drag || pull > 0.02 || burst > 0.15;
    const crtTarget = active ? 1 : 0;
    crt += (crtTarget - crt) * (1 - Math.exp(-dt * (crtTarget > crt ? 14 : 3)));
    if (crt < 0.002 && crtTarget === 0) crt = 0;

    // resting: the clean full-res photo. touched: rough low-res mesh -> offscreen target, then CRT pass
    const ps1 = crt > 0.002 || crtTarget === 1;
    if (!ps1) { dx = dy = vx = vy = 0; hist.length = 0; spull = 0; }
    buildMesh(grab, spull, ps1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, ps1 ? fbo : null);
    gl.viewport(0, 0, ps1 ? sw : cw, ps1 ? sh : ch);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(P1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ps1 ? faceLo : faceHi);
    gl.uniform1i(U1.uTex, 0);
    gl.uniform1f(U1.uClean, ps1 ? 0 : 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(A1.pos); gl.vertexAttribPointer(A1.pos, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(A1.uv); gl.vertexAttribPointer(A1.uv, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(A1.shade); gl.vertexAttribPointer(A1.shade, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, TRI * 3);
    gl.disableVertexAttribArray(A1.pos); gl.disableVertexAttribArray(A1.uv); gl.disableVertexAttribArray(A1.shade);
    if (!ps1) { requestAnimationFrame(frame); return; }

    // pass 2: CRT -> screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.useProgram(P2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, scene);
    gl.uniform1i(U2.uScene, 1);
    gl.uniform2f(U2.uRes, cw, ch);
    gl.uniform1f(U2.uPx, dpr);
    gl.uniform1f(U2.uSize, size * dpr);
    gl.uniform1f(U2.uMot, MOT);
    gl.uniform1f(U2.uTime, (now / 1000) % 1000);
    gl.uniform1f(U2.uG, G);
    gl.uniform2f(U2.uCur, cur.sx, cur.sy);
    gl.uniform1f(U2.uHov, hov);
    gl.uniform1f(U2.uCrt, crt);
    gl.uniform2f(U2.uScenePx, 1 / sw, 1 / sh);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(A2); gl.vertexAttribPointer(A2, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disableVertexAttribArray(A2);
    requestAnimationFrame(frame);
  }

  // texture comes from the same <img> that serves as the fallback (whichever file its <picture> resolved to)
  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    // full-quality texture for the resting photo. WebGL1 only allows mipmaps on power-of-two sizes,
    // and the source image isn't one (800px), so redraw it into a 1024 canvas first.
    const big = document.createElement('canvas');
    big.width = big.height = 1024;
    const bctx = big.getContext('2d');
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(img, 0, 0, 1024, 1024);
    faceHi = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, faceHi);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, big);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // tiny blocky texture for the rough look
    const small = document.createElement('canvas');
    small.width = small.height = 256;
    const sctx = small.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(img, 0, 0, 256, 256);
    faceLo = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, faceLo);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, small);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) { console.warn('pull-my-face: texture upload failed (GL error ' + err + '), keeping fallback image'); return; }
    // draw the first (clean) frame, then reveal the canvas over the <img>
    resize();
    last = performance.now();
    frame(last);
    stage.appendChild(canvas);
    stage.appendChild(grabber);
  };
  // on error nothing happens: the <img> fallback is already on screen
  // currentSrc is the file the browser already downloaded for the <picture> (the WebP), so no second fetch
  img.src = base.currentSrc || base.getAttribute('src');
})();
