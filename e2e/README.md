# song journey E2E tests

The suite runs the real web app in Chrome. It replaces only the API and YouTube
iframe boundaries. Tests do not use a YouTube API key, spend quota, or play
third-party media.

Run the checked-in, non-private sample corpus:

```bash
npm run test:e2e:songs
```

Each case verifies this path:

1. The default soundspace stops forming.
2. Search returns a playable result.
3. Selection shows clean title and artist metadata.
4. The selected song has a pregame weather state.
5. The orb enters one live weather scene.
6. The page keeps one player shell and one player host.

Set `SOUNDSPACE_E2E_CAPTURE=1` to attach one inside-state screenshot per song.
Playwright always keeps screenshots, video, and traces for failures.

## private Spotify corpus

The importer accepts an official Spotify `YourLibrary.json` file or an
Exportify CSV. It removes account, playlist, Spotify URI, and listening-history
fields. The default generated file is ignored by git.

```bash
npm run corpus:spotify -- C:\path\to\YourLibrary.json
$env:SOUNDSPACE_SONG_CORPUS="e2e/fixtures/song-corpus.local.json"
npm run test:e2e:songs
```

For Exportify, pass the CSV path to the same command. Pass a second path when
you need a different output file. Keep private output outside version control.

The corpus format is documented by
[`fixtures/song-corpus.schema.json`](fixtures/song-corpus.schema.json). The
checked-in sample contains synthetic IDs and no personal library data.
