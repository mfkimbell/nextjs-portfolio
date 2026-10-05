"""Validate the shipped bear GLBs' facial and skin contracts.

Run from the nextjs directory:

    python3 scripts/validate_bear_assets.py
"""

import glob
import json
import os
import struct
import sys

MESH_NAME = "Bear_Grizzly_B.001"
REQUIRED_BONES = {
    "head": None,
    "mouth": "head",
    "jaw": "head",
    "lip_lower": "jaw",
    "lip_upper": "head",
    "lip_corner_L": "head",
    "lip_corner_R": "head",
}
TARGET_NAMES = ["jawOpen", "mouthWide", "mouthRound", "eyeBlink"]
ONLY_BEAR_KEYS = ["tucked", "raised", "over", "cover"]
ONLY_BEAR_REQUIRED_BONES = {
    "center",
    "shoulder_L", "upperarm_L", "arm_L", "hand_L", "fingers_L",
    "shoulder_R", "upperarm_R", "arm_R", "hand_R", "fingers_R",
}


def read_glb(path):
    data = open(path, "rb").read()
    if data[:4] != b"glTF":
        raise ValueError(f"{path}: invalid GLB header")
    offset = 12
    json_length, json_type = struct.unpack("<I4s", data[offset:offset + 8])
    if json_type != b"JSON":
        raise ValueError(f"{path}: missing JSON chunk")
    offset += 8
    document = json.loads(data[offset:offset + json_length])
    offset += json_length
    binary = b""
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack("<I4s", data[offset:offset + 8])
        offset += 8
        if chunk_type == b"BIN\x00":
            binary = data[offset:offset + chunk_length]
        offset += chunk_length
    return document, binary


def accessor_rows(document, binary, accessor_index):
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"]
    component_type = accessor["componentType"]
    dimensions = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    formats = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
    fmt, size = formats[component_type]
    stride = view.get("byteStride", dimensions * size)
    return [
        struct.unpack_from(f"<{dimensions}{fmt}", binary, base + index * stride)
        for index in range(count)
    ]


def validate(path):
    document, binary = read_glb(path)
    nodes = document.get("nodes", [])
    node_by_name = {node.get("name"): (index, node) for index, node in enumerate(nodes)}
    errors = []

    for bone_name, parent_name in REQUIRED_BONES.items():
        if bone_name not in node_by_name:
            errors.append(f"missing bone {bone_name}")
            continue
        node_index, _ = node_by_name[bone_name]
        if parent_name:
            parent_index, parent_node = node_by_name.get(parent_name, (-1, {}))
            if node_index not in parent_node.get("children", []):
                errors.append(f"{bone_name} is not parented to {parent_name}")

    skins = document.get("skins", [])
    if len(skins) != 1:
        errors.append(f"expected one skin, found {len(skins)}")
    else:
        joints = skins[0].get("joints", [])
        joint_names = {nodes[index].get("name") for index in joints}
        missing_joints = set(REQUIRED_BONES) - joint_names
        if missing_joints:
            errors.append(f"facial bones missing from skin: {sorted(missing_joints)}")

    meshes = [mesh for mesh in document.get("meshes", []) if mesh.get("name") == MESH_NAME]
    if len(meshes) != 1 or len(meshes[0].get("primitives", [])) != 1:
        errors.append(f"expected one primitive named {MESH_NAME}")
    else:
        primitive = meshes[0]["primitives"][0]
        targets = primitive.get("targets", [])
        target_names = meshes[0].get("extras", {}).get("targetNames", [])
        if target_names != TARGET_NAMES:
            errors.append(f"target names are {target_names!r}, expected {TARGET_NAMES!r}")
        if len(targets) != len(TARGET_NAMES):
            errors.append(f"expected {len(TARGET_NAMES)} morph targets, found {len(targets)}")

        attributes = primitive.get("attributes", {})
        if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
            errors.append("primitive is missing JOINTS_0 or WEIGHTS_0")
        else:
            joints = accessor_rows(document, binary, attributes["JOINTS_0"])
            weights = accessor_rows(document, binary, attributes["WEIGHTS_0"])
            if len(joints) != len(weights):
                errors.append("joint and weight counts differ")
            for index, row in enumerate(weights):
                total = sum(row)
                if abs(total - 1.0) > 1e-3:
                    errors.append(f"vertex {index} weights sum to {total}")
                    break

    if errors:
        raise ValueError(f"{os.path.basename(path)}: " + "; ".join(errors))
    return {
        "file": os.path.basename(path),
        "bones": len(REQUIRED_BONES),
        "targets": TARGET_NAMES,
    }


def validate_only_bears_pose(path):
    with open(path, encoding="utf-8") as handle:
        pose = json.load(handle)
    if pose.get("coverHand") != "left" or pose.get("supportHand") != "right":
        raise ValueError("onlyBearsPose.json: expected left cover and right support contract")
    if set(pose.get("keys", {})) != set(ONLY_BEAR_KEYS):
        raise ValueError("onlyBearsPose.json: expected exactly tucked, raised, over, cover keys")
    for key in ONLY_BEAR_KEYS:
        bones = pose["keys"][key]
        missing = ONLY_BEAR_REQUIRED_BONES - set(bones)
        if missing:
            raise ValueError(f"onlyBearsPose.json: {key} missing bones {sorted(missing)}")
        for bone_name in ONLY_BEAR_REQUIRED_BONES:
            quaternion = bones[bone_name]
            if len(quaternion) != 4:
                raise ValueError(f"onlyBearsPose.json: {key}.{bone_name} is not a quaternion")
            length = sum(component * component for component in quaternion) ** 0.5
            if abs(length - 1.0) > 1e-3:
                raise ValueError(f"onlyBearsPose.json: {key}.{bone_name} is not normalized")
    for hand in ("hand_L", "hand_R"):
        if hand not in pose.get("handScale", {}):
            raise ValueError(f"onlyBearsPose.json: missing hand scale for {hand}")
    return {"file": os.path.basename(path), "keys": ONLY_BEAR_KEYS, "coverHand": "left", "supportHand": "right"}


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    paths = sorted(glob.glob(os.path.join(root, "public", "wildpoly", "bear_sit_*.glb")))
    if not paths:
        raise SystemExit("No bear_sit_*.glb files found")
    for path in paths:
        print(json.dumps(validate(path), sort_keys=True))
    pose_path = os.path.join(root, "src", "config", "onlyBearsPose.json")
    print(json.dumps(validate_only_bears_pose(pose_path), sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, struct.error) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
