#!/usr/bin/env python3
"""Measure actual edit cuts with PySceneDetect; scene count is diagnostic, not a quality score."""
import argparse
import json
from pathlib import Path
from scenedetect import ContentDetector, detect


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--video', required=True, type=Path)
    p.add_argument('--threshold', type=float, default=30.0)
    a = p.parse_args()
    scenes = detect(str(a.video), ContentDetector(threshold=a.threshold, min_scene_len=12), show_progress=False)
    cuts = [round(end.seconds, 3) for _, end in scenes[:-1]]
    lengths = [round(end.seconds-start.seconds, 3) for start,end in scenes]
    print(json.dumps({'tool':'PySceneDetect ContentDetector','threshold':a.threshold,'detectedScenes':len(scenes),
                      'cutSeconds':cuts,'sceneLengthsSeconds':lengths,
                      'note':'Automatic cut detection may miss soft fades or count large camera changes; compare with the intended shot plan.'}))


if __name__ == '__main__': main()
