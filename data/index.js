'use strict';

/**
 * Detects supported WebGL version by checking constructors
 * present in the global window object.
 *
 * If WebGL is not detected, returns 0
 * @returns {0 | 1 | 2}
 */
const getSupportedWebGLVersion = function () {
    if ('WebGL2RenderingContext' in window) {
        return 2;
    } else if ('WebGLRenderingContext' in window) {
        return 1;
    } else {
        return 0;
    }
};

/**
 * Creates a shader program from vertex shader and fragment shader.
 * @param {WebGLRenderingContext} gl
 *        WebGL Context in which the shader is going to be created.
 * @param {string} vsSource Source code for vertex shader
 * @param {string} fsSource Source code for fragment (pixel) shader
 *
 * @returns {WebGLProgram} a shader program for these
 *
 * @throws Error with textual description of compilation failure
 *
 * This function handles the creation of WebGLProgram from source.
 * `WebGLProgram`s cannot be shared between different contexts,
 * and must be deleted using gl.deleteProgram(program).
 *
 * If the compilation or linking of the shader fails at some point,
 * every intermediate resource is freed, hence the complexity of the code.
 */
const createShader = function (gl, vsSource, fsSource) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        const infoLog = gl.getShaderInfoLog(vs);
        // In case compilation fails, the shader should be deleted
        gl.deleteShader(vs);
        throw new Error('createShader, vertex shader compilation:\n' + infoLog);
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        const infoLog = gl.getShaderInfoLog(fs);
        // In this case, two shaders were allocated and must be deleted
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        throw new Error('createShader, fragment shader compilation:\n' + infoLog);
    }

    // In order to create a WebGL program, it is necessary to link
    // a vertex shader and a fragment shader.
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);

    // After shaders are attached, they must be freed
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    gl.linkProgram(program);

    // Shader linking may fail as well
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const infoLog = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('createShader, linking:\n' + infoLog);
    }

    return program;
};

/**
 * Create a quad which covers the coordinates from (-1, -1) to (1, 1).
 * The quad is represented using a triangle strip with two triangles.
 *
 * @param {WebGLRenderingContext} gl The gl context in which to create the quad
 *
 * @returns {ExtBuffer} the buffer that contains coordinates
 */
const makeOutQuad = function (gl) {
    const data = new Int16Array([
        -1, -1, 0, 0,
        -1,  1, 0, 1,
         1, -1, 1, 0,
         1,  1, 1, 1,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return {
        vbo: vbo,
        itemCount: 4,
        stride: 8,
        attribs: [
            {name: 'aPos', size: 2, type: gl.SHORT, normalized: false, offset: 0},
            {name: 'aUV', size: 2, type: gl.SHORT, normalized: false, offset: 4},
        ]
    };
};

/**
 * Set attribute pointer for a given pointer
 * @param {WebGLRenderingContext} gl the GL context in which this is performed
 * @param {WebGLProgram} program the shader which uses this attributes
 * @param {GLBuffer} vbo the buffer where attributes are defined
 * @returns {Array<WebGLPointer>} list of pointers that were set
 * The return attribute poiners must be disabled after they are not needed.
 */
const setAttribPointers = function(gl, program, vbo) {
    const attribs = vbo.attribs;
    const updated = [];
    for (let i = 0; i < attribs.length; i++) {
        const attr = attribs[i];
        const {name, size, type, normalized, divide, stride, offset} = attr;
        const location = gl.getAttribLocation(program, name);
        if (location === -1) {
            continue;
        }
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, type,
                               normalized, stride || vbo.stride, offset);
        // vertexAttribDivisorANGLE marks attribute as instance attribute
        // This means that the attribute won't update for every entry,
        // but it will update for every instance instead.
        // The divisor sets how many *instances* not *entries* share
        // the same attribute.  Which means it should be 1 by default.
        if (divide) {
            gl.instanceExt.vertexAttribDivisorANGLE(location, divide);
        }
        updated.push(location);
    }
    return updated;
};

/**
 * In a given shader program, set uniform value by name.
 * @param {WebGLRenderingContext} gl the GL context in which this is performed
 * @param {WebGLProgram} program the shader which uses this attributes
 * @param {string} uniform uniform variable name to set
 * @param {any} value value to set (depends on uniform type)
 *
 * @returns {boolean} whether or not the value was set successfully
 */
const setUniform = function (gl, program, uniform, value) {
    const location = gl.getUniformLocation(program, uniform);
    const fn = program.uniforms[uniform];
    if (location === -1 || typeof gl[fn] !== 'function') {
        return false;
    }
    gl[fn](location, value);
    return true;
};

/**
 * Create a texture as a render target with given size
 * @param {WebGLRenderingContext} gl the GL context in which to create texture
 * @param {number} width width of the texture in pixels
 * @param {number} height height of the texture in pixels
 *
 * @returns {WebGLTexture} recently created texture
 */
function makeTargetTexture(gl, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

/**
 * use a specific target texture to render to
 */
function activateTargetTexture(ctx, texture) {
    let gl = ctx.gl;
    gl.bindRenderbuffer(gl.RENDERBUFFER, ctx.renderBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, ctx.frameBuffer.width, ctx.frameBuffer.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ctx.renderBuffer);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
}

const progressShader = {
    vertexShader: `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUV;
varying vec2 vUV;
void main (void) {
    gl_Position = vec4(aPos, 1, 1);
    vUV = aUV;
}`,
    fragmentShader: `
precision highp float;
uniform float uProgress;
uniform vec4 uColor;
// float uProgress = 0.5;
// vec4 uColor = vec4(0.0, 0.0, 0.0, 1.0);
varying vec2 vUV;
float rect(vec2 p, vec2 s) {
    return max(abs(p.x)-s.x,abs(p.y)-s.y);
}
void main (void) {
    float p = clamp(uProgress, 0.0, 1.0);
    float hw = 300.0;
    vec2 size = vec2(800.0, 800.0);
    vec2 c = size / 2.0;
    vec2 uv = vUV*size - c;
    float result = min(rect(uv,vec2(hw+5.,25.)),-rect(uv,vec2(hw+10.,30.)));
    result = max(result,-rect(uv-vec2(hw*(p-1.0),0.0),vec2(hw*p, 20.0)));
    gl_FragColor = uColor * clamp(result, 0.0, 1.0);
}`,
    uniforms: {
        'uColor': 'uniform4fv',
        'uProgress': 'uniform1f',
    },
};

const simpleShader = {
    vertexShader: `
precision highp float;
attribute vec3 aPos;
attribute vec3 aLocation;
attribute vec3 aColor;
attribute float aRadius;
varying vec3 vPos;
varying vec3 vColor;
void main (void) {
    vPos = aPos;
    vColor = aColor;
    gl_Position = vec4(aPos*aRadius+aLocation, 1);
}`,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
void main (void) {
    gl_FragColor = vec4(vColor, 1.0);
}
`,
    uniforms: {},
};
const depthShader = {
    vertexShader: simpleShader.vertexShader,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;

const vec4 bitSh = vec4(256. * 256. * 256., 256. * 256., 256., 1.);
const vec4 bitMsk = vec4(0.,vec3(1./256.0));
const vec4 bitShifts = vec4(1.) / bitSh;

vec4 pack (float value) {
    vec4 comp = fract(value * bitSh);
    comp -= comp.xxyz * bitMsk;
    return comp;
}

float unpack (vec4 color) {
    return dot(color , bitShifts);
}

void main (void) {
    gl_FragColor = pack(vPos.z);
}
`,
    uniforms: {},
};

// Icosphere generated and exported by Blender to icosphere-ascii.stl
// Coordinates and indices are generated using genidx.py
const sphereCoords = new Float32Array([
    0,0,-1,.43,-.31,-.85,-.16,-.5,-.85,.72,-.53,-.45,.85,0,-.53,-.53,0,-.85,
    -.16,.5,-.85,.43,.31,-.85,.95,-.31,0,-.28,-.85,-.45,.26,-.81,-.53,0,-1,0,
    -.89,0,-.45,-.69,-.5,-.53,-.95,-.31,0,-.28,.85,-.45,-.69,.5,-.53,-.59,.81,0
    ,.72,.53,-.45,.26,.81,-.53,.59,.81,0,.59,-.81,0,-.59,-.81,0,-.95,.31,0,0,1,
    0,.95,.31,0,.28,-.85,.45,.69,-.5,.53,.16,-.5,.85,-.72,-.53,.45,-.26,-.81,
    .53,-.43,-.31,.85,-.72,.53,.45,-.85,0,.53,-.43,.31,.85,.28,.85,.45,-.26,.81
    ,.53,.16,.5,.85,.89,0,.45,.69,.5,.53,.53,0,.85,0,0,1
]);
const sphereIdx = new Uint16Array([
    1,0,2,1,3,4,2,0,5,5,0,6,6,0,7,4,3,8,10,9,11,13,12,14,16,15,17,19,18,20,8,3,
    21,11,9,22,14,12,23,17,15,24,20,18,25,27,26,28,30,29,31,33,32,34,36,35,37,
    39,38,40,37,40,41,39,40,37,35,39,37,34,37,41,36,37,34,32,36,34,31,34,41,33,
    34,31,29,33,31,28,31,41,30,31,28,26,30,28,40,28,41,27,28,40,38,27,40,39,25,
    38,20,25,39,35,20,39,36,24,35,17,24,36,32,17,36,33,23,32,14,23,33,29,14,33,
    30,22,29,11,22,30,26,11,30,27,21,26,8,21,27,38,8,27,24,20,35,19,20,24,15,19
    ,24,23,17,32,16,17,23,12,16,23,22,14,29,13,14,22,9,13,22,21,11,26,10,11,21,
    3,10,21,25,8,38,4,8,25,18,4,25,19,7,18,6,7,19,15,6,19,16,6,15,5,6,16,12,5,
    16,13,5,12,2,5,13,9,2,13,7,4,18,1,4,7,0,1,7,10,2,9,1,2,10,3,1,10
]);

const makeSphereIndexedVbo = function(gl, instances) {
    if (!instances) {
        instances = [0.0, 0.0, 0.0, 0.5];
    }

    // This buffer is going to be a concatenation of sphere data and instance
    // data.  Each instance will share the geometry of the sphere.
    const data = new Float32Array(instances.length + sphereCoords.length);
    data.set(sphereCoords);
    data.set(instances, sphereCoords.length);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphereIdx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // Get the pointer to the end of sphere data.
    // This will be used as an offset for instance data.
    const instOffset = 4 * sphereCoords.length;

    return {
        ibo: ibo,
        vbo: vbo,
        instances: instances.length / 7,
        itemCount: sphereIdx.length,
        stride: 3*4,
        attribs: [
            {name: 'aPos', size: 3, type: gl.FLOAT,normalized: false,
             offset: 0},
            {name: 'aLocation', size: 3, type: gl.FLOAT, normalized: false,
             divide: 1, stride: 7*4, offset: instOffset},
            {name: 'aRadius', size: 1, type: gl.FLOAT, normalized: false,
             divide: 1, stride: 7*4, offset: instOffset + 3*4},
            {name: 'aColor', size: 3, type: gl.FLOAT, normalized: false,
             divide: 1, stride: 7*4, offset: instOffset + 4*4},
        ]
    };
}

const makeInstanceData = function() {
    const count = 3;
    const instanceData = new Float32Array(count * 7);
    const r = ()=>Math.random() * 2 - 1;
    const r2 = ()=>Math.random();
    for (let i = 0; i < count; i++) {

        const instance = [r(), r(), 0.0, r2(), r2(), r2(), r2()];
        instanceData.set(instance, i*7)
    }
    return instanceData;
};

const defaultBackground = [1, 1, 1, 1];

let gl = null;
let canvas = null;
let progressBarProgram = null;
let simpleProgram = null;
let depthProram = null;
let viewPortQuad = null;
let sphereBuf = null;

let colorTexture = null;
let depthTexture = null;

let progress = 0.0;

const draw = function() {
    const width = canvas.width;
    const height = canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(...defaultBackground);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    /*
    gl.useProgram(progressBarProgram);
    setUniform(gl, progressBarProgram, 'uProgress', progress);
    setUniform(gl, progressBarProgram, 'uColor', [1, 0, 0, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, viewPortQuad.vbo);
    const attribs = setAttribPointers(gl, progressBarProgram, viewPortQuad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, viewPortQuad.itemCount);
    // disable attributes we just used to draw
    attribs.forEach((attrib) => gl.disableVertexAttribArray(attrib));
    // unbind the buffers and the program
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);
    */
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereBuf.ibo);
    {
        gl.useProgram(simpleProgram);
        const attribs = setAttribPointers(gl, simpleProgram, sphereBuf);
        gl.instanceExt.drawElementsInstancedANGLE(
           gl.TRIANGLES, sphereBuf.itemCount, gl.UNSIGNED_SHORT, 0, sphereBuf.instances);
        attribs.forEach((attrib) => gl.disableVertexAttribArray(attrib));
    }
    {
        gl.useProgram(depthFunc);
        const attribs = setAttribPointers(gl, simpleProgram, sphereBuf);
        gl.instanceExt.drawElementsInstancedANGLE(
           gl.TRIANGLES, sphereBuf.itemCount, gl.UNSIGNED_SHORT, 0, sphereBuf.instances);
        attribs.forEach((attrib) => gl.disableVertexAttribArray(attrib));
    }

    gl.depthFunc(gl.EQUAL);
};

const rafLoop = function() {
    draw();
    progress = (progress + 0.001) % 1;
    window.requestAnimationFrame(rafLoop);
};

const init = function() {
    const glVersion = getSupportedWebGLVersion();
    console.log('WebGL Version:', glVersion);
    if (glVersion < 1) {
        console.error('WebGL is not supported!');
        return;
    }
    canvas = document.getElementById('c');
    gl = canvas.getContext('webgl');
    // ANGLE_instanced_arrays allows instanced drawing, which helps with
    // the amount of data sent to the GPU.  Only one copy of sphere geometry
    // needs to be sent with instanced rendering.
    gl.instanceExt = gl.getExtension('ANGLE_instanced_arrays');
    {
        const {vertexShader, fragmentShader, uniforms} = progressShader;
        progressBarProgram = createShader(gl, vertexShader, fragmentShader);
        progressBarProgram.uniforms = uniforms;
    }
    {
        const {vertexShader, fragmentShader, uniforms} = simpleShader;
        simpleProgram = createShader(gl, vertexShader, fragmentShader);
        simpleProgram.uniforms = uniforms;
    }
    {
        const {vertexShader, fragmentShader, uniforms} = depthShader;
        depthProram = createShader(gl, vertexShader, fragmentShader);
        depthProram.uniforms = uniforms;
    }
    viewPortQuad = makeOutQuad(gl);
    sphereBuf = makeSphereIndexedVbo(gl, makeInstanceData());
    colorTexture = createTexture(gl, canvas.width, canvas.height);
    depthTexture = createTexture(gl, canvas.width, canvas.height);
    console.log('gl initialized:', canvas, gl, progressBarProgram);
    rafLoop();
};

window.addEventListener('load', init);
