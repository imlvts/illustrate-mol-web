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
        0,0,-1,.43,-.31,-.85,-.16,-.5,-.85,.72,-.53,-.45,.85,0,-.53,-.53,0,-.85,
        -.16,.5,-.85,.43,.31,-.85,.95,-.31,0,-.28,-.85,-.45,.26,-.81,-.53,0,-1,0,
        -.89,0,-.45,-.69,-.5,-.53,-.95,-.31,0,-.28,.85,-.45,-.69,.5,-.53,-.59,.81,0
        ,.72,.53,-.45,.26,.81,-.53,.59,.81,0,.59,-.81,0,-.59,-.81,0,-.95,.31,0,0,1,
        0,.95,.31,0,.28,-.85,.45,.69,-.5,.53,.16,-.5,.85,-.72,-.53,.45,-.26,-.81,
        .53,-.43,-.31,.85,-.72,.53,.45,-.85,0,.53,-.43,.31,.85,.28,.85,.45,-.26,.81
        ,.53,.16,.5,.85,.89,0,.45,.69,.5,.53,.53,0,.85,0,0,1
    ]);
    const idx = new Uint16Array([
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
