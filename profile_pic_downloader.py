import json
import mimetypes
import os

import requests
from tqdm import tqdm

EXPORT_FOLDER = "export"
IMAGE_FOLDER = "images"

if not os.path.exists(IMAGE_FOLDER):
    os.makedirs(IMAGE_FOLDER)

with open(os.path.join(EXPORT_FOLDER, "contacts.json"), encoding="utf-8") as f:
    contacts = json.load(f)

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
