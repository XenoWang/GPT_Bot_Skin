import argparse
import json
from pathlib import Path
import sys
from windows_image import ImageError, process_image


def main():
    parser = argparse.ArgumentParser(description='Python image backend, no PowerShell')
    parser.add_argument('--spec', required=True)
    args = parser.parse_args()
    data = Path(args.spec).read_bytes()
    if len(data) > 32768:
        raise ImageError('Image request is too large')
    print(json.dumps(process_image(json.loads(data.decode('utf-8-sig'))), ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ImageError, OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
