/* Prism shader adapted from Spell UI, MIT. See animated-gradient.LICENSE.txt. */
(function (root) {
  "use strict";
  const fragmentSource = "#version 300 es\nprecision highp float;\n\nuniform float u_time;\nuniform float u_pixelRatio;\nuniform vec2 u_resolution;\n\nuniform float u_scale;\nuniform float u_rotation;\nuniform vec4 u_color1;\nuniform vec4 u_color2;\nuniform vec4 u_color3;\nuniform float u_proportion;\nuniform float u_softness;\nuniform float u_shape;\nuniform float u_shapeScale;\nuniform float u_distortion;\nuniform float u_swirl;\nuniform float u_swirlIterations;\n\nout vec4 fragColor;\n\n#define TWO_PI 6.28318530718\n#define PI 3.14159265358979323846\n\nvec2 rotate(vec2 uv, float th) {\n  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;\n}\n\nfloat random(vec2 st) {\n  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);\n}\n\nfloat noise(vec2 st) {\n  vec2 i = floor(st);\n  vec2 f = fract(st);\n  float a = random(i);\n  float b = random(i + vec2(1.0, 0.0));\n  float c = random(i + vec2(0.0, 1.0));\n  float d = random(i + vec2(1.0, 1.0));\n\n  vec2 u = f * f * (3.0 - 2.0 * f);\n\n  float x1 = mix(a, b, u.x);\n  float x2 = mix(c, d, u.x);\n  return mix(x1, x2, u.y);\n}\n\nvec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur) {\n    vec3 color1 = c1.rgb * c1.a;\n    vec3 color2 = c2.rgb * c2.a;\n    vec3 color3 = c3.rgb * c3.a;\n\n    float r1 = smoothstep(.0 + .35 * edgesWidth, .7 - .35 * edgesWidth + .5 * edge_blur, mixer);\n    float r2 = smoothstep(.3 + .35 * edgesWidth, 1. - .35 * edgesWidth + edge_blur, mixer);\n\n    vec3 blended_color_2 = mix(color1, color2, r1);\n    float blended_opacity_2 = mix(c1.a, c2.a, r1);\n\n    vec3 c = mix(blended_color_2, color3, r2);\n    float o = mix(blended_opacity_2, c3.a, r2);\n    return vec4(c, o);\n}\n\nvoid main() {\n    vec2 uv = gl_FragCoord.xy / u_resolution.xy;\n\n    float t = .5 * u_time;\n\n    float noise_scale = .0005 + .006 * u_scale;\n\n    uv -= .5;\n    uv *= (noise_scale * u_resolution);\n    uv = rotate(uv, u_rotation * .5 * PI);\n    uv /= u_pixelRatio;\n    uv += .5;\n\n    float n1 = noise(uv * 1. + t);\n    float n2 = noise(uv * 2. - t);\n    float angle = n1 * TWO_PI;\n    uv.x += 4. * u_distortion * n2 * cos(angle);\n    uv.y += 4. * u_distortion * n2 * sin(angle);\n\n    float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));\n    for (float i = 1.; i <= iterations_number; i++) {\n        uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);\n        uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1. * uv.x);\n    }\n\n    float proportion = clamp(u_proportion, 0., 1.);\n\n    float shape = 0.;\n    float mixer = 0.;\n    if (u_shape < .5) {\n      vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);\n      shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);\n      mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);\n    } else if (u_shape < 1.5) {\n      vec2 stripes_shape_uv = uv * (.25 + 3. * u_shapeScale);\n      float f = fract(stripes_shape_uv.y);\n      shape = smoothstep(.0, .55, f) * smoothstep(1., .45, f);\n      mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);\n    } else {\n      float sh = 1. - uv.y;\n      sh -= .5;\n      sh /= (noise_scale * u_resolution.y);\n      sh += .5;\n      float shape_scaling = .2 * (1. - u_shapeScale);\n      shape = smoothstep(.45 - shape_scaling, .55 + shape_scaling, sh + .3 * (proportion - .5));\n      mixer = shape;\n    }\n\n    vec4 color_mix = blend_colors(u_color1, u_color2, u_color3, mixer, 1. - clamp(u_softness, 0., 1.), .01 + .01 * u_scale);\n\n    fragColor = vec4(color_mix.rgb, color_mix.a);\n}\n";

  function mount(headers) {
    const canvas = document.createElement("canvas");
    canvas.className = "animated-gradient-canvas";
    canvas.setAttribute("aria-hidden", "true");
    let gl;
    try { gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "low-power" }); }
    catch (_) { return; }
    if (!gl) return; // CSS provides a static Prism fallback.
    const shaders = [];
    let program, buffer;
    try {
      function shader(type, source) {
        const item = gl.createShader(type);
        shaders.push(item);
        gl.shaderSource(item, source);
        gl.compileShader(item);
        if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) throw new Error("Gradient shader unavailable");
        return item;
      }
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, "#version 300 es\nin vec4 a_position; void main() { gl_Position = a_position; }"));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Gradient program unavailable");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    } catch (_) {
      if (program) gl.deleteProgram(program);
      shaders.forEach(item => gl.deleteShader(item));
      if (buffer) gl.deleteBuffer(buffer);
      return;
    }
    const uniform = name => gl.getUniformLocation(program, name);
    const time = uniform("u_time"), resolution = uniform("u_resolution");
    const params = { u_pixelRatio:1, u_scale:.01, u_rotation:-50*Math.PI/180,
      u_proportion:.01, u_softness:.47, u_shape:0, u_shapeScale:.45,
      u_distortion:0, u_swirl:.5, u_swirlIterations:16 };
    Object.entries(params).forEach(([key, value]) => gl.uniform1f(uniform(key), value));
    gl.uniform4f(uniform("u_color1"), 5/255,5/255,5/255,1);
    gl.uniform4f(uniform("u_color2"), 102/255,179/255,1,1);
    gl.uniform4f(uniform("u_color3"), 1,1,1,1);
    const reduced = root.matchMedia("(prefers-reduced-motion: reduce)");
    const workspace = document.getElementById("testWorkspace");
    let target, frame = 0, lastFrame = -Infinity, elapsed = 0, lastTime = 0;
    function draw() {
      if (!target) return;
      // Preserve the shader's coordinate scale while limiting GPU work.
      const width = Math.max(1, target.clientWidth), height = Math.max(1, target.clientHeight);
      const ratio = Math.min(1, 768 / width, 200 / height);
      if (canvas.width !== Math.round(width*ratio) || canvas.height !== Math.round(height*ratio)) {
        canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
        gl.viewport(0,0,canvas.width,canvas.height);
      }
      gl.uniform1f(uniform("u_pixelRatio"), ratio);
      gl.uniform1f(time, elapsed * .35 - .5);
      // gl_FragCoord and resolution must use the same pixel grid.
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }
    function animate(timestamp) {
      frame = root.requestAnimationFrame(animate);
      if (timestamp-lastFrame < 50) return;
      if (lastTime) elapsed += Math.min((timestamp-lastTime)/1000, .15);
      lastTime = timestamp; lastFrame = timestamp;
      draw();
    }
    function sync() {
      root.cancelAnimationFrame(frame); frame=0; lastTime=0;
      const next = headers.find(header => !header.closest(".app-view")?.classList.contains("hidden") && header.getClientRects().length);
      if (next !== target) {
        if (target) resize.unobserve(target);
        target = next;
        if (target) { target.querySelector(".animated-gradient").appendChild(canvas); resize.observe(target); }
      }
      if (!target || gl.isContextLost() || document.hidden || (workspace && !workspace.classList.contains("hidden"))) return;
      draw();
      if (!reduced.matches) frame = root.requestAnimationFrame(animate);
    }
    const resize = new ResizeObserver(draw);
    const observer = new MutationObserver(sync);
    document.querySelectorAll(".app-view").forEach(view => observer.observe(view, { attributes:true, attributeFilter:["class"] }));
    if (workspace) observer.observe(workspace, {attributes:true,attributeFilter:["class"]});
    document.addEventListener("visibilitychange",sync);
    reduced.addEventListener("change",sync);
    canvas.addEventListener("webglcontextlost", event => {
      event.preventDefault(); root.cancelAnimationFrame(frame); canvas.hidden=true;
    });
    root.addEventListener("pagehide", () => {
      root.cancelAnimationFrame(frame);observer.disconnect();resize.disconnect();
      document.removeEventListener("visibilitychange",sync);reduced.removeEventListener("change",sync);
      gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(item=>gl.deleteShader(item));
    }, {once:true});
    sync();
  }
  root.CaijAnimatedGradient = { mount };
})(window);
