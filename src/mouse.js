import {Matrix4} from './matrix';

export class MouseInput {
    constructor(canvas) {
        this.canvas = canvas;
        canvas.addEventListener('mousedown', this.onMouseDown);
        canvas.addEventListener('wheel', this.onMouseWheel);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('mouseout', this.onMouseUp);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('keydown', this.onShiftDown);
        window.addEventListener('keyup', this.onShiftUp);
    }

    popRotationDelta() {
        const {prevPos, curPos, canvas} = this;
        const delta = {
            x: curPos.x - prevPos.x,
            y: curPos.y - prevPos.y,
        };
        this.prevPos = curPos;
        const rotationScale = Math.PI * 4.0 / Math.max(canvas.width, canvas.height);
        if (this.rotZ) {
            return Matrix4.rotZ(delta.x * rotationScale);
        } else {
            return Matrix4.rotY(delta.x * rotationScale).mul(Matrix4.rotX(delta.y * rotationScale));
        }
    }
    popZoomDelta() {
        const prev = this.prevMwheel;
        this.prevMwheel = this.curMwheel;
        return (this.curMwheel - prev) / -200.0;
    }

    shiftDown = false;
    tracking = false;
    rotZ = false;
    prevPos = {x: 0, y: 0};
    curPos = {x: 0, y: 0};
    prevMwheel = 0;
    curMwheel = 0;

    onMouseMove = (event) => {
        if (this.tracking) {
            this.curPos = {x: event.pageX, y: event.pageY};
        }
    };
    onMouseDown = (event) => {
        this.tracking = true;
        this.rotZ = this.shiftDown;
        this.curPos = {x: event.pageX, y: event.pageY};
        this.prevPos = {x: event.pageX, y: event.pageY};
    };
    onMouseUp = (event) => {
        this.tracking = false;
    };
    onMouseWheel = (event) => {
        event.preventDefault();
        this.curMwheel += event.deltaY;
    };
    onShiftDown = (event) => {
        if (event.key !== 'Shift') { return; }
        this.shiftDown = true;
    };
    onShiftUp = (event) => {
        if (event.key !== 'Shift') { return; }
        this.shiftDown = false;
    };
};
