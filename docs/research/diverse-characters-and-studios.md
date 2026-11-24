# Describe people by features, not flags

A worldwide cast for a FLUX.2 klein → LTX 2.3 pipeline has to be planned explicitly. Without that plan the models pull every character toward the same defaults. Audits from 2023 to 2025 found that a bare "person" comes out as a light-skinned Western man, and a nationality label turns into one costume or prop: a sombrero for "Mexican", an old turbaned man for "Indian", a flag on every "American". Poverty backdrops attach to the Global South. FLUX.1 itself was measured producing overwhelmingly White people. No study of FLUX.2 exists yet, so assume those defaults until local tests show otherwise. The approach that holds up has four parts. **First, describe each fictional adult by concrete visible traits**: plain-word skin tone, hair texture and style, age, build, one distinctive feature, and named contemporary garments. Keep Monk Skin Tone (MST) as metadata, not prompt text. **Second, use the city as setting context**, never as the identity. **Third, balance the catalogue as a grid** (region × gender × age × MST × role) rather than relying on "diverse" phrasing, which research shows works unreliably. **Fourth, review every render by eye**, because CLIP-type metrics miss cultural errors. Locations ("studios") follow the same logic. Lead with a place-specific architectural noun, name two or three materials, give one light source with direction and time of day, keep occupancy low, hold props to three or fewer, and keep signage illegible. Continuity comes from a reused text block plus a master-plate reference image, not from seeds. Realism in LTX comes from restraint: chest-up near-frontal framing, a locked or slow camera, one physical micro-action per 4–5 s clip, no lip-sync, and a single light logic stated identically in the still and video prompts. Photorealistic fictional people still need YouTube's "AI use = Yes" disclosure, which since May 2026 appears as an on-video overlay on Shorts, plus a light first-exposure AI tag for the EU. The draft schemas and the 15 characters and 15 studios below are drafting material: every visual claim in them still has to pass local A/B renders before the catalogue goes live.

Legend used throughout: **[S]** = sourced in the research notes (citation given), **[I]** = inferred, or the researchers' unverified domain knowledge. Everything marked [I] needs local verification.

## Models default to light-skinned Western men and one costume per country

The bias evidence is consistent across model generations, and the failure modes stack on top of each other. Rest of World generated about 3,000 Midjourney images. **99/100 "Indian person" images were men, nearly all over 60, and 92 wore a pagri.** Muslims, about 14% of India's population, were absent. **99/100 "Mexican person" images had a sombrero or similar hat**, and **all 100 "American person" images included a US flag**. For China, India, Indonesia and Mexico, the median "woman" was at least two Fitzpatrick levels lighter than the median "person" ([Rest of World](https://restofworld.org/2023/ai-image-stereotypes/)) [S]. Bianchi et al. showed that stereotypes appear even without identity terms: "an attractive person" approached a White beauty ideal, and kitchens and doors defaulted to North American versions. They also found that **counter-stereotype prompting mostly fails**. "A wealthy African man and his house" kept the same worn house and put the man in a Western suit ([arXiv 2211.03759](https://arxiv.org/abs/2211.03759)) [S]. Ghosh & Caliskan measured "person" as closest to Europe (0.71) and farthest from Africa (0.41). "Person from Oceania" matched Australians and New Zealanders but scored only 0.31 for Papua New Guineans. Latin American women drew the highest NSFW "sexy" scores, averaging 0.63 ([arXiv 2310.19981](https://arxiv.org/abs/2310.19981)) [S]. Meta's DIG In found that naming a broad region lowered realism and diversity, while **naming a country raised diversity at little cost** ([arXiv 2308.06198](https://arxiv.org/html/2308.06198v3)) [S].

The published FLUX data is thinner, and it points the same way. A 2025 preprint reports "Flux-1" outputs at 98–100% White for attribute prompts. That paper has internal inconsistencies, so treat the numbers as directional only ([arXiv 2506.13780](https://arxiv.org/html/2506.13780v1)) [S]. A CMU-led study that includes FLUX.1 schnell and Kontext found that models "default to Global-North, modern-leaning depictions". Non-US houses and rituals were rendered as traditional while US ones were rendered as modern, and edits added "culture" through palette shifts and flags while subjects kept their original skin tone. Local-script text came out as gibberish, and **CLIPScore hid degradation that human experts caught** ([arXiv 2510.20042](https://arxiv.org/html/2510.20042v1)) [S]. The FLUX.2 klein 4B model card offers only a generic disclaimer that the model "may represent or amplify biases". It puts mitigation on deployers and notes that prompt following depends heavily on prompting style ([HF model card](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)) [S]. Its example runs at `guidance_scale=1.0` with 4 steps. That implies **negative prompts are likely inert on distilled klein** [I]. Separately, BFL states plainly that FLUX.2 does not support negative prompts ([BFL FLUX.2 guide](https://docs.bfl.ai/guides/prompting_guide_flux2)) [S]. All mitigation therefore has to live in positive wording, catalogue planning and review.

Over-correction is the opposite failure. In February 2024 Google paused Gemini's image generation of people. Its stated rule since then is that generic prompts should show variety, while prompts that name a specific person, culture or history "should absolutely" be depicted accurately ([Google blog](https://blog.google/products/gemini/gemini-image-generation-issue/?stream=top)) [S]. A fixed catalogue fits that rule well. Every character is fully specified, so nothing gets injected at random and nothing a prompt specifies gets overridden [I].

## Concrete traits beat labels, and MST belongs in metadata

The practical rule is to **write what a camera would see**. That means skin tone in plain words ("deep brown skin with cool undertones", "light olive skin", "fair skin with freckles"), hair texture and style ("tightly coiled black hair in a short afro", "straight black hair in a low bun", "grey locs tied back"), an exact age, build, one distinctive feature, and named garments. "A Nigerian woman" is a label, not a description [I, derived from the failures of label prompts documented in [Bianchi et al.](https://arxiv.org/abs/2211.03759) and [Rest of World](https://restofworld.org/2023/ai-image-stereotypes/)]. Nationality or city should appear as setting context paired with modern specifics. Write "a QA lead on a Lagos veranda, in a fitted white shirt", not "a Nigerian person" [I]. This is consistent with DIG In's finding that specific places beat vague regions ([arXiv 2308.06198](https://arxiv.org/html/2308.06198v3)) [S]. Some interventions can shift outputs. Ethical-intervention phrasing such as "irrespective of gender" diversified some models in a preliminary 2022 result ([arXiv 2210.15230](https://arxiv.org/abs/2210.15230)) [S]. But "from diverse cultures" helped only some prompts ([arXiv 2211.03759](https://arxiv.org/abs/2211.03759)) [S]. Neither is a substitute for explicit attributes.

The **Monk Skin Tone scale** is the right audit vocabulary. It is a 10-shade scale by sociologist Ellis Monk, released openly by Google, built partly to improve on the 6-type Fitzpatrick scale, and preferred by less-represented respondents in Google's survey ([Google blog](https://blog.google/technology/research/ai-monk-scale-skin-tone-story/)) [S]. Nothing suggests the text encoder understands "MST 7", so keep the number in metadata for balancing and post-render auditing, and **translate it into words in the prompt** [I]. The mapping below is a starting point that local renders must calibrate. Rendered skin also shifts with the light (golden hour warms, overcast cools), so audit each character under its studio's dominant light, not only in a neutral sheet [I].

| MST (metadata) | Draft prompt wording [I, needs A/B] |
|---|---|
| 1–2 | very fair / fair skin, pink or neutral undertones (add freckles, rosacea as individual features) |
| 3 | light skin, warm or neutral undertones |
| 4 | light olive / light golden skin |
| 5 | medium warm-tan skin |
| 6 | medium golden-brown skin |
| 7 | medium-brown skin, warm undertones |
| 8 | brown skin, deep warm undertones |
| 9 | deep brown skin |
| 10 | very deep brown skin, cool or neutral undertones |

Balance belongs at the catalogue level. Plan a grid of region × gender × age band × MST bucket × role. Rotate high-status roles (engineer, doctor, manager, architect) across all regions and genders, so that **no region is tied to one occupation, income level or costume** [I, from the occupational skews documented in [arXiv 2211.03759](https://arxiv.org/abs/2211.03759) and [arXiv 2510.20042](https://arxiv.org/html/2510.20042v1)]. Variation also has to run *within* each region. North Africans range from fair to deep brown. Latin America includes Indigenous, mestizo, Afro-Latino, white and Asian-Latino people. Southern Africa includes Black, Coloured, Indian and white South Africans [I, researcher knowledge]. Getty's inclusive-imagery guidance adds three concrete gaps worth targeting. **80% of people over 50 say marketers stereotype them.** **Under 1% of ads include people with disabilities, although about 1 in 4 adults have one.** Larger bodies should be shown as joyful and multidimensional, not only exercising ([Getty](https://custom.gettyimages.com/dei-search-guide/p/1)) [S]. To counter the documented "old man / young woman" skew, give every character an explicit age, include older women and younger men, and specify modest, non-sexualized framing for every gender. The sexualization skew against Latin American and Indian women is measured ([arXiv 2310.19981](https://arxiv.org/abs/2310.19981)) [S]. Never write an unqualified "people" in a background, because it drifts toward the default man. Name every background figure, or keep them out of frame [I].

## Global casual first, then one accurate regional marker

In cities almost everywhere, everyday adult clothing is global casual and business-casual: jeans, chinos, T-shirts, button-downs, knitwear, sneakers and office separates. Regional identity appears in **specific, situational layers** [I, synthesis], and several of those layers are documented. In Nigeria, Monday-to-Thursday office wear is formal. Many workplaces and institutions observe **Friday as native-wear day** (Ankara prints, aso-oke trims, Senator suits). Agbada, iro-and-buba with gele, and aso-ebi are ceremonial ([Guardian Nigeria](https://guardian.ng/?p=2846143)) [S]. Men in northern Nigeria commonly wear kaftans and babban riga daily ([Guardian Nigeria](https://guardian.ng/?p=2846143)) [S]. Kitenge is an inexpensive, informal East African fabric used for dresses, shirts, wraps and, among urban youth, hoodies and bags ([Wikipedia: Kitenge](https://en.wikipedia.org/wiki/Kitenge)) [S]. The sari is prevalent everyday wear in southern India and the salwar kameez in the north, and middle-class women increasingly wear Western clothes to work ([Quartz](https://qz.com/india/331756/memo-to-the-world-not-every-indian-outfit-is-a-sari)) [S]. Gulf men wear the thobe or kandura, with collar styles that differ by country. Abayas have moved from uniformly black to coloured and embroidered versions ([The National](https://www.thenationalnews.com/arts/saudi-women-are-giving-the-abaya-a-colourful-makeover-1.113418), dated 2015) [S]. Saudi Arabia's crown prince said in 2018 that decency rules do not "specify a black abaya" ([Gulf News](https://gulfnews.com/amp/story/world%2Fgulf%2Fsaudi%2Fsaudi-crown-prince-says-abaya-not-necessary-1.2190993)) [S]. In La Paz and El Alto, the pollera, shawl and bowler hat are a living everyday identity, not a costume ([Wikipedia: Pollera women](https://en.wikipedia.org/wiki/Pollera_women)) [S]. Most Aboriginal Australians live in urban areas. Imagery that shows them painted and in the outback is a cliché that critics reject ([Creative Spirits](https://www.creativespirits.info/aboriginalculture/media/how-to-write-about-aboriginal-culture)) [S].

The researchers' remaining regional defaults are unsourced, plausible starting points [I]. Examples: batik shirts as office-standard in Indonesia and Malaysia, the shalwar kameez as Pakistan's norm for both sexes, the djellaba as an everyday overgarment in Morocco, the lavalava or sulu as office wear in Samoa and Fiji, the mate gourd as a real everyday prop in Argentina and Uruguay, and hanbok, kimono and qipao as holiday wear, *not* daily dress. The same goes for the per-region avoid-lists: no default head ties or mud huts for West Africa; no desert, camels or universal niqab for the Arab world; no rickshaw-poverty or turban-on-everyone for South Asia; no cherry blossoms, lanterns or geisha for East Asia; no grass skirts or decorative moko for the Pacific; no flags, cowboy hats or feather headdresses for North America. Store these as **review checklists, not prompt text**. FLUX.2 has no negative prompts, and naming a cliché risks priming it [I].

Religious dress follows five rules. Getty's guidance to **"show people of faith outside of a religious context"** anchors the first. The others are synthesis [I]. Name the garment correctly ("hijab", "dastar", "kippah", "tichel", "abaya"). Put it in ordinary scenes, such as a laptop at a café or scrubs with a hijab. Vary it within a community, so that one city's cast has both hijabi and non-hijabi women. Never use a religious marker as a nationality signal. The documented failure runs the other way too: **Nigerians were rarely shown in headscarves although about 50% are Muslim** ([Rest of World](https://restofworld.org/2023/ai-image-stereotypes/)) [S]. Keep sacred or earned items such as tā moko and Indigenous regalia off casual characters. Use everyday markers instead, like a pounamu pendant or beaded earrings [I]. Ordinary props anchor a character in the present: phone, earbuds, glasses, tote, lanyard, takeaway cup, motorbike helmet [I].

## Studios render consistently when written like a set designer's spec

The official prompting guides agree on structure. BFL recommends **Subject + Action + Style + Context**, with the most important words first because "FLUX.2 weights earlier words more heavily". It gives **30–80 words as usually ideal**, recommends describing what you want rather than what you don't, and suggests concrete camera, lens and film anchors ("85mm lens, f/2.8", "shot on Kodak Portra 400") for photorealism ([BFL FLUX.2 guide](https://docs.bfl.ai/guides/prompting_guide_flux2)) [S]. For recurring elements BFL says to repeat the detailed description identically ("Repeat these details in every panel prompt"). It also notes that **prompting in the content's native language can improve cultural accuracy for local markets and architecture** ([BFL FLUX.2 guide](https://docs.bfl.ai/guides/prompting_guide_flux2)) [S]. That justifies pairing local terms with English, as in "engawa (縁側)" or "chai tapri" [I]. LTX asks for "lighting, color palette, surface textures, and atmosphere" and **"one coherent light logic per shot. Mixed light sources confuse the result."** For image-to-video, LTX says to prompt motion only and "avoid describing the static elements already visible in the image" ([LTX guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide); [LTX-2.3 prompt guide](https://ltx.io/blog/ltx-2-3-prompt-guide)) [S]. This splits a studio entry into two parts: a full `set` block for the FLUX still, and a short `cameraMove` plus ambient-motion line for LTX [I].

The hard limits shape every studio. **LTX states that "Readable text is not currently reliable"** and recommends adding critical text in post ([LTX-2.3 guide](https://ltx.io/blog/ltx-2-3-prompt-guide)) [S]. Research traces text failure to the VAE bottleneck and to text encoders that cannot see individual characters ([arXiv 2503.13730](https://arxiv.org/html/2503.13730v1)) [S]. Mirrors fail because the models rely on poorly learned priors and because good mirror training data is scarce ([arXiv 2504.15397](https://arxiv.org/html/2504.15397v1)) [S]. Video models also show flickering textures ([arXiv 2503.15417](https://arxiv.org/html/2503.15417v1)) [S]. The design rules that follow are inferences [I]. Write signage as "faded, illegible hand-painted lettering" or frame it out, and burn real text in with FFmpeg. Keep surfaces matte (matte ceramic, brushed steel, frosted glass), and do not point mirrors or wet glossy floors at the camera. Render fine patterns (zellige, azulejo, talavera, cobogó, ikat) **large and close or soft and out of focus**, never small and sharp, with at most one patterned surface per frame. Hold background figures to 0–2, far back and defocused. State low occupancy through time of day ("just after opening") instead of "no people".

Continuity comes from a **master plate**, not a seed [I]. Generate the empty set in a wide shot once, store its canonical text block and image, and pass it as the background reference in klein's multi-reference editing. BFL documents explicit roles per reference image, such as "background from image 3" ([BFL FLUX.2 guide](https://docs.bfl.ai/guides/prompting_guide_flux2)) [S]. The MLX Swift port supports **up to 3 reference images on Klein 4B within 16 GB** ([flux-2-swift-mlx](https://github.com/VincentGourbin/flux-2-swift-mlx)) [S]. Its edit language should be explicitly preserving, following the Kontext guide: "keep the room, camera angle and framing identical" ([BFL Kontext guide](https://docs.bfl.ai/guides/prompting_guide_kontext_i2i)) [S]. A fixed seed reproduces a result only when the prompt and settings are identical, so use seeds to regenerate a known plate, not to hold a room steady across different prompts [I; no official statement found]. Antarctica's only realistic everyday location is a research-station interior [I], included below so the studio set spans all seven continents.

## Realism comes from small motion on a strong still

Identity is decided at the still. LTX image-to-video inherits it, and research confirms that "current video generation models struggle with identity preservation under large face poses". That paper discards clips whose average frame-to-frame ArcFace similarity is 0.6 or lower ([arXiv 2508.09476](https://arxiv.org/html/2508.09476v4)) [S]. The LTX guide asks for one flowing present-tense paragraph of 4–8 sentences, "a few clear characters", emotion "through physical cues, not abstract labels", camera movement described relative to the subject, and a single continuous take for image-to-video. It warns that "highly chaotic motion can introduce artifacts" ([LTX guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide)) [S]. The LTX-2 example negative prompt lists the known artifact classes: fused fingers, weird hands, motion smear, deformed. But distilled runs at guidance 1.0 ignore that prompt. LTX-2.3 defaults to 121 frames at 24 fps (about 5 s), and the frames tied to the conditioning image "tend to be static" ([Diffusers LTX-2 docs](https://huggingface.co/docs/diffusers/api/pipelines/ltx2)) [S].

That evidence implies a recipe for human clips [I]. Shoot chest-up or medium close-up, near-frontal or three-quarter, with head turns under about 30°. Use a static camera or a slow push-in. Give one micro-action per clip: a breath, a glance down and back, a small closed-mouth smile forming, a thumb along a mug rim. Hands should be still, partly out of frame, or doing one simple action. Avoid talking and lip-sync, and let captions and an ambient bed carry the story. Restate the light source and wardrobe identically in the still and video prompts. Trim 0.3–0.4 s from each clip head to hide the frozen opening. Add an automated ArcFace gate against the canonical still using the paper's 0.6 threshold. On the M1 16 GB, the verified stack is **Klein 4B at int4 or qint8** (2.1 or 3.9 GB transformer; "Klein 4B works with 16GB") ([flux-2-swift-mlx](https://github.com/VincentGourbin/flux-2-swift-mlx)) and ltx-2-mlx, which covers LTX-2.3 and 2.5 and needs a "16GB minimum (int4 without streaming)" or q8 with `--low-ram` ([ltx-2-mlx](https://github.com/dgrauet/ltx-2-mlx)) [S]. **Use 4B, not 9B, for a monetized channel.** 4B is Apache 2.0, while 9B is under the FLUX Non-Commercial License ([BFL klein blog](https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence)) [S]. Run FLUX and LTX sequentially, never resident at the same time [I].

Story structure fits the same constraints. Kenn Adams's **Story Spine** ("Once upon a time / Every day / But one day / Because of that / Until finally / And ever since then"), taught at Pixar, yields "condensed versions of a well-told story" ([NPR](https://www.npr.org/transcripts/nx-s1-5750619)) [S]. It compresses into four 4–5 s beats: want, obstacle, turn, feeling. Each beat is one micro-action clip in one studio, with only time of day or one prop changing [I]. That is the `storySeed` field in the character schema. No platform data was found on which micro-story structures retain best. That is an analytics question, not a research one.

## Disclosure, likeness and sensitivity rules

YouTube requires creators to disclose realistic AI content, including content that "generates a realistic scene that didn't occur". Disclosure "doesn't limit a video's audience or affect monetization eligibility", and content carrying C2PA metadata can be auto-labelled irreversibly ([YouTube Help](https://support.google.com/youtube/answer/14328491?hl=en)) [S]. **Since 27 May 2026, the label appears as an overlay on Shorts.** YouTube now auto-applies it when it detects undisclosed photorealistic AI, and manual disclosure is still required ([YouTube blog](https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators/?pubDate=20260527)) [S]. EU AI Act Article 50 applies from 2 August 2026 ([European Commission](https://digital-strategy.ec.europa.eu/policies/guidelines-transparency-ai-generated-content)) [S]. For fictional and creative works, deepfake disclosure is still owed at first exposure, but "in an appropriate manner that does not hamper the display or enjoyment of the work". End credits alone do not comply ([Orrick](https://www.orrick.com/en/Insights/2026/08/EU-AI-Act-Transparency-OBLIGATIONS-for-AI-Generated-Content-Article-50)) [S]. Whether a postponement of Article 50 was enacted could not be verified. A purely fictional face may fall outside the narrow "resembling existing persons" deepfake definition. Even so, **the safe default is YouTube "AI use = Yes" plus a small "AI-generated" tag in the first second**, and optionally C2PA metadata on exports [I, not legal advice].

The pipeline's hard gates are editorial policy, not sourced rules [I]. Never use real or celebrity names, "looks like X" or real photos without written consent. Spot-check every canonical still with a reverse-image or face-similarity search before reuse. Allow **adults only, with a prompt floor of "aged 25+" and a builder that rejects any lower age**, because "adult" alone can render youthful faces. Keep sacred practices out of punchlines, and keep festival dress for explicitly festive scenes. Show disabled and older characters as protagonists with agency, not as objects of pity or inspiration. Where possible, ask people from the depicted region to review clothing, food and setting details, following the community-centred approach in [Qadri et al.](https://arxiv.org/abs/2305.11844) [S]. YouTube's child-safety and likeness-complaint policies were not fetched. Read them before the policy is finalized.

## Draft catalogue structure and sample entries

Neither the `shorts-app` repository nor its preset files were inspected for this report. The field names below match the studio preset fields given in the request, but **the value types (string vs array) and the allowed `status` values are assumed** and must be checked against the existing code before merging. New fields are optional extensions, so existing presets stay valid [I].

### Character entry schema

```json
{
  "id": "chr-lagos-adaeze-34",
  "displayName": "Adaeze",
  "status": "draft | approved | retired",
  "fictional": true,
  "age": 34,
  "gender": "woman",
  "region": "West Africa",
  "country": "Nigeria",
  "city": "Lagos",
  "mst": 8,
  "skin": "brown skin with deep warm undertones",
  "face": "oval face, high cheekbones, small mole above left eyebrow",
  "hair": "shoulder-length black box braids gathered in a low ponytail",
  "facialHair": null,
  "build": "medium build, 1.68 m",
  "aids": ["thin gold-rim glasses"],
  "wardrobe": {
    "top": "fitted white cotton shirt, sleeves rolled",
    "bottom": "navy tailored trousers",
    "shoes": "tan leather loafers",
    "accessory": "slim black smartwatch",
    "colorAnchor": "white shirt, navy trousers"
  },
  "regionalMarker": { "item": "ankara-print midi dress (Friday variant only)", "rationale": "Friday native-wear day", "source": "S" },
  "religiousMarker": null,
  "role": "software QA lead",
  "activity": "opens a laptop on the veranda before work",
  "microActions": ["slow breath while the laptop wakes", "glances at the street then back to the screen", "small closed-mouth smile"],
  "storySeed": { "want": "...", "obstacle": "...", "turn": "...", "feeling": "..." },
  "studioIds": ["std-lagos-veranda"],
  "identityBlock": "40-60 words pasted verbatim into every FLUX and LTX prompt",
  "canonicalStill": { "path": "...", "seed": 0, "model": "flux2-klein-4b-int4" },
  "reviewChecklist": ["MST drift vs target", "no head tie default", "no poverty cues", "no readable text"],
  "likenessCheck": { "method": "reverse image + face similarity", "date": null, "result": null },
  "sourceStatus": { "wardrobe": "S", "hair": "I", "skinWording": "I" }
}
```

### Studio entry schema (existing fields first, extensions after)

```json
{
  "id": "std-lagos-veranda",
  "name": "Lagos family-compound veranda",
  "status": "draft",
  "style": "photoreal, 35mm f/2, Kodak Portra 400 look",
  "set": "full FLUX still block: place noun + 2-3 materials + fixed prop positions",
  "continuity": "master plate path + 'keep the room, camera angle and framing identical'",
  "lighting": "one dominant source + direction + time of day",
  "lightingVariants": ["morning", "late afternoon", "blue hour"],
  "camera": "medium close-up, eye level, 35mm",
  "cameraMove": "static | slow push-in (relative to subject)",
  "mood": "calm, warm",
  "depth": "foreground / midground / background layers",
  "props": ["max", "three", "items"],
  "region": "West Africa", "country": "Nigeria", "city": "Lagos",
  "localTerms": ["jalousie louvres"],
  "occupancy": "0-2 background figures, defocused",
  "textRule": "no readable signage; add text in post",
  "patternRule": "patterns large-and-close or soft-focus; max one per frame",
  "reflectionRule": "matte surfaces; no mirrors facing camera",
  "ltxAmbient": "one ambient motion line for I2V (fan sways, steam rises)",
  "masterPlate": { "path": null, "seed": null },
  "sourceStatus": "I"
}
```

### Sample characters (15, all fictional adults, spanning six inhabited continents plus an Antarctic station)

Each `identityBlock` is drafted wording [I]. Wardrobe markers carry their own source status. MST values are targets for audit, not measurements.

```json
[
  { "id": "chr-lagos-adaeze-34", "age": 34, "gender": "woman", "city": "Lagos, Nigeria", "mst": 8, "role": "software QA lead",
    "identityBlock": "34-year-old woman, brown skin with deep warm undertones, oval face, small mole above left eyebrow, black box braids in a low ponytail, thin gold-rim glasses, fitted white cotton shirt with rolled sleeves, navy tailored trousers, tan loafers",
    "activity": "opens her laptop on the veranda before work", "studioIds": ["std-lagos-veranda"], "wardrobeSource": "S (Guardian Nigeria office wear)" },
  { "id": "chr-nairobi-otieno-52", "age": 52, "gender": "man", "city": "Nairobi, Kenya", "mst": 9, "role": "secondary-school chemistry teacher",
    "identityBlock": "52-year-old man, deep brown skin, round face, short greying hair and neat grey moustache, slim build, kitenge-print short-sleeve shirt in teal and ochre, khaki chinos, black leather shoes, canvas satchel",
    "activity": "waits at the matatu stage at dawn, sipping from a thermos lid", "studioIds": ["std-nairobi-matatu-stage"], "wardrobeSource": "S (kitenge informal wear) + I (styling)" },
  { "id": "chr-fez-latifa-61", "age": 61, "gender": "woman", "city": "Fez, Morocco", "mst": 4, "role": "retired pharmacist",
    "identityBlock": "61-year-old woman, light olive skin with fine laugh lines, silver chin-length bob uncovered, hazel eyes, soft build, oatmeal cardigan over a long grey jersey dress, beige flat sandals, reading glasses on a cord",
    "activity": "pours mint tea from a brass teapot in the courtyard", "studioIds": ["std-fez-riad"], "wardrobeSource": "I (hijab is a choice, not a default)" },
  { "id": "chr-mumbai-farzana-45", "age": 45, "gender": "woman", "city": "Mumbai, India", "mst": 6, "role": "bank branch manager",
    "identityBlock": "45-year-old woman, medium golden-brown skin, heart-shaped face, black hair with a grey streak in a low bun, small gold studs, plum cotton salwar kameez with a printed dupatta over one shoulder, office lanyard, black sandals",
    "activity": "buys a cutting chai at the tapri on her way to the branch", "studioIds": ["std-mumbai-chai-tapri"], "wardrobeSource": "S (salwar kameez everyday, Quartz) + I (styling)" },
  { "id": "chr-hanoi-linh-29", "age": 29, "gender": "woman", "city": "Hanoi, Vietnam", "mst": 4, "role": "freelance graphic designer",
    "identityBlock": "29-year-old woman, light golden skin, straight black hair in a blunt shoulder bob, thin silver hoop earrings, oversized sage-green linen shirt, wide-leg cream trousers, white canvas sneakers, tablet stylus in shirt pocket",
    "activity": "watches coffee drip through a phin filter while sketching", "studioIds": ["std-hanoi-tube-cafe"], "wardrobeSource": "I" },
  { "id": "chr-tokyo-hiroshi-68", "age": 68, "gender": "man", "city": "Tokyo, Japan", "mst": 3, "role": "retired train conductor",
    "identityBlock": "68-year-old man, light skin with warm undertones and age spots, short white hair neatly combed, clean-shaven, lean build, navy quilted vest over a grey button-down shirt, charcoal trousers, brown walking shoes, folded paperback in hand",
    "activity": "reads a paperback on a local-line platform bench at sunset", "studioIds": ["std-tokyo-local-platform"], "wardrobeSource": "I" },
  { "id": "chr-istanbul-emre-39", "age": 39, "gender": "man", "city": "Istanbul, Türkiye", "mst": 4, "role": "pharmacist",
    "identityBlock": "39-year-old man, light olive skin, square jaw, short dark wavy hair, trimmed dark beard with grey at the chin, medium build, charcoal crew-neck sweater, dark jeans, white sneakers",
    "activity": "drinks çay from a tulip glass on his balcony before opening the pharmacy", "studioIds": ["std-istanbul-balcony"], "wardrobeSource": "I (Western dress dominant)" },
  { "id": "chr-dalarna-ingrid-73", "age": 73, "gender": "woman", "city": "Dalarna, Sweden", "mst": 1, "role": "retired schoolteacher",
    "identityBlock": "73-year-old woman, very fair skin with pink undertones and freckles, white hair in a short pixie cut, behind-the-ear hearing aids, pale blue eyes, oatmeal wool sweater, dark grey trousers, felted wool slippers",
    "activity": "lifts a tray of cinnamon buns from the stove", "studioIds": ["std-swedish-pine-kitchen"], "wardrobeSource": "I", "inclusionNote": "visible hearing aids as ordinary detail" },
  { "id": "chr-manchester-daniel-44", "age": 44, "gender": "man", "city": "Manchester, UK", "mst": 9, "role": "ICU nurse",
    "identityBlock": "44-year-old man, deep brown skin, broad face, close-cropped black hair with a low fade, short black beard, athletic build, navy hospital scrubs under a grey zip hoodie, NHS-style lanyard turned face-in so no text shows",
    "activity": "makes tea in his kitchen after a night shift", "studioIds": ["std-uk-terraced-kitchen"], "wardrobeSource": "I" },
  { "id": "chr-puebla-rosario-50", "age": 50, "gender": "woman", "city": "Puebla, Mexico", "mst": 6, "role": "accountant who cooks for her family on weekends",
    "identityBlock": "50-year-old woman, medium golden-brown skin, round face, dark wavy hair to the shoulders with a tortoiseshell clip, small gold cross necklace, coral cotton blouse, dark jeans, striped cotton apron",
    "activity": "grinds salsa in a molcajete by the window", "studioIds": ["std-puebla-kitchen"], "wardrobeSource": "I (no sombrero/serape — documented cliché)" },
  { "id": "chr-saopaulo-thiago-31", "age": 31, "gender": "man", "city": "São Paulo, Brazil", "mst": 7, "role": "architect",
    "identityBlock": "31-year-old man, medium-brown skin with warm undertones, oval face, short tight curls, light stubble, slim build, wheelchair user in a matte-black manual wheelchair, white linen shirt, olive chinos, white sneakers",
    "activity": "sketches on a tablet on his varanda with a cafezinho", "studioIds": ["std-saopaulo-varanda"], "wardrobeSource": "I", "inclusionNote": "disability shown with agency, not as the story" },
  { "id": "chr-lapaz-justina-44", "age": 44, "gender": "woman", "city": "La Paz, Bolivia", "mst": 7, "role": "owner of a stationery and print shop",
    "identityBlock": "44-year-old woman, medium-brown skin with warm undertones, wide cheekbones, two long black braids, layered emerald pollera skirt, cream fringed shawl, small brown bowler hat, smartphone in hand",
    "activity": "checks the day's print orders on her phone at the shop counter", "studioIds": ["std-cusco-adobe-home"], "wardrobeSource": "S (pollera as everyday identity)", "note": "pair with a La Paz shop studio once drafted; Cusco set is a placeholder" },
  { "id": "chr-ontario-marie-58", "age": 58, "gender": "woman", "city": "Northern Ontario, Canada", "mst": 5, "role": "community health administrator",
    "identityBlock": "58-year-old woman, medium warm-tan skin, round face, long dark hair with grey streaks in a single braid, beaded floral earrings, red plaid flannel shirt over a black tee, dark jeans, rubber-soled boots",
    "activity": "pours coffee from a thermos on the dock at dawn", "studioIds": ["std-ontario-dock"], "wardrobeSource": "I (beadwork earrings everyday; no headdress — sacred)" },
  { "id": "chr-brisbane-jarrah-47", "age": 47, "gender": "man", "city": "Brisbane, Australia", "mst": 8, "role": "licensed electrician",
    "identityBlock": "47-year-old man, brown skin with warm undertones, broad nose, short curly greying hair, short salt-and-pepper beard, sturdy build, hi-vis orange work shirt, navy work shorts, steel-cap boots",
    "activity": "drinks iced tea on the Queenslander veranda after work", "studioIds": ["std-queenslander-veranda"], "wardrobeSource": "S (urban, contemporary — Creative Spirits) + I (workwear)" },
  { "id": "chr-antarctic-camila-41", "age": 41, "gender": "woman", "city": "Antarctic research station (Chilean team)", "mst": 5, "role": "station chef",
    "identityBlock": "41-year-old woman, medium warm-tan skin, angular face, dark brown hair in a tight bun under a black beanie, faint burn scar on right forearm, red fleece jacket over a white chef's tee, dark technical trousers, insulated boots",
    "activity": "stirs a pot of soup in the station galley while snow light fills the window", "studioIds": ["std-antarctic-galley"], "wardrobeSource": "I" }
]
```

The balance check on this sample: 9 women and 6 men. Ages run from 29 to 73, with four characters over 55. MST spans 1–9, with no MST 2 or 10 yet, so fill those in the next batch. There are two inclusion details (hearing aids, wheelchair), one visible religious marker chosen as personal jewellery, and one sourced traditional everyday garment (pollera). Every role is ordinary or professional, and no region carries a poverty frame [I].

### Sample studios (15, across all seven continents)

All `set` vocabulary is researcher-drafted and was not checked against architecture glossaries [I]. The rules on light logic, props, text and patterns follow the guides cited above.

```json
[
  { "id": "std-lagos-veranda", "name": "Lagos family-compound veranda", "status": "draft", "style": "photoreal, 35mm, Portra 400 look",
    "set": "shaded veranda of a cream-painted two-storey concrete house, glass louvre (jalousie) windows behind a white wrought-iron grille, speckled terrazzo floor",
    "continuity": "master plate wide shot; reuse as background reference", "lighting": "late-afternoon sun from camera-left through the louvres, striped soft shadows",
    "lightingVariants": ["early morning cool", "late afternoon warm"], "camera": "medium close-up, eye level", "cameraMove": "static",
    "mood": "unhurried, warm", "depth": "foreground grille edge soft, subject midground, garden wall background", "props": ["white plastic garden chair", "standing fan", "small side table"] },
  { "id": "std-nairobi-matatu-stage", "name": "Nairobi matatu stage at dawn", "status": "draft", "style": "photoreal, 50mm, low-contrast",
    "set": "covered steel bus shelter on a concrete kerb, jacaranda tree overhead, purple petals scattered on the pavement",
    "continuity": "parked minibus far background, no readable livery", "lighting": "low golden sunrise sidelight from camera-right with thin mist",
    "lightingVariants": ["dawn", "overcast midday"], "camera": "medium shot, eye level", "cameraMove": "slow push-in",
    "mood": "quiet anticipation", "depth": "petals foreground, subject midground, two distant defocused figures", "props": ["thermos flask", "parked minibus", "steel bench"] },
  { "id": "std-fez-riad", "name": "Fez riad courtyard", "status": "draft", "style": "photoreal, 35mm",
    "set": "small riad (رياض) courtyard, central fountain basin, dado band of palm-sized green-and-white zellige tiles kept soft, warm ochre tadelakt plaster above, carved cedar door",
    "continuity": "zellige always defocused", "lighting": "soft top light from the open sky, late morning",
    "lightingVariants": ["late morning", "dusk ambient"], "camera": "medium close-up, eye level", "cameraMove": "static",
    "mood": "serene", "depth": "brass tray foreground, subject midground, cedar door background", "props": ["brass teapot on low tray", "potted orange tree", "tea glasses"] },
  { "id": "std-mumbai-chai-tapri", "name": "Mumbai chai tapri, morning", "status": "draft", "style": "photoreal, 35mm",
    "set": "small chai tapri stall with steel counter, gas burner and aluminium pan, corrugated awning, monsoon-stained concrete wall, any signage faded and illegible",
    "continuity": "one chaiwala background, defocused", "lighting": "soft overcast morning light, steam backlit",
    "lightingVariants": ["overcast morning", "monsoon rain-diffused"], "camera": "medium close-up, eye level", "cameraMove": "static",
    "mood": "everyday bustle, gentle", "depth": "glasses foreground, subject midground, wall background", "props": ["kettle", "small cutting-chai glasses", "biscuit jar"] },
  { "id": "std-hanoi-tube-cafe", "name": "Hanoi tube-house café", "status": "draft", "style": "photoreal, 50mm, warm grade",
    "set": "narrow tube-house café, pale-yellow stucco wall, low plastic stools, ceiling fan, open front onto a quiet lane",
    "continuity": "fan always in upper frame", "lighting": "warm late-afternoon side light from the open front, camera-right",
    "lightingVariants": ["late afternoon", "overcast morning"], "camera": "medium close-up, slightly low angle", "cameraMove": "static",
    "mood": "relaxed, creative", "depth": "phin glass foreground, subject midground, lane background soft", "props": ["phin filter on glass", "condensed-milk tin", "low plastic stool"] },
  { "id": "std-tokyo-local-platform", "name": "Tokyo local-line platform", "status": "draft", "style": "photoreal, 50mm",
    "set": "open-air local train platform, concrete edge with yellow tactile paving, steel-column canopy, blank vending machine with no text",
    "continuity": "tracks run left to right", "lighting": "low evening sun along the tracks from camera-left",
    "lightingVariants": ["sunset", "overcast"], "camera": "medium shot, eye level", "cameraMove": "static",
    "mood": "reflective", "depth": "bench foreground, subject midground, one distant commuter", "props": ["bench", "blank vending machine", "umbrella"] },
  { "id": "std-istanbul-balcony", "name": "Istanbul apartment balcony", "status": "draft", "style": "photoreal, 35mm",
    "set": "narrow apartment balcony with black wrought-iron rail, view across terracotta rooftops softly hazed",
    "continuity": "rooftops always defocused", "lighting": "soft early-morning haze, sun low camera-right",
    "lightingVariants": ["early morning", "blue hour"], "camera": "medium close-up", "cameraMove": "slow push-in",
    "mood": "calm start of day", "depth": "rail foreground, subject midground, rooftops background", "props": ["tulip çay glass on saucer", "potted basil", "simit on a plate"] },
  { "id": "std-swedish-pine-kitchen", "name": "Swedish countryside pine kitchen", "status": "draft", "style": "photoreal, 35mm, Portra look",
    "set": "farmhouse kitchen, scrubbed pine table, painted cabinets with Falun-red accents, cast-iron wood-burning stove, lace curtain",
    "continuity": "stove camera-left", "lighting": "low winter sun through a south window, camera-right",
    "lightingVariants": ["winter midday", "candle-warm evening"], "camera": "medium shot", "cameraMove": "static",
    "mood": "cosy", "depth": "table foreground, subject midground, stove background", "props": ["coffee pot", "tray of cinnamon buns", "oven mitt"] },
  { "id": "std-uk-terraced-kitchen", "name": "British terraced-house kitchen-diner", "status": "draft", "style": "photoreal, 35mm, cool grade",
    "set": "terraced-house kitchen, exposed brick chimney breast, white sash window, butler sink, red quarry-tile floor",
    "continuity": "window camera-right", "lighting": "grey overcast diffuse window light",
    "lightingVariants": ["overcast morning", "early dark evening with one pendant lamp"], "camera": "medium close-up", "cameraMove": "static",
    "mood": "tired but tender", "depth": "mug foreground, subject midground, chimney breast background", "props": ["kettle", "mug", "loaf of bread"] },
  { "id": "std-puebla-kitchen", "name": "Puebla home kitchen", "status": "draft", "style": "photoreal, 35mm",
    "set": "home kitchen with large talavera tile backsplash kept soft, clay olla on a gas stove, wooden wall shelf",
    "continuity": "talavera always defocused", "lighting": "warm morning sun from a side window, camera-left",
    "lightingVariants": ["morning", "afternoon"], "camera": "medium close-up", "cameraMove": "static",
    "mood": "warm, domestic", "depth": "molcajete foreground, subject midground, tiles background", "props": ["molcajete", "basket of tortillas", "clay olla"] },
  { "id": "std-saopaulo-varanda", "name": "São Paulo apartment varanda", "status": "draft", "style": "photoreal, 35mm, golden grade",
    "set": "modernist concrete balcony, large cobogó breeze-block screen kept soft, potted monstera, ceramic tile floor, step-free threshold",
    "continuity": "cobogó camera-left", "lighting": "late-afternoon golden light raking through the cobogó",
    "lightingVariants": ["golden hour", "overcast"], "camera": "medium close-up", "cameraMove": "slow push-in",
    "mood": "quiet focus", "depth": "monstera leaf foreground, subject midground, city haze background", "props": ["cafezinho cup", "tablet", "potted monstera"] },
  { "id": "std-cusco-adobe-home", "name": "Andean adobe home, Cusco highlands", "status": "draft", "style": "photoreal, 35mm, crisp",
    "set": "sun-dried adobe walls, clay-tile roof edge, blue-painted wooden door, mountains soft behind",
    "continuity": "door camera-right", "lighting": "thin high-altitude morning light, crisp shadows",
    "lightingVariants": ["morning", "late afternoon"], "camera": "medium shot", "cameraMove": "static",
    "mood": "clear, steady", "depth": "bench foreground, subject midground, mountains background", "props": ["woven textile on bench", "clay pot", "smartphone"] },
  { "id": "std-ontario-dock", "name": "Ontario lakeside cabin dock", "status": "draft", "style": "photoreal, 50mm, muted",
    "set": "cedar dock over still lake, canoe tied alongside, spruce forest shore",
    "continuity": "water reflections kept soft", "lighting": "pre-dawn blue hour with low mist, then first warm light",
    "lightingVariants": ["blue hour", "early autumn afternoon"], "camera": "medium shot", "cameraMove": "static",
    "mood": "stillness", "depth": "dock planks foreground, subject midground, forest background", "props": ["canoe paddle", "enamel mug", "thermos"] },
  { "id": "std-queenslander-veranda", "name": "Queenslander veranda", "status": "draft", "style": "photoreal, 35mm, hot bright",
    "set": "timber stilt house veranda, corrugated-iron roof, timber lattice and fretwork balustrade",
    "continuity": "balustrade camera-left", "lighting": "hot clear late-afternoon light, deep shade under the roof",
    "lightingVariants": ["late afternoon", "storm-light overcast"], "camera": "medium close-up", "cameraMove": "static",
    "mood": "end-of-day ease", "depth": "glass foreground, subject midground, garden background", "props": ["cane chair", "glass of iced tea", "work boots"] },
  { "id": "std-antarctic-galley", "name": "Antarctic research station galley", "status": "draft", "style": "photoreal, 35mm, cool grade",
    "set": "modular station galley, white insulated wall panels, stainless steel counter, small triple-glazed window onto snow",
    "continuity": "window camera-right", "lighting": "cool snow light from the window as dominant source",
    "lightingVariants": ["polar day", "polar night with warm counter lights"], "camera": "medium close-up", "cameraMove": "static",
    "mood": "warm refuge in the cold", "depth": "pot foreground, subject midground, window background", "props": ["soup pot", "ladle", "thermos"] }
]
```

That list has 15 studios: Africa 3, Asia 4 (including Türkiye), Europe 2, North America 2, South America 2, Oceania 1, Antarctica 1. The 42-line draft location list in the research notes provides the next batch, plus the missing workshop settings such as a Japanese woodworking shop and a Florentine leather workshop [I]. One practical note on `props` [I]: some sets contain an item the character uses (a tablet, a smartphone). If the preset format treats props as part of the set, move hand-held items to the character's `activity`, so the three-prop limit stays meaningful.

## What must be A/B tested locally before the catalogue goes live

Nothing in the schemas is proven on FLUX.2 klein or LTX 2.3. Every item below needs rendered evidence on the M1, judged by eye and, where possible, with automated checks [I].

| # | Test | Variants | Pass criterion |
|---|---|---|---|
| 1 | Skin-tone wording vs MST target | Mapping table wording vs alternatives ("deep brown" vs "dark brown"), 4 seeds per MST bucket, under each studio light | Rendered tone within ±1 MST of target in ≥3/4 seeds; check for colorism drift on women |
| 2 | Nationality word in prompt | City in set block only vs "a Kenyan man" in identity block | Fewer costume/flag/poverty cues without losing realism |
| 3 | Hair texture rendering | 4C coils, locs, box braids, silk press, straight bob | Texture matches description across seeds and holds in LTX frames |
| 4 | Negative prompts on klein | Distilled 4B vs klein Base with "flag, costume, ruins" negatives | Confirm whether negatives do anything (expected inert on distilled) |
| 5 | Native-language place terms | "riad courtyard" vs "riad (رياض) courtyard"; "engawa" vs "engawa (縁側)" | Better architectural accuracy without gibberish text |
| 6 | Pattern flicker | Zellige/azulejo/cobogó sharp-small vs large-close vs soft-focus | No shimmer visible in 121-frame clips |
| 7 | Master plate vs text-only continuity | Same studio across 4 shots with/without plate as multi-ref | Room geometry, light direction and props stable |
| 8 | Identity drift in I2V | Static vs slow push-in; head turn 0°, 20°, 40° | ArcFace similarity >0.6 to canonical still on sampled frames |
| 9 | Micro-action vocabulary | "slow breath", "glance down and back", "closed-mouth smile forming" | Natural motion, no teeth or eye artifacts |
| 10 | Static opening frames | Trim 0.3 s vs 0.4 s vs keep as held beat | No visible freeze at clip start |
| 11 | Age floor rendering | "aged 25+" vs exact ages (29, 34) | No youthful-looking faces in any seed |
| 12 | Sexualization skew | Same wardrobe and framing across regions and genders | No change in framing or clothing by region |
| 13 | Readable text suppression | "illegible faded lettering" vs framing out | No gibberish text in stills or frames |
| 14 | Memory and time on M1 16 GB | Klein 4B int4 vs qint8; LTX int4 vs q8 `--low-ram` at 512×896, 97–121 frames | Fits without swap; record seconds per clip |
| 15 | Retention of story structure | Story Spine 4-beat vs single-moment Shorts | YouTube Analytics retention, after publication approval |

## Conclusion

The research points to one conclusion. Diversity in this pipeline has to be engineered as data, not requested as a style. The catalogue grid guarantees range, and specific visual descriptors make each person legible to the model. The model's clichés go into the review checklist, never into the prompt. That design also answers the over-correction problem that hurt Gemini: when every character is fully specified, the generator never needs to inject randomness or override intent. The same principle carries over to locations. A studio is a reusable set spec with one light logic and a master plate, and the most effective realism lever for people is restraint at the video stage, because LTX is better at small motion than large motion.

The biggest open question is empirical. No one has published how FLUX.2 klein actually renders skin-tone words, hair textures or region-specific architecture. So the first engineering milestone is a small calibration harness, not the catalogue itself: fixed seeds, one prompt per MST bucket and hair type, ArcFace and MST audits, and one human reviewer per depicted region where possible. Once that harness exists, the MST wording table, the identity blocks and the studio sets above can move from [I] to verified one entry at a time, and the catalogue can grow toward hundreds of entries with known, measured behaviour.
