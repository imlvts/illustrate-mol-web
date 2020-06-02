(function () {
    'use strict';

    const sharedVs = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aLocation;
attribute vec3 aColor;
attribute float aRadius;
attribute vec2 aIndex;
attribute vec2 aGroup;

varying vec3 vPos;
varying vec3 vColor;
varying float vIndex;
varying float vGroup;
uniform float uTime;
uniform mat4 uViewMatrix;
void main (void) {
    float rate = 1e-4;
    float sa = sin(uTime * rate);
    float ca = cos(uTime * rate);
    vColor = aColor;
    vIndex = dot(aIndex, vec2(1.0, 65536.0));
    vGroup = dot(aGroup, vec2(1.0, 65536.0));
    vec3 loc = aLocation * vec3(1.0, 1.0, -1.0);
    gl_Position = uViewMatrix * vec4((aPos*aRadius+loc), 1);
    vPos = gl_Position.xyz;
}`;

    const uniforms = {
        'uTime': 'uniform1f',
        'uViewMatrix': 'uniformMatrix4fv',
    };

    const colorShader = {
        vertexShader: sharedVs,
        fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
void main (void) {
    gl_FragColor = vec4(vColor, 1.0);
}`,
        uniforms,
    };

    const layersShader = {
        vertexShader: sharedVs,
        fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
varying float vIndex;
varying float vGroup;

void main (void) {
    gl_FragColor = vec4(
       (1.0 - vPos.z)/2.0,
       vIndex,
       vGroup,
       1.0
    );
}`,
        uniforms,
    };

    const postProcessShader = {
        vertexShader: `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUV;
varying vec2 vUV;
void main (void) {
    gl_Position = vec4(aPos, 1.0, 1.0);
    vUV = aUV;
}`,
        fragmentShader: `
precision highp float;
uniform sampler2D uColor;
uniform highp sampler2D uLayers;
uniform float uAlpha;
uniform vec2 uRes;
varying vec2 vUV;

#define TAU 6.283185307179586
#define SSAO_SAMPLES 100
#define SSAO_RADIUS 20.0

float ssao(vec2 p, vec2 uvStep) {
    float z = texture2D(uLayers, p).x;
    if (z <= 0.0) {
        return 0.0;
    }
    float total = 0.0;
    vec2 st = p;
    float rcone = 1.0 / 80.0;
    for (int i = -50; i <= 50; i += 5) {
        for (int j = -50; j <= 50; j += 5) {
            vec2 delta = vec2(float(i), float(j));
            float dr = length(delta);
            float sz = texture2D(uLayers, p + delta * uvStep).x;
            total += step(dr, 50.0) * step(z, sz - rcone - dr / 400.0);
        }
    }
    return total * .002;
}

float r_low = 3.0;
float r_high = 10.0;
float g_low = 3.0;
float g_high = 10.0;

float subunit_outline(vec2 p, vec2 uvStep) {
    float g = 0.0;
    float r = 0.0;
    vec4 layers = texture2D(uLayers, p);
    float index = layers.y;
    float group = layers.z;
    float residue_diff = 6000.0;
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            vec2 delta = vec2(float(dx), float(dy));
            vec2 target = p + delta * uvStep;
            vec4 layers = texture2D(uLayers, target);
            float sgroup = layers.z;
            if (group != sgroup) { r+=1.0; }
            //float sindex = layers.y;
            //g += step(residue_diff, abs(index - sindex));
        }
    }

    return (r - r_low) / (r_high - r_low);
}

float l_low = 3.0;
float l_high = 10.0;

float l_diff_min = 0.0;
float l_diff_max = 5.0;

float subunit_second_outline(vec2 p, vec2 uvStep) {
    // second derivative outlines
    float rl = 0.0;
    float l_opacity = 0.0;
    float l_count = 0.0;
    float z = texture2D(uLayers, p).x;
    if (z <= 0.0) {
        return 0.0;
    }
    float l = 0.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            vec2 target = p + vec2(float(j), float(i)) * uvStep;
            float sz = texture2D(uLayers, target).x;
            if (i*i*j*j == 16) { continue; }
            float rd = abs(sz - z) * 80.0;
            if (rd <= l_diff_min) { continue; }
            rd = (rd - l_diff_min) / (l_diff_max - l_diff_min);
            l += min(1.0, rd);
        }
    }
    l = (l - l_low) / (l_high - l_low);
    l = clamp(l, 0.0, 1.0);
    if (l > 0.0) {
        l_count += 1.0;
        l_opacity += l;
    }
    if (l_count >= 6.0) {
        return l_opacity / l_count;
    } else {
        return l;
    }
}

void main (void) {
    vec2 uvStep = 1.0/uRes;
    vec4 color = texture2D(uColor, vUV);
    float shadow = 1.0;
    shadow *= clamp(1.0 - ssao(vUV, uvStep), 0.3, 1.0);
    float outline = 0.0;
    outline = max(outline, subunit_outline(vUV, uvStep));
    outline = max(outline, subunit_second_outline(vUV, uvStep));
    color.w = max(outline, color.w);
    outline = clamp(1.0 - outline, 0.0, 1.0);
    color.xyz *= shadow * outline;
    gl_FragColor = color;
}`,
        uniforms: {
            'uColor': 'uniform1i',
            'uLayers': 'uniform1i',
            'uDepth': 'uniform1i',
            'uRes': 'uniform2fv'
        },
    };

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
    };

    class Context {
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
            this.instanceExt = this.assertExt('ANGLE_instanced_arrays');
            this.depthExt = this.assertExt('WEBGL_depth_texture');
            // this.drawBuffersExt = gl.getExtension('WEBGL_draw_buffers');
            // this.floatBufferExt = this.assertExt('WEBGL_color_buffer_float');
            // required to create and render to float textures
            this.floatTextureExt = this.assertExt('OES_texture_float');
            // required to sample float texture
            this.floatInterpExt = this.assertExt('OES_texture_float_linear');

            this.frameBuffer = gl.createFramebuffer();
            this.renderBuffer = gl.createRenderbuffer();
            this.buffers.viewPortQuad = makeViewPortSquad(gl);
        }

        assertExt(name) {
            const ext = this.gl.getExtension(name);
            if (!ext) {
                throw new Error('cannot load extension: '+ name);
            }
            return ext;
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
            if (fn.startsWith('uniformMatrix')) {
                gl[fn](location, false, value);
            } else {
                gl[fn](location, value);
            }
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

    // Icosphere generated and exported by Blender to icosphere-ascii.stl
    // Coordinates and indices are generated using genidx.py
    const coords = new Float32Array([
        0,0,-1,.22,-.16,-.96,-.08,-.26,-.96,.72,-.53,-.45,.6,-.43,-.67,.82,-.27,
        -.51,-.27,0,-.96,-.08,.26,-.96,.22,.16,-.96,.87,-.43,-.23,-.28,-.85,-.45,
        -.01,-.86,-.51,-.14,-.96,-.23,-.89,0,-.45,-.82,-.26,-.51,-.96,-.16,-.23,
        -.28,.85,-.45,-.5,.7,-.51,-.45,.86,-.23,.72,.53,-.45,.51,.69,-.51,.68,.69,
        -.23,.68,-.69,-.23,-.45,-.86,-.23,-.96,.16,-.23,-.14,.96,-.23,.87,.43,-.23,
        .28,-.85,.45,.5,-.7,.51,.23,-.7,.67,-.72,-.53,.45,-.51,-.69,.51,-.6,-.43,
        .67,-.72,.53,.45,-.82,.27,.51,-.6,.43,.67,.28,.85,.45,.01,.86,.51,.23,.7,.67
        ,.89,0,.45,.82,.26,.51,.74,0,.67,.53,0,.85,.36,.26,.89,.27,0,.96,.64,.26,.72
        ,.69,.5,.53,.5,.7,.51,.45,.53,.72,.16,.5,.85,-.14,.43,.89,.08,.26,.96,-.05,
        .69,.72,-.26,.81,.53,-.51,.69,.51,-.36,.59,.72,-.43,.31,.85,-.45,0,.89,-.22,
        .16,.96,-.67,.16,.72,-.85,0,.53,-.82,-.27,.51,-.67,-.16,.72,-.43,-.31,.85,
        -.14,-.43,.89,-.22,-.16,.96,-.36,-.59,.72,-.26,-.81,.53,.01,-.86,.51,-.05,
        -.69,.72,.16,-.5,.85,.36,-.26,.89,.08,-.26,.96,.45,-.53,.72,.69,-.5,.53,.82,
        -.26,.51,.64,-.26,.72,.95,.31,0,.86,.43,.28,.96,.16,.23,.81,.59,0,.59,.81,0,
        .45,.86,.23,.67,.69,.28,0,1,0,-.14,.95,.28,.14,.96,.23,-.31,.95,0,-.59,.81,0
        ,-.68,.69,.23,-.45,.85,.28,-.95,.31,0,-.95,.16,.28,-.87,.43,.23,-1,0,0,-.95,
        -.31,0,-.87,-.43,.23,-.95,-.16,.28,-.59,-.81,0,-.45,-.85,.28,-.68,-.69,.23,
        -.31,-.95,0,0,-1,0,.14,-.96,.23,-.14,-.95,.28,.59,-.81,0,.67,-.69,.28,.45,
        -.86,.23,.81,-.59,0,.95,-.31,0,.96,-.16,.23,.86,-.43,.28,.31,.95,0,.45,.85,
        -.28,.26,.81,-.53,-.01,.86,-.51,.14,.95,-.28,-.81,.59,0,-.67,.69,-.28,-.69,
        .5,-.53,-.82,.26,-.51,-.86,.43,-.28,-.81,-.59,0,-.86,-.43,-.28,-.69,-.5,-.53
        ,-.5,-.7,-.51,-.67,-.69,-.28,.31,-.95,0,.14,-.95,-.28,.26,-.81,-.53,.51,-.69
        ,-.51,.45,-.85,-.28,1,0,0,.95,-.16,-.28,.85,0,-.53,.82,.27,-.51,.95,.16,-.28
        ,.43,.31,-.85,.36,.59,-.72,.6,.43,-.67,.14,.43,-.89,-.16,.5,-.85,-.23,.7,
        -.67,.05,.69,-.72,-.45,.53,-.72,-.36,.26,-.89,-.53,0,-.85,-.74,0,-.67,-.64,
        .26,-.72,-.64,-.26,-.72,-.36,-.26,-.89,-.16,-.5,-.85,-.23,-.7,-.67,-.45,-.53
        ,-.72,.67,.16,-.72,.67,-.16,-.72,.43,-.31,-.85,.45,0,-.89,.05,-.69,-.72,.14,
        -.43,-.89,.36,-.59,-.72,0,0,1
    ]);

    const idx = new Uint16Array([
        1,0,2,4,3,5,2,0,6,6,0,7,7,0,8,5,3,9,11,10,12,14,13,15,17,16,18,20,19,21,9,3,
        22,12,10,23,15,13,24,18,16,25,21,19,26,28,27,29,31,30,32,34,33,35,37,36,38,
        40,39,41,43,42,44,45,42,43,47,46,48,50,49,51,52,49,50,54,53,55,57,56,58,59,
        56,57,61,60,62,64,63,65,66,63,64,68,67,69,71,70,72,73,70,71,75,74,76,78,77,
        79,80,77,78,82,81,83,85,84,86,87,84,85,89,88,90,92,91,93,94,91,92,96,95,97,
        99,98,100,101,98,99,103,102,104,106,105,107,108,105,106,110,109,111,112,81,
        82,113,81,112,115,114,116,117,88,89,118,88,117,120,119,121,122,95,96,123,95,
        122,125,124,126,127,102,103,128,102,127,130,129,131,132,109,110,133,109,132,
        135,134,136,138,137,139,140,137,138,142,141,143,144,141,142,145,141,144,147,
        146,148,149,146,147,150,146,149,152,151,153,154,134,135,155,134,154,1,156,
        157,158,151,152,159,151,158,4,156,160,130,160,129,4,160,130,3,4,130,160,158,
        129,159,158,160,156,159,160,11,152,10,158,152,11,129,158,11,8,157,137,1,157,
        8,0,1,8,157,154,137,155,154,157,156,155,157,139,135,19,154,135,139,137,154,
        139,125,153,124,152,153,125,10,152,125,153,149,124,150,149,153,151,150,153,
        14,147,13,149,147,14,124,149,14,120,148,119,147,148,120,13,147,120,148,144,
        119,145,144,148,146,145,148,17,142,16,144,142,17,119,144,17,115,143,114,142,
        143,115,16,142,115,143,138,114,140,138,143,141,140,143,20,139,19,138,139,20,
        114,138,20,26,136,77,135,136,26,19,135,26,136,132,77,133,132,136,134,133,136
        ,79,110,39,132,110,79,77,132,79,22,131,105,130,131,22,3,130,22,131,127,105,
        128,127,131,129,128,131,107,103,27,127,103,107,105,127,107,23,126,98,125,126
        ,23,10,125,23,126,122,98,123,122,126,124,123,126,100,96,30,122,96,100,98,122
        ,100,24,121,91,120,121,24,13,120,24,121,117,91,118,117,121,119,118,121,93,89
        ,33,117,89,93,91,117,93,25,116,84,115,116,25,16,115,25,116,112,84,113,112,
        116,114,113,116,86,82,36,112,82,86,84,112,86,75,111,74,110,111,75,39,110,75,
        111,106,74,108,106,111,109,108,111,28,107,27,106,107,28,74,106,28,68,104,67,
        103,104,68,27,103,68,104,99,67,101,99,104,102,101,104,31,100,30,99,100,31,67
        ,99,31,61,97,60,96,97,61,30,96,61,97,92,60,94,92,97,95,94,97,34,93,33,92,93
        ,34,60,92,34,54,90,53,89,90,54,33,89,54,90,85,53,87,85,90,88,87,90,37,86,36,
        85,86,37,53,85,37,47,83,46,82,83,47,36,82,47,83,78,46,80,78,83,81,80,83,40,
        79,39,78,79,40,46,78,40,41,76,42,75,76,41,39,75,41,76,71,42,73,71,76,74,73,
        76,44,72,161,71,72,44,42,71,44,29,69,70,68,69,29,27,68,29,69,64,70,66,64,69,
        67,66,69,72,65,161,64,65,72,70,64,72,32,62,63,61,62,32,30,61,32,62,57,63,59,
        57,62,60,59,62,65,58,161,57,58,65,63,57,65,35,55,56,54,55,35,33,54,35,55,50,
        56,52,50,55,53,52,55,58,51,161,50,51,58,56,50,58,38,48,49,47,48,38,36,47,38,
        48,43,49,45,43,48,46,45,48,51,44,161,43,44,51,49,43,51,45,41,42,40,41,45,46,
        40,45,52,38,49,37,38,52,53,37,52,59,35,56,34,35,59,60,34,59,66,32,63,31,32,
        66,67,31,66,73,29,70,28,29,73,74,28,73,80,26,77,21,26,80,81,21,80,87,25,84,
        18,25,87,88,18,87,94,24,91,15,24,94,95,15,94,101,23,98,12,23,101,102,12,101,
        108,22,105,9,22,108,109,9,108,113,21,81,20,21,113,114,20,113,118,18,88,17,18
        ,118,119,17,118,123,15,95,14,15,123,124,14,123,128,12,102,11,12,128,129,11,
        128,133,9,109,5,9,133,134,5,133,140,8,137,7,8,140,141,7,140,145,7,141,6,7,
        145,146,6,145,150,6,146,2,6,150,151,2,150,155,5,134,4,5,155,156,4,155,159,2,
        151,1,2,159,156,1,159
    ]);

    const xhr = function (url, progress) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open('GET', url, true);
            request.onprogress = progress;
            request.onload = function() {
                if (request.status >= 400) {
                    return reject(`Error loading audio file - ${request.status} ${request.statusText}`);
                }
                resolve(request.response);
            };
            request.send();
        });
    };

    const parseAtom = function(str) {
        const kind = str.substr(0, 6).trim();
        const descriptor = str.substring(12, 22);
        const index = Number(str.substring(22, 26).trim());
        const chain = str.substring(21, 22);
        const [x, y ,z] = str.substr(29, 54).trim().split(/\s+/)
            .map((x) => Number(x));
        return {kind, descriptor, index, chain, pos: {x, y, z}};
    };

    const findAtomGroup = (groups, atom) => {
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const matches =
                group.kind === atom.kind &&
                group.descriptor.exec(atom.descriptor) &&
                group.index.low <= atom.index &&
                group.index.high >= atom.index;
            if (matches) {
                return group;
            }
        }
    };

    const loadPdb = async (url, progress) => {
        const data = await xhr(url, progress);
        const atoms = [];
        const re = /^(ATOM|HETATM).*$/gm;
        let row;
        while ((row = re.exec(data))) {
            atoms.push(parseAtom(row[0]));
        }
        console.log(atoms[0]);
        return {atoms};
    };

    class Matrix4 {
        constructor(data) {
            this.data = data;
        }
        static zero() {
            return new Matrix4([
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ]);
        }
        static unit() {
            return new Matrix4([
                [1, 0, 0, 0],
                [0, 1, 0, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1],
            ]);
        }
        static rotX(angle) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            return new Matrix4([
                [1.0, 0.0,  0.0, 0.0],
                [0.0, cos, -sin, 0.0],
                [0.0, sin,  cos, 0.0],
                [0.0, 0.0,  0.0, 1.0],
            ]);
        }
        static rotY(angle) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            return new Matrix4([
                [ cos, 0.0, sin, 0.0],
                [ 0.0, 1.0, 0.0, 0.0],
                [-sin, 0.0, cos, 0.0],
                [ 0.0, 0.0, 0.0, 1.0],
            ]);
        }
        static rotZ(angle) {
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);
            return new Matrix4([
                [cos, -sin, 0.0, 0.0],
                [sin,  cos, 0.0, 0.0],
                [0.0,  0.0, 1.0, 0.0],
                [0.0,  0.0, 0.0, 1.0],
            ]);
        }

        aspect(aspect) {
            const data = this.data;
            for (let i = 0; i < 4; i++) {
                data[0][i] /= aspect;
            }
            return this;
        }

        /// Multiply two matrices and get a product
        mul(other) {
            const out = Matrix4.zero();
            const c = out.data;
            const a = this.data;
            const b = other.data;
            for (let i = 0; i < 4; i++) {
                const outRow = out.data[i];
                for (let j = 0; j < 4; j++) {
                    for (let k = 0; k < 4; k++) {
                        c[i][j] += a[i][k] * b[k][j];
                    }
                }
            }
            return out;
        }

        scale(scale) {
            const data = this.data;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 4; j++) {
                    data[i][j] *= scale;
                }
            }
            return this;
        }

        /// Apply a linear transformation matrix to a vector
        apply3(vec) {
            const out = [0, 0, 0];
            const data = this.data;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    out[i] += vec[j] * data[i][j];
                }
                // apply translation
                out[i] += data[i][3];
            }
            return out;
        }
    }

    const IFIELDS = 9;

    const makeSphereIndexedVbo = function(gl, instances) {
        if (!instances) {
            instances = [0.0, 0.0, 0.0, 0.5];
        }

        // This buffer is going to be a concatenation of sphere data and instance
        // data.  Each instance will share the geometry of the sphere.
        const data = new Float32Array(instances.length + coords.length);
        data.set(coords);
        data.set(instances, coords.length);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        const ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // Get the pointer to the end of sphere data.
        // This will be used as an offset for instance data.
        const instOffset = 4 * coords.length;

        return {
            ibo: ibo,
            vbo: vbo,
            instances: instances.length / IFIELDS,
            itemCount: idx.length,
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
    };

    const makeInstanceData = function() {
        const count = 0;
        const instanceData = new Float32Array(count * IFIELDS);
        const intView = new Uint32Array(instanceData.buffer);
        const r2 = () => Math.random() * 2 - 1;
        for (let i = 0; i < count; i++) {
            const instance = [r2()*32, r2()*32, r2()*32*0.7, 1.6, 0.5, 0.5, 0.5];
            const groupIndex = [i, i];
            instanceData.set(instance, i*IFIELDS);
            intView.set(groupIndex, i*IFIELDS+instance.length);
        }
        return instanceData;
    };

    const defaultBackground = [0, 0, 0, 0];
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
    };

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
    };
    const onShiftUp = (event) => {
        if (event.key !== 'Shift') { return; }
        mouseInfo.shiftDown = false;
    };

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

}());
