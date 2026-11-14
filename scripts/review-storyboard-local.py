#!/usr/bin/env python3
"""Advisory local vision review of six FLUX stills before expensive motion work."""
import argparse
import base64
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scenario', required=True, type=Path)
    p.add_argument('--storyboard', required=True, type=Path)
    p.add_argument('--model', default='qwen3-vl:4b')
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    scenario = json.loads(a.scenario.read_text(encoding='utf-8-sig'))
    storyboard = a.storyboard.read_bytes()
    beats = scenario.get('storyArc', {}).get('beats', [])
    planned = [{'shot':i+1,'beat':beats[i]['label'] if i<len(beats) else 'Shot',
                'action':shot['narration'][:90]} for i,shot in enumerate(scenario['plan']['shots'])]
    prompt = ('Review this numbered six-frame storyboard for one continuous food story. '
              'Check food shape, location, cooking order, and final bite against the plan. '
              'List at most three concrete visible issues with shot numbers. No scene descriptions. '
              'If uncertain, say so briefly. JSON only. '
              f'Idea: {scenario.get("topic", "")[:180]}. Plan: {json.dumps(planned)}')
    schema = {'type':'object','properties':{
        'coherent':{'type':'boolean'},
        'issues':{'type':'array','items':{'type':'string'},'maxItems':3},
        'uncertainty':{'type':'string'}},
        'required':['coherent','issues','uncertainty'],'additionalProperties':False}
    body = {'model':a.model,'stream':False,'think':False,'format':schema,'options':{'temperature':0,'num_predict':450,'num_ctx':4096},
            'messages':[{'role':'user','content':prompt,'images':[base64.b64encode(storyboard).decode()]}]}
    request = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(body).encode(),
                                     headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = json.loads(response.read())['message']['content']
        review = json.loads(raw[raw.find('{'):raw.rfind('}')+1])
        if not isinstance(review.get('coherent'), bool) or not isinstance(review.get('issues'), list):
            raise ValueError('Vision model returned an incomplete review')
        status = 'advisory-pass' if review['coherent'] and not review['issues'] else 'review-images'
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError, json.JSONDecodeError) as error:
        review = {'coherent':None,'issues':[f'Local vision review unavailable: {type(error).__name__}'], 'shotDescriptions':[]}
        status = 'unavailable'
    report = {'checkedAt':datetime.now(timezone.utc).isoformat(),'model':a.model,'status':status,
              'scenario':str(a.scenario),'storyboard':str(a.storyboard),'review':review,
              'note':'Local vision review is advisory. Inspect the actual six stills and final motion yourself before release.'}
    output = a.output or a.storyboard.with_suffix('.vision.json')
    output.write_text(json.dumps(report,indent=2)+'\n')
    print(f'Vision storyboard review: {status}')
    for issue in review['issues']: print('REVIEW:', issue)
    print(f'Report: {output}')


if __name__ == '__main__': main()
