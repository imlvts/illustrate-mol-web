'use strict';

import {colorShader, layersShader} from './shaders/initial';
import {postProcessShader} from './shaders/post-process';
// import {progressShader} from './shaders/progress';
import {textureShader} from './shaders/texture';
import {getSupportedWebGLVersion, Context} from './glutil';
import {MouseInput} from './mouse';
import {coords, idx} from './sphere-data-hq';
const sphereCoords = coords;
const sphereIdx = idx;
import {loadPdb, parsePdb, findAtomGroup} from './pdb';
import {parseInp} from './config';
import {Matrix4} from './matrix';

const IFIELDS = 9;

const makeSphereIndexedVbo = (gl, instances) => {
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

const makeInstanceData = () => {
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

// let progress = 0.0;
let ctx = null;
let canvas = null;
let sphereBuf = null;
let mouseInfo = null;
let rotationMatrix = Matrix4.unit();
let viewMatrix = Matrix4.unit();
let zoomLevel = -3.7;

const passes = ['color', 'layers'];
const start = +new Date();
const draw = () => {
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
const drawSpheres = () => {
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

const postProcess = () => {
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

let counter = 0;
const updateViewMatrix = () => {
    rotationMatrix = rotationMatrix.mul(mouseInfo.popRotationDelta());
    zoomLevel += mouseInfo.popZoomDelta();
    const aspectMatrix = Matrix4.unit().aspect(canvas.width / canvas.height);
    const scale = Math.exp(zoomLevel);
    viewMatrix = rotationMatrix.mul(aspectMatrix).scale(scale);

    //if (counter++ < 60) { return }
    //counter = 0;
    //const decomposed = viewMatrix.decompose();
    //const angles = decomposed.rotation.toEulerAngles();
    //console.log('matrix decomposition:', decomposed, angles);
};

const rafLoop = () => {
    updateViewMatrix();
    draw();
    // progress = (progress + 0.001) % 1;
    window.requestAnimationFrame(rafLoop);
};

const initDrag = (canvas) => {
    const isFile = (item) => item.kind === 'file';
    const onDragOver = (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (!Array.prototype.some.call(event.dataTransfer.items, isFile)) {
            return;
        }
        event.dataTransfer.dropEffect = 'copy';
    };

    const onDragDrop = (event) => {
        event.stopPropagation();
        event.preventDefault();
        processFiles(event.dataTransfer.files);
    };

    canvas.addEventListener('dragover', onDragOver);
    canvas.addEventListener('drop', onDragDrop);
};

const processFiles = (files) => {
    for (let i = 0; i < files.length; i++) {
        if (/\.pdb$/i.test(files[i].name)) {
            console.log('load pdb', files[i]);
            loadFile(files[i]);
            break;
        }
    }
    for (let i = 0; i < files.length; i++) {
        if (/\.inp$/i.test(files[i].name)) {
            console.log('load inp', files[i]);
            loadConfig(files[i]);
            break;
        }
    }
};

const initFile = () => {
    const fileInput = document.getElementById('f');
    fileInput.addEventListener('change', (event) => {
        processFiles(fileInput.files);
    });
};

const init = () => {
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
    // ctx.loadShader('progress', progressShader);
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
    mouseInfo = new MouseInput(canvas);
    initDrag(canvas);
    initFile();

    rafLoop();

    loadUrl('2hhb.pdb');
};

const onProgress = () => {};
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
].map((group, idx) => {
    const [kind, descriptorStr, [low, high], [r, g, b], radius] = group;
    const descriptor = new RegExp(descriptorStr.replace(/-/g, '.'));
    return {kind, descriptor, idx, index: {low, high}, color: {r,g,b}, radius};
});

const loadUrl = async (url) => {
    const data = await loadPdb(url, onProgress);
    sphereBuf = makeSphereIndexedVbo(ctx.gl, toInstanceData(data));
};

const loadFile = async (file) => {
    const data = parsePdb(await file.text());
    sphereBuf = makeSphereIndexedVbo(ctx.gl, toInstanceData(data));
};

const loadConfig = async(file) => {
    parseInp(await file.text());
}

const toInstanceData = (data) => {
    const count = data.atoms.length;
    const instanceData = new Float32Array(count * IFIELDS);
    const intView = new Uint32Array(instanceData.buffer);
    let subunits = 0;
    let prevChain;
    for (let i = 0; i < count; i++) {
        const atom = data.atoms[i];
        const {pos} = atom;
        const group = findAtomGroup(atomGroups, atom);
        if (!group) { continue; }
        const {radius, color} = group;
        const instance = [
           pos.x, pos.y, pos.z, radius,
           color.r, color.g, color.b,
        ];
        const groupIndex = [i, subunits];
        instanceData.set(instance, i*IFIELDS);
        intView.set(groupIndex, i*IFIELDS+instance.length);

        if (atom.chain !== prevChain) {
            subunits += 1;
        }
        prevChain = atom.chain;
    }
    return instanceData;
};

window.addEventListener('load', init);
