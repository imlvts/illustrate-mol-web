'use strict';

/**
 * Detects supported WebGL version by checking constructors
 * present in the global window object.
 *
 * If WebGL is not detected, returns 0
 * @returns {0 | 1 | 2}
 */
export const getSupportedWebGLVersion = function () {
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
const makeViewPortSquad = function (gl) {
    const data = new Int16Array([
        -1, -1, 0, 0,
         1, -1, 1, 0,
        -1,  1, 0, 1,
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
 * Create a texture as a render target with given size
 * @param {WebGLRenderingContext} gl the GL context in which to create texture
 * @param {number} width width of the texture in pixels
 * @param {number} height height of the texture in pixels
 * @param {TextureParams} params additional parameters to be set for texture
 *
 * @returns {WebGLTexture} recently created texture
 */
const makeTexture = function (gl, width, height, params) {
    const defaultTexture = {
        leve: 0,
        internalFormat: gl.RGBA,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
    };
    params = Object.assign({}, defaultTexture, params);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texImage2D(gl.TEXTURE_2D, params.level, params.internalFormat,
                  width, height, 0, params.format, params.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

export class Context {
    constructor(canvas) {
        this.buffers = {};
        this.textures = {};
        this.shaders = {};
        this.activeShader = null;

        const gl = this.gl = canvas.getContext('webgl');
        this.width = canvas.width;
        this.height = canvas.height;
        // ANGLE_instanced_arrays allows instanced drawing, which helps with
        // the amount of data sent to the GPU.  Only one copy of sphere geometry
        // needs to be sent with instanced rendering.
        this.instanceExt = gl.getExtension('ANGLE_instanced_arrays');
        this.depthExt = gl.getExtension('WEBGL_depth_texture');
        this.drawBuffersExt = gl.getExtension('WEBGL_draw_buffers');

        this.frameBuffer = gl.createFramebuffer();
        this.renderBuffer = gl.createRenderbuffer();
        this.buffers.viewPortQuad = makeViewPortSquad(gl);
    }

    /**
     * Uniform value by name in the active shader.
     * @param {string} uniform uniform variable name to set
     * @param {any} value value to set (depends on uniform type)
     *
     * @returns {boolean} whether or not the value was set successfully
     */
    setUniform(uniform, value) {
        const {gl, activeShader} = this;
        const location = gl.getUniformLocation(activeShader.program, uniform);
        const fn = activeShader.uniforms[uniform];
        if (location === -1 || typeof gl[fn] !== 'function') {
            throw new Error('uniform not found! ' + uniform);
        }
        gl[fn](location, value);
    }

    /**
     * Set attribute pointers for the current shader to given buffer
     * @param {GLBuffer} vbo the buffer where attributes are defined
     * @returns {Array<WebGLPointer>} list of pointers that were set
     * The return attribute poiners must be disabled after they are not needed.
     */
    setAttribPointers (vbo) {
        const {gl, activeShader} = this;
        const attribs = vbo.attribs;
        for (let i = 0; i < attribs.length; i++) {
            const attr = attribs[i];
            const {name, size, type, normalized, divide, stride, offset} = attr;
            const location = gl.getAttribLocation(activeShader.program, name);
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
                this.instanceExt.vertexAttribDivisorANGLE(location, divide);
            }
        }
    }
    clearAttribPointers (vbo) {
        const {gl, activeShader} = this;
        const attribs = vbo.attribs;
        for (let i = 0; i < attribs.length; i++) {
            const attr = attribs[i];
            const {name, divide} = attr;
            const location = gl.getAttribLocation(activeShader.program, name);
            if (location === -1) {
                continue;
            }
            gl.enableVertexAttribArray(location);
            gl.disableVertexAttribArray(location);
            // vertexAttribDivisorANGLE must be cleared as well
            if (divide) {
                this.instanceExt.vertexAttribDivisorANGLE(location, 0);
            }
        }
    }

    /**
     * Creates or updates a texture to dictionary of textures
     */
    createTexture (name, width, height, params) {
        if (this.textures[name]) {
            this.deleteTexture(name);
        }
        this.textures[name] = makeTexture(this.gl, width, height, params);
    }
    /**
     * Frees a texture by its name and deletes a texture from dictionary
     */
    deleteTexture(name) {
        this.gl.deleteTexture(this.textures[name]);
        delete this.textures[name];
    }

    /**
     * load shader to this context
     */
    loadShader(name, shader) {
        const {gl} = this;
        const {vertexShader, fragmentShader, uniforms} = shader;
        this.shaders[name] = {
            program: createShader(gl, vertexShader, fragmentShader),
            uniforms,
        };
    }

    useShader(name) {
        if (name !== null) {
            this.activeShader = this.shaders[name];
            this.gl.useProgram(this.activeShader.program);
        } else {
            this.activeShader = null;
            this.gl.useProgram(null);
        }
    }

    bindDrawToTexture (...names) {
        const {gl, frameBuffer, renderBuffer, width, height} = this;

        gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
        for (var i = 0; i < names.length; i++) {
            const texture = this.textures[names[i]];
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
        }

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.textures.rawDepth, 0);

        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    drawTexture(texture, alpha=1) {
        const {gl} = this;
        const {viewPortQuad} = this.buffers;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        this.setUniform('uTexture', 0);
        this.setUniform('uAlpha', alpha);

        //gl.enable(gl.BLEND);
        //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.bindBuffer(gl.ARRAY_BUFFER, viewPortQuad.vbo);
        this.setAttribPointers(viewPortQuad);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, viewPortQuad.itemCount);
        this.clearAttribPointers(viewPortQuad);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        gl.bindTexture(gl.TEXTURE_2D, null);
    }
}
