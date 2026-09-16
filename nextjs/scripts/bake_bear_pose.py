"""Bake bearPoses.json into per-bear GLBs by post-processing sit_log's animation.

Run:

    python3 nextjs/scripts/bake_bear_pose.py

Reads:  nextjs/src/config/bearPoses.json
Reads:  nextjs/public/wildpoly/bear_sit_fixed.glb   (source rig)
Writes: nextjs/public/wildpoly/bear_sit_<bearId>.glb  (one per posed bear)

Only bearIds with a non-empty `bones` object are baked.

Why this doesn't use Blender any more
-------------------------------------
The Blender-based bake (previous version) set `pose_bone.rotation_quaternion = dq`,
which Blender then converts to a glTF node rotation via its own axis convention
(Z-up armature -> Y-up export). The lab, meanwhile, applies the pose at runtime
as `bone.quaternion = restQ * dq` where restQ is the glTF Y-up rest already read
by three.js. The two conventions drift on bones with non-trivial rest orientations,
so the site pose visibly differed from the lab preview.

Here we compute the target rotation the same way the lab does:
    target_rotation_yup = node.rotation (rest, Y-up) * quat_from_euler_xyz(rx, ry, rz)
and write it into every keyframe of that node's rotation channel in sit_log so
the mixer serves exactly the value the lab renders. Same for translation:
    target_translation = node.translation + (px, py, pz)

The delta is LAYERED into every keyframe (new_key = old_key * dq), so a posed
bone keeps its sit_log motion and simply plays it around the new angle. That is
what makes a wrist angle and the sit_log paw wag coexist. Non-posed bones are
untouched. (This used to write a single constant, which froze posed bones - the
paragraph above describes the maths, not a freeze.)
"""

import json
import math
import os
import struct
import sys


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BEAR_GLB = os.path.join(REPO, "public", "wildpoly", "bear_sit_fixed.glb")
POSES_JSON = os.path.join(REPO, "src", "config", "bearPoses.json")
OUT_DIR = os.path.join(REPO, "public", "wildpoly")


# --- quat helpers ------------------------------------------------------------
# All quats are (x, y, z, w) to match glTF storage.

def quat_from_euler_xyz(rx, ry, rz):
    """three.js Euler(rx, ry, rz, 'XYZ').toQuaternion()."""
    cx, sx = math.cos(rx / 2), math.sin(rx / 2)
    cy, sy = math.cos(ry / 2), math.sin(ry / 2)
    cz, sz = math.cos(rz / 2), math.sin(rz / 2)
    # order XYZ: q = qx * qy * qz (in three.js's setFromEuler)
    x = sx * cy * cz + cx * sy * sz
    y = cx * sy * cz - sx * cy * sz
    z = cx * cy * sz + sx * sy * cz
    w = cx * cy * cz - sx * sy * sz
    return [x, y, z, w]


def quat_mul(a, b):
    """three.js Quaternion.multiply: a * b."""
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [
        ax * bw + aw * bx + ay * bz - az * by,
        ay * bw + aw * by + az * bx - ax * bz,
        az * bw + aw * bz + ax * by - ay * bx,
        aw * bw - ax * bx - ay * by - az * bz,
    ]


# --- glb helpers -------------------------------------------------------------

def read_glb(path):
    with open(path, "rb") as f:
        magic = f.read(4)
        version = struct.unpack("<I", f.read(4))[0]
        total = struct.unpack("<I", f.read(4))[0]
        if magic != b"glTF":
            raise RuntimeError(f"not a glb: {path}")
        # JSON chunk
        j_len = struct.unpack("<I", f.read(4))[0]
        j_type = f.read(4)
        if j_type != b"JSON":
            raise RuntimeError(f"expected JSON chunk, got {j_type}")
        j = json.loads(f.read(j_len))
        # optional BIN chunk
        bin_data = b""
        while True:
            head = f.read(8)
            if not head:
                break
            c_len = struct.unpack("<I", head[:4])[0]
            c_type = head[4:8]
            data = f.read(c_len)
            if c_type == b"BIN\x00":
                bin_data = data
    return j, bytearray(bin_data)


def write_glb(path, j, bin_data):
    j_bytes = json.dumps(j, separators=(",", ":")).encode()
    # Pad JSON chunk to 4 bytes with spaces (0x20)
    j_pad = (-len(j_bytes)) % 4
    j_bytes += b" " * j_pad
    # Pad BIN chunk to 4 bytes with zeros
    b_bytes = bytes(bin_data)
    b_pad = (-len(b_bytes)) % 4
    b_bytes += b"\x00" * b_pad
    total = 12 + 8 + len(j_bytes) + 8 + len(b_bytes)
    with open(path, "wb") as f:
        f.write(b"glTF")
        f.write(struct.pack("<I", 2))
        f.write(struct.pack("<I", total))
        f.write(struct.pack("<I", len(j_bytes)))
        f.write(b"JSON")
        f.write(j_bytes)
        f.write(struct.pack("<I", len(b_bytes)))
        f.write(b"BIN\x00")
        f.write(b_bytes)


def find_node_index(j, name):
    for i, n in enumerate(j.get("nodes", [])):
        if n.get("name") == name:
            return i
    return None


def find_anim(j, name):
    for a in j.get("animations", []):
        if a.get("name") == name:
            return a
    return None


def read_sampler_output(j, bin_data, sampler_output_acc_idx, values_per_key):
    """Read the current keyframe samples as a list of tuples."""
    acc = j["accessors"][sampler_output_acc_idx]
    n = acc["count"]
    bv = j["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    flat = struct.unpack(f"<{values_per_key * n}f", bin_data[off:off + values_per_key * 4 * n])
    return [flat[i * values_per_key:(i + 1) * values_per_key] for i in range(n)]


def write_sampler_output(j, bin_data, sampler_output_acc_idx, values_per_key, samples):
    """Append fresh buffer view holding `samples` (list of N tuples of vpk floats each)
    and repoint the accessor. `samples` length must equal accessor.count."""
    acc = j["accessors"][sampler_output_acc_idx]
    n = acc["count"]
    if len(samples) != n:
        raise RuntimeError(f"expected {n} samples, got {len(samples)}")
    flat = [v for tup in samples for v in tup]
    payload = struct.pack(f"<{values_per_key * n}f", *flat)

    buffer_idx = 0
    view_offset = len(bin_data)
    pad = (-view_offset) % 4
    bin_data.extend(b"\x00" * pad)
    view_offset = len(bin_data)
    bin_data.extend(payload)

    new_view_idx = len(j["bufferViews"])
    j["bufferViews"].append({
        "buffer": buffer_idx,
        "byteOffset": view_offset,
        "byteLength": len(payload),
    })
    acc["bufferView"] = new_view_idx
    acc["byteOffset"] = 0
    j["buffers"][buffer_idx]["byteLength"] = len(bin_data)


# --- bake --------------------------------------------------------------------

def bake_bear(bear_id, pose, src_json, src_bin):
    """Return (json_dict, bytearray) with sit_log rewritten so the posed bones
    hold `rest * delta` for every keyframe. Non-posed bones untouched.

    src_json/src_bin are read fresh per call - we deep-copy to avoid mutating
    the source across bakes.
    """
    j = json.loads(json.dumps(src_json))  # deep copy
    bin_data = bytearray(src_bin)         # copy

    sit_log = find_anim(j, "sit_log")
    if sit_log is None:
        raise RuntimeError("sit_log missing from source GLB")

    applied, skipped = [], []
    for bname, adj in pose.get("bones", {}).items():
        node_idx = find_node_index(j, bname)
        if node_idx is None:
            skipped.append(bname)
            continue

        node = j["nodes"][node_idx]
        dq = quat_from_euler_xyz(
            float(adj.get("rx", 0.0)),
            float(adj.get("ry", 0.0)),
            float(adj.get("rz", 0.0)),
        )
        dp = (
            float(adj.get("px", 0.0)),
            float(adj.get("py", 0.0)),
            float(adj.get("pz", 0.0)),
        )

        # LAYER the delta into every existing sit_log keyframe:
        #   new_rot_key = old_rot_key * dq
        #   new_pos_key = old_pos_key + dp
        # The site holds sit_log at frame 30 (animationHoldFrame), so at zero
        # delta the bone shows exactly what sit_log frame 30 does; sliders
        # rotate FROM that baseline instead of snapping to bind. Non-posed
        # bones stay untouched.
        #
        # For bones with no channel in sit_log (e.g. fingers_L/fingers_R which
        # were added post-hoc), edit node.rotation/translation directly: their
        # bind pose IS their reference, so bind * dq is the correct pose.
        has_rotation_channel = False
        has_translation_channel = False
        for ch in sit_log["channels"]:
            t = ch.get("target", {})
            if t.get("node") != node_idx:
                continue
            sampler = sit_log["samplers"][ch["sampler"]]
            path = t.get("path")
            if path == "rotation":
                samples = read_sampler_output(j, bin_data, sampler["output"], 4)
                new_samples = [tuple(quat_mul(list(s), dq)) for s in samples]
                write_sampler_output(j, bin_data, sampler["output"], 4, new_samples)
                has_rotation_channel = True
            elif path == "translation":
                samples = read_sampler_output(j, bin_data, sampler["output"], 3)
                new_samples = [(s[0] + dp[0], s[1] + dp[1], s[2] + dp[2]) for s in samples]
                write_sampler_output(j, bin_data, sampler["output"], 3, new_samples)
                has_translation_channel = True
            # ignore scale
        if not has_rotation_channel:
            rest_q = list(node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
            node["rotation"] = list(quat_mul(rest_q, dq))
        if not has_translation_channel:
            rest_p = list(node.get("translation", [0.0, 0.0, 0.0]))
            node["translation"] = [rest_p[0] + dp[0], rest_p[1] + dp[1], rest_p[2] + dp[2]]
        applied.append(bname)

    return j, bin_data, applied, skipped


def main():
    with open(POSES_JSON) as f:
        poses = json.load(f)

    src_json, src_bin = read_glb(BEAR_GLB)

    baked = []
    # Always emit an output for every bearId the site expects, even when the
    # config has no bones - then the output is a byte-copy of the source and
    # the bear renders its default sit_log animation. Prevents the site from
    # showing a stale "crazy" pose after a config reset.
    for bear_id, pose in poses.items():
        out_path = os.path.join(OUT_DIR, f"bear_sit_{bear_id}.glb")
        bones = pose.get("bones") or {}
        if not bones:
            j = json.loads(json.dumps(src_json))
            write_glb(out_path, j, bytearray(src_bin))
            baked.append({
                "bear_id": bear_id, "applied": [], "skipped": [], "out": out_path,
                "note": "no bones - copied source",
            })
            continue
        j, bin_data, applied, skipped = bake_bear(bear_id, pose, src_json, src_bin)
        write_glb(out_path, j, bin_data)
        baked.append({
            "bear_id": bear_id,
            "applied": applied,
            "skipped": skipped,
            "out": out_path,
        })

    print("BAKE_RESULT:" + json.dumps({"baked": baked}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("BAKE_ERROR:" + json.dumps({"error": repr(e)}), file=sys.stderr)
        raise
