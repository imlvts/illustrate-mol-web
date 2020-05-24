'use strict';

import {
    depthShader, colorShader, groupShader, indexShader
} from './shaders/initial';
import {postProcessShader} from './shaders/post-process';
import {progressShader} from './shaders/progress';
import {textureShader} from './shaders/texture';
import {getSupportedWebGLVersion, Context} from './glutil';
import {coords as sphereCoords, idx as sphereIdx} from './sphere-data';

const IFIELDS = 9;

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
        instances: instances.length / IFIELDS,
        itemCount: sphereIdx.length,
        stride: 3*4,
        attribs: [
            {name: 'aPos', size: 3, type: gl.FLOAT,normalized: false,
             offset: 0},
            {name: 'aLocation', size: 3, type: gl.FLOAT, normalized: false,
             divide: 1, stride: IFIELDS*4, offset: instOffset},
            {name: 'aRadius', size: 1, type: gl.FLOAT, normalized: false,
             divide: 1, stride: IFIELDS*4, offset: instOffset + 3*4},
            {name: 'aColor', size: 3, type: gl.FLOAT, normalized: false,
             divide: 1, stride: IFIELDS*4, offset: instOffset + 4*4},
            {name: 'aIndex', size: 2, type: gl.UNSIGNED_SHORT, normalized: false,
             divide: 1, stride: IFIELDS*4, offset: instOffset + 7*4},
            {name: 'aGroup', size: 2, type: gl.UNSIGNED_SHORT, normalized: false,
             divide: 1, stride: IFIELDS*4, offset: instOffset + 8*4},
        ]
    };
}

const makeInstanceData = function() {
    const count = 5000;
    const instanceData = new Float32Array(count * IFIELDS);
    const intView = new Uint32Array(instanceData.buffer);
    const r = ()=>Math.random() * 2 - 1;
    const r2 = ()=>Math.random();
    for (let i = 0; i < count; i++) {
        const instance = [r(), r(), r()*0.7, 0.03, 0.5, 0.5, 0.5];
        const groupIndex = [i, i];
        instanceData.set(instance, i*IFIELDS);
        intView.set(groupIndex, i*IFIELDS+instance.length);
    }
    return instanceData;
};

const defaultBackground = [0, 0, 0, 0];

let progress = 0.0;
let ctx = null;
let canvas = null;
let sphereBuf = null;

const passes = ['color', 'depth', 'index', 'group'];
const draw = function() {
    const {gl} = ctx;
    const width = canvas.width;
    const height = canvas.height;

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        ctx.bindDrawToTexture(pass);
        gl.viewport(0, 0, width, height);
        gl.clearColor(...defaultBackground);
        if (i === 0) {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        } else {
            gl.depthFunc(gl.EQUAL);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
        ctx.useShader(pass);
        drawSpheres();
        ctx.useShader(null);
    }


    postProcess();
};
const drawSpheres = function() {
    const {gl} = ctx;
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereBuf.ibo);
    ctx.setAttribPointers(sphereBuf);
    ctx.instanceExt.drawElementsInstancedANGLE(
       gl.TRIANGLES, sphereBuf.itemCount, gl.UNSIGNED_SHORT, 0, sphereBuf.instances);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    ctx.clearAttribPointers(sphereBuf);
}

const textureBinds = [
   ['color', 'uColor'], ['depth', 'uDepth'],
   ['group', 'uGroup'], ['index', 'uIndex'],
];
const postProcess = function() {
    const {gl, textures} = ctx;
    const {viewPortQuad} = ctx.buffers;
    const width = canvas.width;
    const height = canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.viewport(0, 0, width, height);
    gl.clearColor(...defaultBackground);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    ctx.useShader('post-process');
    for (let i = 0; i < textureBinds.length; i++) {
        const [name, uniform] = textureBinds[i];
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures[name]);
        ctx.setUniform(uniform, i);
    }

    ctx.setUniform('uRes', [width, height]);

    gl.bindBuffer(gl.ARRAY_BUFFER, viewPortQuad.vbo);
    ctx.setAttribPointers(viewPortQuad);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, viewPortQuad.itemCount);
    ctx.clearAttribPointers(viewPortQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    for (let i = 0; i < textureBinds.length; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }
    ctx.useShader(null);
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
    ctx = new Context(canvas);
    const {gl} = ctx;
    ctx.loadShader('progress', progressShader);
    ctx.loadShader('color', colorShader);
    ctx.loadShader('depth', depthShader);
    ctx.loadShader('texture', textureShader);
    ctx.loadShader('group', groupShader);
    ctx.loadShader('index', indexShader);
    ctx.loadShader('post-process', postProcessShader);
    ctx.createTexture('color', canvas.width, canvas.height);
    ctx.createTexture('depth', canvas.width, canvas.height);
    ctx.createTexture('group', canvas.width, canvas.height);
    ctx.createTexture('index', canvas.width, canvas.height);
    ctx.createTexture('rawDepth', canvas.width, canvas.height, {
        internalFormat: gl.DEPTH_COMPONENT,
        format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_SHORT,
    });
    sphereBuf = makeSphereIndexedVbo(ctx.gl, makeInstanceData());
    console.log('gl initialized:', ctx);
    rafLoop();
};

window.addEventListener('load', init);
