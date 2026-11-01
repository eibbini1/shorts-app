# Abdul Across America — Episode Library

Each `.json` file here is one episode. The `createAbdulEpisode` CLI reads it and generates a complete rendered Short.

## Episode structure

```jsonc
{
  "title": "Chicago Ep1 — Sharing is Caring",
  "location": "Chicago, Illinois",   // injected into every image prompt
  "episode": "Chicago Ep1",           // label in Style Bible LOCATION line
  "lesson": "...",                    // the one core value for this episode
  "narration": "...",                 // full spoken text (70s target)
  "beats": [                          // visual storyboard, one entry per scene
    {
      "index": 0,                     // matches the beat index from buildBeats()
      "objective": "...",             // one filmable sentence: what the camera sees
      "mustShow": ["...", "..."],     // 1-3 things MUST be visible
      "avoid": ["...", "..."],        // 1-3 things to exclude
      "mood": "wonder",              // optional: wonder|joy|curious|awe|cozy|excited
      "continuity": ""               // optional: what happened in the PREVIOUS scene
    }
  ]
}
```

## Episodes

| File | Title | Status |
|---|---|---|
| `chicago-ep1.json` | Chicago Ep1 — Sharing is Caring | ✅ Ready |

## Adding a new episode

1. Copy `chicago-ep1.json` → `[city]-ep[N].json`
2. Write the narration (aim for 70s when read aloud at a natural pace)
3. Fill in 6 beats covering the 6-beat structure:
   - Beat 0: Cold Open — arrival, hook moment (5s)
   - Beat 1: Discovery — Abdul notices something (20s)
   - Beat 2: Learning Moment — connection / problem / help (20s)
   - Beat 3: Lesson Beat — the value in action (10s)
   - Beat 4: Play — fun together (10s)
   - Beat 5: Farewell — goodbye + warm feeling (5s)
4. Run: `npm run create-abdul -- --episode episodes/[city]-ep[N].json`

## Season 1 Roadmap

| # | City | Lesson | Status |
|---|---|---|---|
| 1 | Chicago, IL | Sharing is Caring | ✅ Ready |
| 2 | New York, NY | Bravery — trying new things | 🔜 Next |
| 3 | New Orleans, LA | Music connects us | 📋 Planned |
| 4 | Los Angeles, CA | Everyone has a gift | 📋 Planned |
| 5 | Austin, TX | Kindness costs nothing | 📋 Planned |
| 6 | Seattle, WA | Nature is worth protecting | 📋 Planned |
| 7 | Miami, FL | Different languages, same heart | 📋 Planned |
| 8 | Denver, CO | Perseverance — keep going | 📋 Planned |
