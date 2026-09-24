"""Genera fotos JPEG de prueba para los tests e2e de subida.

Cada foto es distinta (el backend descarta duplicados por hash) y tiene la
resolución de una cámara real (12 MP), que es lo que pesa al decodificarla en
el navegador. Uso:

    python3 e2e/stack/generate-photos.py 1200 /tmp/fotos-e2e
"""

import os
import sys
from concurrent.futures import ProcessPoolExecutor

from PIL import Image, ImageDraw

WIDTH, HEIGHT = 4000, 3000


def make(args):
    index, out_dir = args
    image = Image.linear_gradient("L").resize((WIDTH, HEIGHT)).convert("RGB")
    draw = ImageDraw.Draw(image)
    x, y = (index * 37) % 3500, (index * 53) % 2500
    color = ((index * 7) % 255, (index * 13) % 255, (index * 29) % 255)
    draw.rectangle([x, y, x + 500, y + 500], fill=color)
    draw.text((100, 100), f"foto {index:04d}", fill=(255, 255, 255))
    image.save(os.path.join(out_dir, f"IMG_{index:04d}.jpg"), quality=85)


if __name__ == "__main__":
    count = int(sys.argv[1])
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    with ProcessPoolExecutor(4) as pool:
        list(pool.map(make, [(i, out_dir) for i in range(count)]))
    print(f"{count} fotos en {out_dir}")
