import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

globalThis.self = globalThis;

const pose = JSON.parse(fs.readFileSync("src/config/onlyBearsPose.json", "utf8"));
const source = fs.readFileSync("public/wildpoly/bear_old_grey.glb");

const stripMaterials = (glb) => {
  const jsonLength = glb.readUInt32LE(12);
  const document = JSON.parse(glb.subarray(20, 20 + jsonLength));
  delete document.images;
  delete document.textures;
  delete document.samplers;
  delete document.materials;
  for (const mesh of document.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) delete primitive.material;
  }

  let json = Buffer.from(JSON.stringify(document));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const binaryOffset = 20 + jsonLength;
  const binaryLength = glb.readUInt32LE(binaryOffset);
  const binary = glb.subarray(binaryOffset + 8, binaryOffset + 8 + binaryLength);
  const output = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
  output.write("glTF", 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.write("JSON", 16);
  json.copy(output, 20);
  const outputBinaryOffset = 20 + json.length;
  output.writeUInt32LE(binary.length, outputBinaryOffset);
  output.write("BIN\0", outputBinaryOffset + 4);
  binary.copy(output, outputBinaryOffset + 8);
  return output;
};

const loadGltf = (data) => new Promise((resolve, reject) => {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  new GLTFLoader().parse(buffer, "", resolve, reject);
});

const gltf = await loadGltf(stripMaterials(source));
const bones = {};
gltf.scene.traverse((object) => {
  if (object.isBone) bones[object.name] = object;
});

const clip = gltf.animations.find((animation) => animation.name === "sit_log") ?? gltf.animations[0];
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(clip).play();
mixer.setTime(pose.holdFrame / 24);
for (const [name, quaternion] of Object.entries(pose.keys.cover)) {
  bones[name]?.quaternion.fromArray(quaternion);
}
const fingersRest = bones.fingers_L.position.clone();
bones.hand_L.scale.multiplyScalar(pose.handScale.hand_L);
bones.fingers_L.position.copy(fingersRest).divideScalar(pose.handScale.hand_L);
gltf.scene.updateMatrixWorld(true);

const runtimePosition = (boneName) => {
  const position = new THREE.Vector3();
  bones[boneName].getWorldPosition(position);
  return position.multiplyScalar(pose.root.scale).add(new THREE.Vector3(...pose.root.position));
};

const fingers = runtimePosition("fingers_L");
const screen = {
  minX: -0.5951,
  maxX: 0.3965,
  minY: 0.4918,
  maxY: 1.2766,
  z: -0.2534,
};
const errors = [];
if (fingers.x < screen.minX || fingers.x > screen.maxX) errors.push("covering fingers are outside screen width");
if (fingers.y < screen.minY || fingers.y > screen.maxY) errors.push("covering fingers are outside screen height");
if (fingers.z < screen.z - 0.02) errors.push("covering fingers are behind the screen");
if (fingers.z > screen.z + 0.2) errors.push("covering fingers are too far in front of the screen");
const pawMin = new THREE.Vector2(Infinity, Infinity);
const pawMax = new THREE.Vector2(-Infinity, -Infinity);
const vertex = new THREE.Vector3();
gltf.scene.traverse((object) => {
  if (!object.isSkinnedMesh) return;
  const boneNames = object.skeleton.bones.map((bone) => bone.name);
  const skinIndex = object.geometry.attributes.skinIndex;
  const skinWeight = object.geometry.attributes.skinWeight;
  const position = object.geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    let belongsToPaw = false;
    for (let influence = 0; influence < 4; influence += 1) {
      const boneName = boneNames[skinIndex.getComponent(index, influence)];
      const weight = skinWeight.getComponent(index, influence);
      if ((boneName === "hand_L" || boneName === "fingers_L") && weight > 0.15) belongsToPaw = true;
    }
    if (!belongsToPaw) continue;
    object.getVertexPosition(index, vertex);
    vertex.applyMatrix4(object.matrixWorld)
      .multiplyScalar(pose.root.scale)
      .add(new THREE.Vector3(...pose.root.position));
    pawMin.min(new THREE.Vector2(vertex.x, vertex.y));
    pawMax.max(new THREE.Vector2(vertex.x, vertex.y));
  }
});
const overlapWidth = Math.max(0, Math.min(pawMax.x, screen.maxX) - Math.max(pawMin.x, screen.minX));
const overlapHeight = Math.max(0, Math.min(pawMax.y, screen.maxY) - Math.max(pawMin.y, screen.minY));
const coverage = overlapWidth * overlapHeight
  / ((screen.maxX - screen.minX) * (screen.maxY - screen.minY));
if (coverage < 0.65) errors.push(`covering paw overlaps only ${(coverage * 100).toFixed(1)}% of the screen`);
if (errors.length) throw new Error(errors.join("; "));

console.log(JSON.stringify({
  coveringFingers: fingers.toArray().map((value) => Number(value.toFixed(5))),
  screenCenter: [-0.0993, 0.8842, screen.z],
  coverHandScale: pose.handScale.hand_L,
  boundingCoverage: Number(coverage.toFixed(3)),
}));
