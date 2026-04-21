#!/usr/bin/env python3
"""Generate simple SVG-based PNG icons for the PWA"""
import os

sizes = [72, 96, 128, 144, 152, 192, 384, 512]
os.makedirs('icons', exist_ok=True)

try:
    from PIL import Image, ImageDraw, ImageFont
    
    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Background rounded rect
        r = size // 5
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=(26, 26, 46, 255))
        
        # Accent gradient simulation — inner rect
        draw.rounded_rectangle([size//8, size//8, size*7//8, size*7//8], 
                                 radius=r//2, fill=(124, 92, 191, 180))
        
        # Text "র"
        font_size = size // 2
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
        
        text = "R"
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        x = (size - tw) // 2
        y = (size - th) // 2
        draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
        
        img.save(f'icons/icon-{size}.png')
        print(f'Created icon-{size}.png')

except ImportError:
    # Fallback: create minimal valid PNG using struct
    import struct, zlib
    
    def create_simple_png(size, filename):
        def png_chunk(chunk_type, data):
            c = chunk_type + data
            return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        
        # Simple solid color PNG
        width = height = size
        # IHDR
        ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
        # Image data — dark purple background
        raw = b''
        for y in range(height):
            raw += b'\x00'  # filter type
            for x in range(width):
                # Simple gradient-ish purple
                r_val = min(255, 26 + int(x/width * 100))
                g_val = 26
                b_val = min(255, 46 + int((1-y/height) * 100))
                raw += bytes([r_val, g_val, b_val])
        
        compressed = zlib.compress(raw)
        
        png_data = (
            b'\x89PNG\r\n\x1a\n' +
            png_chunk(b'IHDR', ihdr) +
            png_chunk(b'IDAT', compressed) +
            png_chunk(b'IEND', b'')
        )
        
        with open(filename, 'wb') as f:
            f.write(png_data)
        print(f'Created {filename}')
    
    for size in sizes:
        create_simple_png(size, f'icons/icon-{size}.png')

print("All icons created!")
