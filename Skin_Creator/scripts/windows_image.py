"""Windows GDI+ image backend for the additive Python route; no extra packages."""
from collections import Counter
import ctypes as C
from ctypes import wintypes as W
import math
import os
from pathlib import Path
import tempfile
import uuid


class ImageError(RuntimeError):
    pass


class Startup(C.Structure):
    _fields_ = [('version', C.c_uint), ('callback', C.c_void_p), ('suppress_thread', W.BOOL), ('suppress_codecs', W.BOOL)]


class Property(C.Structure):
    _fields_ = [('id', C.c_uint), ('length', W.ULONG), ('type', C.c_ushort), ('value', C.c_void_p)]


class GDI:
    def __init__(self):
        if os.name != 'nt':
            raise ImageError('Windows image decoding is required')
        self.dll = C.WinDLL('gdiplus', winmode=0x800)
        self.token, self.images, self.graphics = C.c_size_t(), [], []
        p, i, f = C.c_void_p, C.c_int, C.c_float
        signatures = {
            'GdiplusStartup': [C.POINTER(C.c_size_t), C.POINTER(Startup), p],
            'GdipLoadImageFromFile': [W.LPCWSTR, C.POINTER(p)],
            'GdipGetImageWidth': [p, C.POINTER(C.c_uint)], 'GdipGetImageHeight': [p, C.POINTER(C.c_uint)],
            'GdipGetPropertyItemSize': [p, C.c_uint, C.POINTER(C.c_uint)],
            'GdipGetPropertyItem': [p, C.c_uint, C.c_uint, p],
            'GdipImageRotateFlip': [p, i], 'GdipDisposeImage': [p],
            'GdipCreateBitmapFromScan0': [i, i, i, i, p, C.POINTER(p)],
            'GdipGetImageGraphicsContext': [p, C.POINTER(p)], 'GdipDeleteGraphics': [p],
            'GdipSetCompositingMode': [p, i], 'GdipSetInterpolationMode': [p, i], 'GdipSetPixelOffsetMode': [p, i],
            'GdipDrawImageRectRect': [p, p] + [f] * 8 + [i, p, p, p],
            'GdipBitmapGetPixel': [p, i, i, C.POINTER(C.c_uint)],
            'GdipSaveImageToFile': [p, W.LPCWSTR, p, p],
        }
        for name, arguments in signatures.items():
            function = getattr(self.dll, name)
            function.argtypes, function.restype = arguments, C.c_int
        self.dll.GdiplusShutdown.argtypes = [C.c_size_t]
        self.dll.GdiplusShutdown.restype = None
        self.call('GdiplusStartup', C.byref(self.token), C.byref(Startup(1, None, False, False)), None)

    def call(self, name, *args):
        result = getattr(self.dll, name)(*args)
        if result:
            raise ImageError(f'Windows image operation failed ({name}: {result}); provide a valid PNG/JPEG or an installed compatible decoder')

    def close(self):
        for item in reversed(self.graphics):
            self.dll.GdipDeleteGraphics(item)
        for item in reversed(self.images):
            self.dll.GdipDisposeImage(item)
        self.dll.GdiplusShutdown(self.token)

    def load(self, filename):
        image = C.c_void_p()
        self.call('GdipLoadImageFromFile', str(filename), C.byref(image))
        self.images.append(image)
        width, height = self.size(image)
        if width * height > 64_000_000:
            raise ImageError('Decoded image exceeds 64 million pixels')
        length = C.c_uint()
        result = self.dll.GdipGetPropertyItemSize(image, 274, C.byref(length))
        if result == 0:
            if not C.sizeof(Property) <= length.value <= 65536:
                raise ImageError('Invalid image orientation metadata')
            buffer = C.create_string_buffer(length.value)
            self.call('GdipGetPropertyItem', image, 274, length.value, buffer)
            item = Property.from_buffer(buffer)
            if item.type != 3 or item.length < 2 or not item.value or not C.addressof(buffer) <= item.value <= C.addressof(buffer) + len(buffer) - 2:
                raise ImageError('Invalid image orientation value')
            orientation = C.cast(item.value, C.POINTER(C.c_ushort)).contents.value
            modes = {2: 4, 3: 2, 4: 6, 5: 5, 6: 1, 7: 7, 8: 3}
            if orientation in modes:
                self.call('GdipImageRotateFlip', image, modes[orientation])
        elif result not in (19, 20):
            raise ImageError('Image orientation metadata could not be inspected')
        return image

    def size(self, image):
        width, height = C.c_uint(), C.c_uint()
        self.call('GdipGetImageWidth', image, C.byref(width))
        self.call('GdipGetImageHeight', image, C.byref(height))
        if not width.value or not height.value:
            raise ImageError('Image has no pixels')
        return width.value, height.value

    def render(self, source, size, crop):
        bitmap, graphics = C.c_void_p(), C.c_void_p()
        self.call('GdipCreateBitmapFromScan0', size[0], size[1], 0, 0x26200A, None, C.byref(bitmap))
        self.images.append(bitmap)
        self.call('GdipGetImageGraphicsContext', bitmap, C.byref(graphics))
        self.graphics.append(graphics)
        self.call('GdipSetCompositingMode', graphics, 1)
        self.call('GdipSetInterpolationMode', graphics, 7)
        self.call('GdipSetPixelOffsetMode', graphics, 2)
        self.call('GdipDrawImageRectRect', graphics, source, 0, 0, size[0], size[1], *crop, 2, None, None, None)
        return bitmap

    def palette(self, source, width, height):
        bitmap = self.render(source, (96, 96), (0, 0, width, height))
        counts, pixel = Counter(), C.c_uint()
        for y in range(96):
            for x in range(96):
                self.call('GdipBitmapGetPixel', bitmap, x, y, C.byref(pixel))
                if pixel.value >> 24 < 128:
                    continue
                colors = [((pixel.value >> shift) & 255) // 16 * 16 + 8 for shift in (16, 8, 0)]
                counts['#' + ''.join(f'{c:02X}' for c in colors)] += 1
        return [color for color, _ in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:5]]

    def save_png(self, bitmap, output):
        output = Path(output).absolute()
        if output.exists() or output.is_symlink():
            raise ImageError('Output already exists; it will not be overwritten')
        for parent in output.parents:
            if parent.exists() and (parent.is_symlink() or getattr(parent.lstat(), 'st_file_attributes', 0) & 0x400):
                raise ImageError('Output must not use a reparse point')
        if not output.parent.is_dir():
            raise ImageError('Output directory does not exist')
        encoder = (C.c_ubyte * 16).from_buffer_copy(uuid.UUID('557cf406-1a04-11d3-9a73-0000f81ef32e').bytes_le)
        with tempfile.TemporaryDirectory(prefix='image-codec-', dir=output.parent) as temporary:
            candidate = Path(temporary) / 'image.png'
            self.call('GdipSaveImageToFile', bitmap, str(candidate), C.byref(encoder), None)
            data = candidate.read_bytes()
            if len(data) > 20 * 1024 * 1024:
                raise ImageError('Processed image exceeds 20 MiB')
            with output.open('xb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())


def process_image(spec):
    if not isinstance(spec, dict) or set(spec) - {'input', 'output', 'target', 'crop'}:
        raise ImageError('Invalid image request')
    source = Path(spec['input']).resolve(strict=True)
    if source.stat().st_size > 20 * 1024 * 1024:
        raise ImageError('Source image exceeds 20 MiB')
    gdi = GDI()
    try:
        image = gdi.load(source)
        width, height = gdi.size(image)
        colors = gdi.palette(image, width, height)
        if spec.get('output'):
            target, crop = spec.get('target'), spec.get('crop')
            if not isinstance(target, list) or len(target) != 2 or any(type(v) is not int or v <= 0 for v in target) or target[0] * target[1] > 64_000_000:
                raise ImageError('Invalid target size')
            if not isinstance(crop, list) or len(crop) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in crop):
                raise ImageError('Invalid crop rectangle')
            x, y, w, h = crop
            if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width + .001 or y + h > height + .001 or target[0] > w + .001 or target[1] > h + .001:
                raise ImageError('Crop escapes the image or requests enlargement')
            if not math.isclose(target[0] / w, target[1] / h, rel_tol=1e-8, abs_tol=1e-10):
                raise ImageError('Crop and target must preserve aspect ratio')
            bitmap = gdi.render(image, target, crop)
            gdi.save_png(bitmap, spec['output'])
        return {'width': width, 'height': height, 'colors': colors, 'orientationApplied': True}
    finally:
        gdi.close()
