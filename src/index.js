'use strict';

import {colorShader, layersShader} from './shaders/initial';
import {postProcessShader} from './shaders/post-process';
import {progressShader} from './shaders/progress';
import {textureShader} from './shaders/texture';
import {getSupportedWebGLVersion, Context} from './glutil';
import {coords as sphereCoords, idx as sphereIdx} from './sphere-data-hq';
import {loadPdb, findAtomGroup} from './pdb';
import {Matrix4} from './matrix';

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
    const count = 0;
    const instanceData = new Float32Array(count * IFIELDS);
    const intView = new Uint32Array(instanceData.buffer);
    const r2 = () => Math.random() * 2 - 1;
    const r = () => Math.random();
    for (let i = 0; i < count; i++) {
        const instance = [r2()*32, r2()*32, r2()*32*0.7, 1.6, 0.5, 0.5, 0.5];
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
let rotationMatrix = Matrix4.unit();
let viewMatrix = Matrix4.unit();
let zoomLevel = -3.7;

const passes = ['color', 'layers'];
const start = +new Date();
const draw = function() {
    const time = +new Date() - start;
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
        ctx.setUniform('uTime', time);
        ctx.setUniform('uViewMatrix', viewMatrix.data.flat());
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
   ['color', 'uColor'], ['layers', 'uLayers'],
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

const updateViewMatrix = function () {
    {
        const {prevPos, curPos} = mouseInfo;
        const delta = {
            x: curPos.x - prevPos.x,
            y: curPos.y - prevPos.y,
        };
        mouseInfo.prevPos = curPos;
        const rotationScale = Math.PI * 4.0 / Math.max(canvas.width, canvas.height);
        let mouseRotation;
        if (mouseInfo.rotZ) {
            mouseRotation = Matrix4.rotZ(delta.x * rotationScale);
        } else {
            mouseRotation = Matrix4.rotY(delta.x * rotationScale).mul(Matrix4.rotX(delta.y * rotationScale));
        }
        rotationMatrix = rotationMatrix.mul(mouseRotation);
    }
    {
        zoomLevel += (mouseInfo.curMwheel - mouseInfo.prevMwheel) / -200.0;
        mouseInfo.prevMwheel = mouseInfo.curMwheel;
    }
    const aspectMatrix = Matrix4.unit().aspect(canvas.width / canvas.height);
    const scale = Math.exp(zoomLevel);
    viewMatrix = rotationMatrix.mul(aspectMatrix).scale(scale);
};

const rafLoop = function() {
    updateViewMatrix();
    draw();
    progress = (progress + 0.001) % 1;
    window.requestAnimationFrame(rafLoop);
};

const mouseInfo = {
    shiftDown: false,
    tracking: false,
    rotZ: false,
    prevPos: {x: 0, y: 0},
    curPos: {x: 0, y: 0},
    prevMwheel: 0,
    curMwheel: 0,
};

const onMouseMove = (event) => {
    if (mouseInfo.tracking) {
        mouseInfo.curPos = {x: event.pageX, y: event.pageY};
    }
};
const onMouseDown = (event) => {
    mouseInfo.tracking = true;
    mouseInfo.rotZ = mouseInfo.shiftDown;
    mouseInfo.curPos = {x: event.pageX, y: event.pageY};
    mouseInfo.prevPos = {x: event.pageX, y: event.pageY};
};
const onMouseUp = (event) => {
    mouseInfo.tracking = false;
    mouseInfo.rotZ = false;
};
const onMouseWheel = (event) => {
    event.preventDefault();
    mouseInfo.curMwheel += event.deltaY;
};
const onShiftDown = (event) => {
    if (event.key !== 'Shift') { return; }
    mouseInfo.shiftDown = true;
}
const onShiftUp = (event) => {
    if (event.key !== 'Shift') { return; }
    mouseInfo.shiftDown = false;
}

const initMouse = function(canvas) {
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('wheel', onMouseWheel);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseout', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onShiftDown);
    window.addEventListener('keyup', onShiftUp);
};

const init = function() {
    const glVersion = getSupportedWebGLVersion();
    console.log('WebGL Version:', glVersion);
    if (glVersion < 1) {
        console.error('WebGL is not supported!');
        return;
    }
    canvas = document.getElementById('c');
    canvas.width = window.innerWidth;
    canvas.height = Math.min(window.innerHeight, window.innerWidth);
    ctx = new Context(canvas);
    const {gl} = ctx;
    ctx.loadShader('progress', progressShader);
    ctx.loadShader('color', colorShader);
    ctx.loadShader('layers', layersShader);
    ctx.loadShader('post-process', postProcessShader);
    ctx.createTexture('color', canvas.width, canvas.height);
    ctx.createTexture('layers', canvas.width, canvas.height, {
        interpolation: gl.NEAREST,
        type: gl.FLOAT,
    });
    ctx.createTexture('rawDepth', canvas.width, canvas.height, {
        internalFormat: gl.DEPTH_COMPONENT,
        format: gl.DEPTH_COMPONENT,
        type: gl.UNSIGNED_SHORT,
    });
    sphereBuf = makeSphereIndexedVbo(ctx.gl, makeInstanceData());
    console.log('gl initialized:', ctx);
    rafLoop();
    initMouse(canvas);

    loadData();
};

const onProgress = function() {};
const atomGroups = [
    ['HETATM', '-----HOH--', [0,9999], [0.5,0.5,0.5], 0.0],
    ['ATOM',   '-H--------', [0,9999], [0.5,0.5,0.5], 0.0],
    ['ATOM',   'H---------', [0,9999], [0.5,0.5,0.5], 0.0],
    ['ATOM',   '-C-------A', [0,9999], [1.0,0.6,0.6], 1.6],
    ['ATOM',   '-S-------A', [0,9999], [1.0,0.5,0.5], 1.8],
    ['ATOM',   '---------A', [0,9999], [1.0,0.5,0.5], 1.5],
    ['ATOM',   '-C-------C', [0,9999], [1.0,0.6,0.6], 1.6],
    ['ATOM',   '-S-------C', [0,9999], [1.0,0.5,0.5], 1.8],
    ['ATOM',   '---------C', [0,9999], [1.0,0.5,0.5], 1.5],
    ['ATOM',   '-C--------', [0,9999], [1.0,0.8,0.6], 1.6],
    ['ATOM',   '-S--------', [0,9999], [1.0,0.7,0.5], 1.8],
    ['ATOM',   '----------', [0,9999], [1.0,0.7,0.5], 1.5],
    ['HETATM', 'FE---HEM--', [0,9999], [1.0,0.8,0.0], 1.8],
    ['HETATM', '-C---HEM--', [0,9999], [1.0,0.3,0.3], 1.6],
    ['HETATM', '-----HEM--', [0,9999], [1.0,0.1,0.1], 1.5],
//['HETATM', '-H--------', [0,9999], [1.1,1.1,1.1], 0.0],
//['HETATM', 'H---------', [0,9999], [1.0,1.0,1.0], 0.0],
//['ATOM',   '-H--------', [0,9999], [1.0,1.0,1.0], 0.0],
//['ATOM',   'H---------', [0,9999], [1.0,1.0,1.0], 0.0],
//['HETATM', '-----HOH--', [0,9999], [1.0,1.0,0.0], 0.0],
//['ATOM',   '-----SER B', [3321,3330], [1.00, 0.00, 0.00], 1.6],
//['ATOM',   '-----LEU B', [3463,3481], [0.83, 0.62, 0.00], 1.6],
//['ATOM',   '-----LEU B', [3981,3999], [0.59, 0.83, 0.37], 1.6],
].map((group, idx) => {
    const [kind, descriptorStr, [low, high], [r, g, b], radius] = group;
    const descriptor = new RegExp(descriptorStr.replace(/-/g, '.'));
    return {kind, descriptor, idx, index: {low, high}, color: {r,g,b}, radius};
});

const loadData = async function() {
    //const data = await loadPdb('5oeb.pdb', onProgress);
    const data = await loadPdb('2hhb.pdb', onProgress);
    const count = data.atoms.length;
    const instanceData = new Float32Array(count * IFIELDS);
    const intView = new Uint32Array(instanceData.buffer);
    let subunits = 0;
    let prevChain;
    for (let i = 0; i < count; i++) {
        const atom = data.atoms[i];
        const {pos} = atom;
        const group = findAtomGroup(atomGroups, atom);
        if (!group) { continue }
        const {radius, color} = group;
        const instance = [
           pos.x, pos.y, pos.z, radius,
           color.r, color.g, color.b
        ];
        const groupIndex = [i, subunits];
        instanceData.set(instance, i*IFIELDS);
        intView.set(groupIndex, i*IFIELDS+instance.length);

        if (atom.chain !== prevChain) {
            subunits += 1;
        }
        prevChain = atom.chain;
    }
    sphereBuf = makeSphereIndexedVbo(ctx.gl, instanceData);
};

window.addEventListener('load', init);
