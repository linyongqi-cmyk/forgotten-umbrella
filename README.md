# Forgotten Umbrella

An art-map website and installable PWA documenting forgotten umbrellas in public space.

## Local preview

Requires [Node.js](https://nodejs.org/) 20 or newer (see `.nvmrc`). There are no third-party dependencies, so `npm install` is not needed.

The project must run through its local server. Opening `index.html` with a `file://` URL will not load the map or archive data correctly.

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:4173/
```

## Project structure

- `filebox/records/`: the canonical editable source, one folder per record with its own `record.json`.
- `data/umbrellas.json`: the generated website/app database.
- `filebox/choice/`: the legacy pre-migration image source. Kept locally for reference but git-ignored (it is ~400MB of duplicates) and never deployed.
- `filebox/thumbs/`: web thumbnails referenced by the database.
- `filebox/welcome-pic/2.png`: welcome-screen image.
- `config.js`: the browser-restricted Google Maps JavaScript API key.

## Record workflow

Records now live as one folder per entry under `filebox/records/`; `data/umbrellas.json` is generated from them. The typical editing loop:

1. Seed the new source folders from the current aggregate:

```powershell
npm run records:seed
```

2. Rebuild the website/app aggregate after editing any `record.json`:

```powershell
npm run records:build
```

3. If you want to rewrite all `record.json` files into the standard hand-editing format with Chinese notes:

```powershell
npm run records:format
```

4. If you add, remove, or rename image files inside a record folder, sync the `media` list before rebuilding:

```powershell
npm run records:sync-media
```

Each record folder lives at:

```text
filebox/records/<category>(<group>)/<record-id>/
```

and contains:

```text
record.json
<primary image>
```

`record.json` is now the canonical editable source. `data/umbrellas.json` should be treated as generated output.

These `record.json` files now support inline Chinese comments for manual editing. The build script strips comments before parsing, so you can keep the notes in place.
Additional image files placed inside a record folder can be synced into the `media` array automatically.

## Data model

Photo EXIF values provide the map position and capture time. Displayed place names are manually curated and never translated at runtime.

Important fields:

- `id`: stable record ID, normally the primary photo filename.
- `image` and `thumb`: original and thumbnail paths.
- `photoCoordinates`: coordinates read from photo EXIF.
- `locationCoordinates`: optional manual coordinate override.
- `photoTime`: capture time read from photo EXIF.
- `time`: optional manual capture-time override.
- `locationText`: manually written display address.
- `locationLevels`: up to three manually written levels used for place sorting.
- `category` and `categoryGroup`: values derived from the photo folder.
- `title`, `umbrellaType`, `umbrellaColor`, `umbrellaStatus`, and `story`: optional editorial fields.

Empty optional fields are not rendered.

## Publishing

The site is published through GitHub Pages. Local changes only appear online after they are committed and pushed to GitHub.
