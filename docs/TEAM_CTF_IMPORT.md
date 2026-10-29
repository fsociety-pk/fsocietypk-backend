# Import the supplied CTF images

The reviewed manifest is `data/team-ctf-import.json`. It contains nine entries
from the owner's `fscoiety-ctfs` folder (that is the folder's actual spelling).
Only image-visible results are included. Seven files are scoreboard/team
screenshots; BrunnerCTF and Kali Team are participation certificates.

The Ramadan file is named `ramadan-ctf-2025.webp`, but the image identifies the
event as Ramadan CTF 2026. That visible year is used. Hack4Bug's cropped scoreboard
does not show Fsociety's row, so its entry claims no placement or score.
boroCTF, SecLeaf and Hack4Bug have no visible date and remain undated. BrunnerCTF
has a month/year; UMassCTF, Ramadan CTF and picoCTF have a year only. The backend
and frontend must include the partial-date update before importing.

On the configured backend, build and review the batch:

```sh
npm run build
node scripts/import-team-ctfs.cjs --source /path/to/fscoiety-ctfs
```

The default is a dry run. It checks every image's signature, size and metadata
without contacting MongoDB or R2. To publish the reviewed batch:

```sh
node scripts/import-team-ctfs.cjs --source /path/to/fscoiety-ctfs --publish
```

Run this using the backend's existing environment. Do not put credentials in the
manifest, command arguments or repository. The script reuses the existing upload
controller, including its validation, private R2 namespace and failure cleanup.
Image bytes go to R2; MongoDB receives only metadata and storage keys. Each
newly stored image is downloaded with a signed URL and checked against its local
SHA-256 before the importer proceeds. Source images are never modified or deleted.
Existing original filenames are skipped, preserving any admin changes or drafts.
If a later file fails, earlier completed uploads remain; rerunning skips them.

After import, visit `https://about.fsocietypk.tech/#ctfs`. All nine published
entries should appear in the 3D book shelf; use the picker, arrows, keyboard or
drag to browse. Selecting a cover opens the original image through the paper
and ink reveal. Edit, replace, unpublish or remove entries at `/admin/team`.

The local preview was checked with all nine original images and intercepted
API/file responses. That does not upload files to R2. Publishing requires a
configured backend environment or working admin/server access.
