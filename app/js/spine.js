// Minimal native ES Module reader for the source-derived Spine 4.1 subset in
// app/data/spine.json. It implements only the features present in the two
// TarotBook page skeletons and fails closed for anything else.
const DEG = Math.PI / 180;

function bezierLut(t0, v0, cx1, cy1, cx2, cy2, t1, v1) {
  const tmpx = (t0 - cx1 * 2 + cx2) * 0.03;
  const tmpy = (v0 - cy1 * 2 + cy2) * 0.03;
  const dddx = ((cx1 - cx2) * 3 - t0 + t1) * 0.006;
  const dddy = ((cy1 - cy2) * 3 - v0 + v1) * 0.006;
  let ddx = tmpx * 2 + dddx;
  let ddy = tmpy * 2 + dddy;
  let dx = (cx1 - t0) * 0.3 + tmpx + dddx * 0.16666667;
  let dy = (cy1 - v0) * 0.3 + tmpy + dddy * 0.16666667;
  let x = t0 + dx;
  let y = v0 + dy;
  const lut = [x, y];
  for (let n = 0; n < 8; n++) {
    dx += ddx; dy += ddy; ddx += dddx; ddy += dddy;
    x += dx; y += dy;
    lut.push(x, y);
  }
  return lut;
}

function lutValue(lut, time, t0, v0, t1, v1) {
  if (lut[0] > time) return v0 + (time - t0) / (lut[0] - t0) * (lut[1] - v0);
  for (let i = 2; i < lut.length; i += 2) {
    if (lut[i] >= time) {
      const x = lut[i - 2];
      const y = lut[i - 1];
      return y + (time - x) / (lut[i] - x) * (lut[i + 1] - y);
    }
  }
  const x = lut[lut.length - 2];
  const y = lut[lut.length - 1];
  return y + (time - x) / (t1 - x) * (v1 - y);
}

function curveValue(timeline, time, valueIndex) {
  const frames = timeline.frames;
  const entries = timeline.type === 'scale' ? 3 : 2;
  let index = 0;
  for (let i = entries; i < frames.length; i += entries) {
    if (frames[i][0] > time) break;
    index = i;
  }
  const frame = frames[index / entries];
  const value = frame[valueIndex];
  const nextFrame = frames[index / entries + 1];
  if (!nextFrame) return value;
  const curveEntry = timeline.curves[index / entries];
  const t0 = frame[0];
  const t1 = nextFrame[0];
  const v0 = value;
  const v1 = nextFrame[valueIndex];
  if (curveEntry === 'stepped') return v0;
  if (!Array.isArray(curveEntry) && curveEntry !== 'linear') return v0 + (v1 - v0) * ((time - t0) / (t1 - t0));
  let curve = null;
  if (timeline.type === 'scale') curve = curveEntry === 'linear' ? null : curveEntry[valueIndex - 1];
  else curve = curveEntry === 'linear' ? null : (Array.isArray(curveEntry[0]) ? curveEntry[0] : curveEntry);
  if (!Array.isArray(curve)) return v0 + (v1 - v0) * ((time - t0) / (t1 - t0));
  return lutValue(bezierLut(t0, v0, curve[0], curve[1], curve[2], curve[3], t1, v1), time, t0, v0, t1, v1);
}

class Bone {
  constructor(data, index, bones) {
    this.data = data;
    this.index = index;
    this.parent = data.parent == null ? null : bones[data.parent];
    this.setToSetupPose();
  }
  setToSetupPose() {
    this.x = this.data.x;
    this.y = this.data.y;
    this.rotation = this.data.rotation;
    this.scaleX = this.data.scaleX;
    this.scaleY = this.data.scaleY;
    this.shearX = Number(this.data.shearX);
    this.shearY = Number(this.data.shearY);
  }
  update() {
    const rotationY = this.rotation + 90 + this.shearY;
    const la = Math.cos((this.rotation + this.shearX) * DEG) * this.scaleX;
    const lb = Math.cos(rotationY * DEG) * this.scaleY;
    const lc = Math.sin((this.rotation + this.shearX) * DEG) * this.scaleX;
    const ld = Math.sin(rotationY * DEG) * this.scaleY;
    if (!this.parent) {
      // Spine's root uses shearY=90; cos(90) is normally zeroed by Math.fround in 4.1.
      this.a = la;
      this.b = lb;
      this.c = lc;
      this.d = ld;
      this.worldX = this.x;
      this.worldY = this.y;
      return;
    }
    const parent = this.parent;
    this.worldX = parent.a * this.x + parent.b * this.y + parent.worldX;
    this.worldY = parent.c * this.x + parent.d * this.y + parent.worldY;
    this.a = parent.a * la + parent.b * lc;
    this.b = parent.a * lb + parent.b * ld;
    this.c = parent.c * la + parent.d * lc;
    this.d = parent.c * lb + parent.d * ld;
  }
}

export class SpineSkeleton {
  constructor(data) {
    if (data.version !== '4.1.24') throw new Error(`unsupported Spine version ${data.version}`);
    this.data = data;
    this.bones = [];
    for (let i = 0; i < data.bones.length; i++) this.bones.push(new Bone(data.bones[i], i, this.bones));
    this.setToSetupPose();
  }
  setToSetupPose() {
    for (const bone of this.bones) bone.setToSetupPose();
    this.slots = this.data.slots.map((slot, index) => ({ data: slot, index, bone: slot.bone == null ? null : this.bones[slot.bone], attachmentName: slot.attachment }));
  }
  apply(animationName, time, options = {}) {
    const animation = this.data.animations[animationName];
    if (!animation) throw new Error(`unknown Spine animation ${animationName}`);
    this.setToSetupPose();
    for (const bone of this.bones) bone.update();
    const blend = options.blend || 'setup';
    const setupRotations = this.bones.map(bone => bone.rotation);
    const setupScales = this.bones.map(bone => ({ x: bone.scaleX, y: bone.scaleY }));
    for (const timeline of animation.timelines) {
      if (time < timeline.frames[0][0]) continue;
      if (timeline.type === 'rotate') {
        const bone = this.bones[timeline.bone];
        const value = curveValue(timeline, time, 1);
        bone.rotation = blend === 'add' ? bone.rotation + value : setupRotations[timeline.bone] + value;
      } else if (timeline.type === 'scale') {
        const bone = this.bones[timeline.bone];
        const sy = curveValue(timeline, time, 2);
        // SkeletonBinary decodes Spine scale curves with a y scale of 0.01, so
        // the stored value is already absolute. setup scaling remains unchanged.
        const sx = curveValue(timeline, time, 1);
        bone.scaleX = blend === 'add' ? bone.scaleX * sx : sx;
        bone.scaleY = blend === 'add' ? bone.scaleY * sy : setupScales[timeline.bone].y * sy;
      } else if (timeline.type === 'attachment') {
        const slot = this.slots[timeline.slot];
        let name = slot.data.attachment;
        for (const [frameTime, frameName] of timeline.frames) {
          if (frameTime <= time) name = frameName;
        }
        slot.attachmentName = name;
      } else {
        throw new Error(`unsupported Spine timeline ${timeline.type}`);
      }
    }
    for (const bone of this.bones) bone.update();
    return this;
  }
  worldVertices() {
    const attachment = this.data.attachments.find(item => this.slots.some(slot => slot.attachmentName === item.path));
    if (!attachment) return new Float32Array(0);
    // MeshAttachment has 18 vertices (36 world values); boneCounts describes
    // weights per world-value pair rather than the number of vertices.
    const vertexCount = attachment.uvs ? attachment.uvs.length / 2 : attachment.boneCounts.length;
    const result = new Float32Array(vertexCount * 2);
    // Source Spine stores bone weights as interleaved [count, boneIndex, ...]
    // pairs. The first vertex in this page is weighted to bone 19, not bone 1.
    let boneIndex = 0;
    let weightIndex = 0;
    for (let v = 0; v < vertexCount; v++) {
      let x = 0;
      let y = 0;
      const count = attachment.bones[boneIndex++];
      for (let i = 0; i < count; i++) {
        const bone = this.bones[attachment.bones[boneIndex++]];
        const vx = attachment.vertices[weightIndex * 3];
        const vy = attachment.vertices[weightIndex * 3 + 1];
        const weight = attachment.vertices[weightIndex * 3 + 2];
        x += (vx * bone.a + vy * bone.b + bone.worldX) * weight;
        y += (vx * bone.c + vy * bone.d + bone.worldY) * weight;
        weightIndex++;
      }
      result[v * 2] = x;
      result[v * 2 + 1] = y;
    }
    return result;
  }
}

export function sourceUvs(skeleton) {
  const attachment = skeleton.data.attachments[0];
  const region = skeleton.data.atlas.regions.find(item => item.name === attachment.path);
  if (!region) throw new Error(`missing source atlas region ${attachment.path}`);
  const [left, bottom, width, height] = region.bounds;
  const [texW, texH] = skeleton.data.atlas.size;
  const u0 = left / texW;
  const v0 = 1 - (bottom + height) / texH;
  const uvs = new Float32Array(attachment.uvs.length);
  for (let i = 0; i < uvs.length; i += 2) {
    uvs[i] = u0 + attachment.uvs[i] * width / texW;
    uvs[i + 1] = v0 + attachment.uvs[i + 1] * height / texH;
  }
  return uvs;
}

export function layoutScale(mesh, source, referenceSize, referenceScale, layoutScaleMode) {
  if (!(referenceScale > 0) || !Array.isArray(referenceSize)) return 1;
  if (layoutScaleMode === 3) {
    const refAspect = referenceSize[0] / referenceSize[1];
    const frameAspect = source.width / source.height;
    return referenceScale * (frameAspect > refAspect ? frameAspect / refAspect : source.height / referenceSize[1]);
  }
  if (layoutScaleMode === 1) return referenceScale * Math.min(source.width / referenceSize[0], source.height / referenceSize[1]);
  if (layoutScaleMode === 2) return referenceScale * Math.max(source.width / referenceSize[0], source.height / referenceSize[1]);
  return referenceScale;
}
