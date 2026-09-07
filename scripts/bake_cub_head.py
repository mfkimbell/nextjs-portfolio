"""
Headless Blender script: bake the cubHeadPose.json values into cub.glb.

Called from the /api/dev/cub-head-pose POST endpoint after JSON write. Opens
the sitting-bear source .blend, applies the saved rotation and world-space
position offset to the named bone, bakes the pose as rest, and re-exports
cub.glb — replacing the file the site loads.

Runs standalone via:
    /Applications/Blender.app/Contents/MacOS/Blender \\
        --background /path/to/Bear_Baby.blend --python bake_cub_head.py
"""
import bpy
import json
import math
import os
import sys
from mathutils import Vector, Quaternion

REPO = "/Users/mkimbell/repositories/nextjs-portfolio"
POSE_JSON = os.path.join(REPO, "nextjs/src/config/cubHeadPose.json")
BLEND_SITTING = os.path.join(REPO, "nextjs/public/bear/2/cub_sitting.blend")
BLEND_SOURCE = os.path.join(REPO, "nextjs/public/bear/2/Bear_Baby.blend")
OUT_GLB = os.path.join(REPO, "nextjs/public/bear/2/cub.glb")


def load_pose():
    with open(POSE_JSON) as f:
        return json.load(f)


def find_bone_name(arm, target):
    """Return actual bone name matching `target` case/dot-insensitively."""
    norm = target.lower().replace(".", "").replace("_", "")
    for b in arm.data.bones:
        if b.name.lower().replace(".", "").replace("_", "") == norm:
            return b.name
    return target


def apply_pose(pose):
    arm = bpy.data.objects.get("BabyBear_Rig")
    if arm is None:
        for o in bpy.data.objects:
            if o.type == "ARMATURE":
                arm = o
                break
    if arm is None:
        raise RuntimeError("no armature found")

    mesh = None
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.lower().startswith("baby"):
            mesh = o
            break
    if mesh is None:
        for o in bpy.data.objects:
            if o.type == "MESH":
                mesh = o
                break

    # First apply the sitting pose (from the memory of what worked before)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")

    def rotate_arm(pb, axis_arm, angle_deg):
        rest_rot = pb.bone.matrix_local.to_3x3()
        axis_local = rest_rot.inverted() @ Vector(axis_arm).normalized()
        q = Quaternion(axis_local, math.radians(angle_deg))
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = q

    # Sitting pose baseline
    rotate_arm(arm.pose.bones["root.x"], (1, 0, 0), -80)
    rotate_arm(arm.pose.bones["thigh_stretch.l"], (1, 0, 0), -10)
    rotate_arm(arm.pose.bones["thigh_stretch.r"], (1, 0, 0), -10)
    rotate_arm(arm.pose.bones["neck.x"], (1, 0, 0), 70)

    # Now the head bone from the JSON (world/objective rotation + position offset)
    bone_name = find_bone_name(arm, pose.get("bone", "head.x"))
    pb = arm.pose.bones[bone_name]
    rest_rot = pb.bone.matrix_local.to_3x3()
    rx = float(pose.get("rx", 0))
    ry = float(pose.get("ry", 0))
    rz = float(pose.get("rz", 0))
    # Blender's coordinate system differs from three.js; the site treats
    # rx/ry/rz as world Euler XYZ in three.js Y-up. Convert to Blender's Z-up
    # for the same visual result: three.js (rx, ry, rz) around world X/Y/Z
    # maps to Blender rotations around world X, Z, -Y respectively (glTF y-up
    # export swaps Y and Z). Compose as a quaternion in armature space.
    qx = Quaternion((1, 0, 0), rx)
    qy = Quaternion((0, 0, 1), ry)  # three.js Y = Blender Z
    qz = Quaternion((0, -1, 0), rz)  # three.js Z = Blender -Y
    world_q = qx @ qy @ qz
    # Convert to bone-local
    axis_local_axis = rest_rot.inverted()
    # Rebuild rotation in bone-local by composing element-wise via the rest matrix
    m_world = world_q.to_matrix()
    m_local = rest_rot.inverted().to_4x4() @ m_world.to_4x4() @ rest_rot.to_4x4()
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = m_local.to_quaternion()

    # position offset — three.js (px, py, pz) with y-up. Blender z-up equivalent:
    px = float(pose.get("px", 0))
    py = float(pose.get("py", 0))
    pz = float(pose.get("pz", 0))
    world_off = Vector((px, -pz, py))  # three.js (x, y, z) -> Blender (x, -z, y)
    # Convert to bone-local
    local_off = rest_rot.inverted() @ world_off
    pb.location = local_off

    bpy.context.view_layer.update()

    # object-level offset
    ox = float(pose.get("ox", 0))
    oy = float(pose.get("oy", 0))
    oz = float(pose.get("oz", 0))
    obj_off = Vector((ox, -oz, oy))
    arm.location += obj_off
    if mesh:
        mesh.location += obj_off

    # ---- bake ----
    bpy.ops.object.mode_set(mode="OBJECT")
    if mesh:
        bpy.ops.object.select_all(action="DESELECT")
        mesh.select_set(True)
        bpy.context.view_layer.objects.active = mesh
        for mod in list(mesh.modifiers):
            if mod.type == "ARMATURE":
                bpy.ops.object.modifier_copy(modifier=mod.name)
                bpy.ops.object.modifier_apply(modifier=mod.name)
                break

    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    if mesh:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm

    # Wipe every action so no animation slips into the export
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for o in bpy.data.objects:
        if o.animation_data:
            o.animation_data_clear()

    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
    )
    print(f"BAKE_DONE size={os.path.getsize(OUT_GLB)}")


def main():
    # Open fresh source
    bpy.ops.wm.open_mainfile(filepath=BLEND_SOURCE)
    pose = load_pose()
    print(f"BAKE_POSE {pose}")
    apply_pose(pose)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"BAKE_ERROR {e}", file=sys.stderr)
        raise
