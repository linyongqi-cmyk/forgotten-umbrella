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

## Local editor

When the site is opened on `127.0.0.1` (your own machine) it shows a local-only admin editor (top-right "编辑模式"); it is never rendered on the published site. It edits records visually — fields, cascading Japan address dropdowns, per-umbrella attributes, images, content layout, categories, drag-to-set coordinates — and saves straight back to `record.json` via the local server, auto-rebuilding `data/umbrellas.json`. See `CLAUDE.md` for the full architecture.

## Data model

Photo EXIF values provide the map position and capture time. Displayed place names are manually curated and never translated at runtime. **`CLAUDE.md` holds the authoritative, up-to-date field reference** — the highlights:

- `id`, `media[]` (each `{id, file, role, title, photoTime, story}`; role ∈ primary/supplement/detail/illustration).
- `photoCoordinates` / `locationCoordinates`, `photoTime` / `time`.
- `locationText` + `locationLevels` (romaji, from the cascading address dropdowns; `data/japan-areas.json`).
- `umbrellaCount` and `umbrellaUnits[]` — one object per umbrella `{color, colorDetail, kind, status[], statusOther}` (built for future statistics).
- `blocks[]` — the detail-page content order (text paragraphs interleaved with photos); `story` is derived from it.
- `editFlag` — edit-only marker colour. `category`/`categoryGroup` — from the folder name.

Empty optional fields are not rendered.

## Publishing

The site is published through GitHub Pages. Local changes only appear online after they are committed and pushed to GitHub.
