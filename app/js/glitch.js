// Manual 12.9: one WebGL layer shared by all shader-driven effects.
// GLSL and uniform binding come from app/data/fx_bindings.json, which is
// derived from the exported TarotBook materials; nothing is hand-tuned.
export async function createFxLayer(stageEl, width = 1920, height = 1080) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'fx-layer';
  stageEl.appendChild(canvas);
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
  if (!gl) return { gl: null, canvas, draw() {}, dispose() { canvas.remove(); } };
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertex, 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}');
  gl.compileShader(vertex);
  const programs = new Map();
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  return {
    gl,
    canvas,
    compile(name, source) {
      if (programs.has(name)) return programs.get(name);
      const fragment = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragment, source);
      gl.compileShader(fragment);
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      programs.set(name, program);
      return program;
    },
    draw(name, source, uniforms = {}, textures = {}) {
      const program = this.compile(name, source || 'precision mediump float;void main(){gl_FragColor=vec4(0.0);}');
      gl.useProgram(program);
      const p = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(p);
      gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
      let unit = 0;
      for (const [key, value] of Object.entries(textures)) {
        const loc = gl.getUniformLocation(program, key);
        if (!loc || !value) continue;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(loc, unit);
        unit++;
      }
      for (const [key, value] of Object.entries(uniforms)) {
        const loc = gl.getUniformLocation(program, key);
        if (!loc) continue;
        if (Array.isArray(value) && value.length === 2) gl.uniform2fv(loc, value);
        else if (Array.isArray(value) && value.length === 3) gl.uniform3fv(loc, value);
        else if (Array.isArray(value) && value.length === 4) gl.uniform4fv(loc, value);
        else if (typeof value === 'number') gl.uniform1f(loc, value);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      for (const program of programs.values()) gl.deleteProgram(program);
      gl.deleteShader(vertex);
      canvas.remove();
    },
  };
}
