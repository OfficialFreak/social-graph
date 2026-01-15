import argparse
import json
import mimetypes
import os

import requests
from tqdm import tqdm

EXPORT_FOLDER = "export"
IMAGE_FOLDER = "images"

parser = argparse.ArgumentParser(
    prog="WhatsApp Profile Pic Downloader",
    description="Downloads profile pictures from your given contacts.json",
)
parser.add_argument("-r", "--renew", action="store_true")
args = parser.parse_args()


def remove_file_ending(filename):
    return ".".join(filename.split(".")[:-1])


downloaded_ids = set(
    [
        remove_file_ending(f)
        for f in os.listdir(IMAGE_FOLDER)
        if os.path.isfile(os.path.join(IMAGE_FOLDER, f))
    ]
)

if not os.path.exists(IMAGE_FOLDER):
    os.makedirs(IMAGE_FOLDER)

with open(os.path.join(EXPORT_FOLDER, "contacts.json"), encoding="utf-8") as f:
    contacts = json.load(f)

    if not args.renew:
        contacts = {k: v for k, v in contacts.items() if k not in downloaded_ids}

    for contact, metadata in tqdm(contacts.items()):
        if x := metadata.get("profilePicUrl"):
            r = requests.get(x)
            content_type = r.headers.get("content-type") or ""
            extension = mimetypes.guess_extension(content_type)
            if not extension:
                extension = ".jpg"
            with open(
                os.path.join(IMAGE_FOLDER, f"{contact}{extension}"), "wb"
            ) as image_file:
                image_file.write(r.content)
