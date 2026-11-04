"""Shrink the textures inside a .vrm (GLB) file without touching anything else.

General glTF optimisers drop the VRM extension (expressions, humanoid bones),
so this script only re-encodes the embedded images and rebuilds the binary
chunk; the JSON (and so the VRM data) is kept as is apart from buffer offsets.

usage: uv run --with pillow scripts/shrink_vrm.py in.vrm out.vrm [max_px]
"""

import io
import json
import struct
import sys

from PIL import Image


def main(src: str, dst: str, max_px: int = 1024) -> None:
    data = open(src, "rb").read()
    assert data[:4] == b"glTF", "not a GLB file"
    json_len = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20 : 20 + json_len])
    bin_start = 20 + json_len + 8
    blob = data[bin_start:]

    views = gltf["bufferViews"]
    image_view = {img["bufferView"]: i for i, img in enumerate(gltf.get("images", [])) if "bufferView" in img}

    new_bin, saved = bytearray(), 0
    for vi, view in enumerate(views):
        chunk = blob[view.get("byteOffset", 0) : view.get("byteOffset", 0) + view["byteLength"]]
        if vi in image_view:
            img = Image.open(io.BytesIO(chunk))
            img.thumbnail((max_px, max_px), Image.LANCZOS)
            out = io.BytesIO()
            has_alpha = img.mode in ("RGBA", "LA") and img.getchannel("A").getextrema()[0] < 255
            if has_alpha:
                img.save(out, "PNG", optimize=True)
                gltf["images"][image_view[vi]]["mimeType"] = "image/png"
            else:
                img.convert("RGB").save(out, "JPEG", quality=86, optimize=True)
                gltf["images"][image_view[vi]]["mimeType"] = "image/jpeg"
            saved += len(chunk) - out.tell()
            chunk = out.getvalue()
        while len(new_bin) % 4:
            new_bin.append(0)
        view["byteOffset"] = len(new_bin)
        view["byteLength"] = len(chunk)
        new_bin += chunk
    while len(new_bin) % 4:
        new_bin.append(0)
    gltf["buffers"][0]["byteLength"] = len(new_bin)

    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_bin)
    with open(dst, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(new_bin), b"BIN\x00") + new_bin)
    print(f"{src}: {len(data)/1e6:.1f} MB -> {dst}: {total/1e6:.1f} MB (textures -{saved/1e6:.1f} MB)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
