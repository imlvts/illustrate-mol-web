export class Matrix4 {
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
