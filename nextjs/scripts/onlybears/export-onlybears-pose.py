"""Export the current OnlyBears Blender pose into the runtime JSON.

Run inside Blender's scripting workspace or with Blender's Python interpreter:

    blender --background scripts/onlybears/onlybears_lab.blend \
      --python scripts/onlybears/export-onlybears-pose.py

Blender's glTF exporter is deliberately used as the coordinate conversion
boundary. Reading pose quaternions directly from Blender would mix Z-up pose
space with the Y-up local rotations consumed by Three.js.
"""

import json
import os
import struct
import tempfile

import bpy


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POSE_PATH = os.path.join(ROOT, "src", "config", "onlyBearsPose.json")
ARMATURE_NAME = "Animal_2004_Rig.001"
MESH_NAME = "Animal_2004.001"
ROOT_NAME = "bear_root"
POSED_BONES = (
    "center",
    "shoulder_L", "upperarm_L", "arm_L", "hand_L", "fingers_L",
    "shoulder_R", "upperarm_R", "arm_R", "hand_R", "fingers_R",
)


def read_glb(path):
    with open(path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"glTF":
        raise ValueError(f"not a GLB: {path}")
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    binary_offset = 20 + json_length
    binary_length = struct.unpack_from("<I", data, binary_offset)[0]
    return document, data[binary_offset + 8:binary_offset + 8 + binary_length]


def sampled_rotations(document, binary):
    names = {index: node.get("name") for index, node in enumerate(document.get("nodes", []))}
    candidates = []
    for animation in document.get("animations", []):
        rotations = {}
        for channel in animation["channels"]:
            target = channel["target"]
            name = names.get(target["node"])
            if target["path"] != "rotation" or name not in POSED_BONES:
                continue
            accessor = document["accessors"][animation["samplers"][channel["sampler"]]["output"]]
            view = document["bufferViews"][accessor["bufferView"]]
            offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            rotations[name] = list(struct.unpack_from("<4f", binary, offset))
        candidates.append(rotations)
    rotations = max(candidates, key=len, default={})
    missing = set(POSED_BONES) - set(rotations)
    if missing:
        raise RuntimeError(f"sampled animation is missing bones: {sorted(missing)}")
    return rotations


def export_runtime_rotations():
    armature = bpy.data.objects.get(ARMATURE_NAME)
    mesh = bpy.data.objects.get(MESH_NAME)
    if not armature or not mesh:
        raise RuntimeError(f"missing {ARMATURE_NAME} or {MESH_NAME}")

    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    frame = bpy.context.scene.frame_current
    armature_action = armature.animation_data.action if armature.animation_data else None
    frame_start = bpy.context.scene.frame_start
    frame_end = bpy.context.scene.frame_end
    temp_path = tempfile.mktemp(prefix="onlybears-pose-", suffix=".glb")
    try:
        bpy.ops.object.select_all(action="DESELECT")
        armature.select_set(True)
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = armature
        bpy.context.scene.frame_start = frame
        bpy.context.scene.frame_end = frame
        bpy.ops.export_scene.gltf(
            filepath=temp_path,
            check_existing=False,
            export_format="GLB",
            use_selection=True,
            export_animations=True,
            export_animation_mode="SCENE",
            export_frame_range=True,
            export_force_sampling=True,
            export_frame_step=1,
            export_skins=True,
            export_morph=True,
            export_yup=True,
            export_apply=False,
        )
        document, binary = read_glb(temp_path)
        return sampled_rotations(document, binary)
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        bpy.ops.object.select_all(action="DESELECT")
        for obj in selected:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = active
        bpy.context.scene.frame_start = frame_start
        bpy.context.scene.frame_end = frame_end
        bpy.context.scene.frame_set(frame)
        if armature.animation_data:
            armature.animation_data.action = armature_action
        bpy.context.view_layer.update()


def runtime_root():
    root = bpy.data.objects.get(ROOT_NAME)
    if not root:
        raise RuntimeError(f"missing {ROOT_NAME}")
    # Blender is Z-up; the runtime group is Y-up with the glTF forward axis.
    return {
        "position": [root.location.x, root.location.z, -root.location.y],
        "rotationY": root.rotation_euler.z,
        "scale": root.scale.x,
    }


def main():
    with open(POSE_PATH, encoding="utf-8") as handle:
        pose = json.load(handle)
    pose["_about"] = (
        "Generated from onlybears_lab.blend through Blender's glTF exporter. "
        "Positions are in the computer Selectable's local Y-up frame. "
        "The anatomical LEFT paw covers the screen and the anatomical RIGHT paw supports. "
        "Contact orientation is authored in Blender; runtime does not rotate either hand."
    )
    pose["coverHand"] = "left"
    pose["supportHand"] = "right"
    pose["root"].update(runtime_root())
    pose["handScale"] = {"hand_L": 4.7, "hand_R": 1.0}
    pose["keys"]["cover"] = export_runtime_rotations()
    with open(POSE_PATH, "w", encoding="utf-8") as handle:
        json.dump(pose, handle, indent=2)
        handle.write("\n")
    print(f"wrote {POSE_PATH}")


if __name__ == "__main__":
    main()
