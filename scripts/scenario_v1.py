#!/usr/bin/env python3
"""Dependency-free Scenario v1 validator mirroring data/schemas/scenario-v1.schema.json.

Usage:
  python3 scripts/scenario_v1.py path/to/file.local-scenario.json [...]
"""
import json
import re
import sys
from pathlib import Path

SCENARIO_SCHEMA_VERSION = 1
ALLOWED_FORMATS = ('short', 'long', 'wide', 'vertical')
ALLOWED_LOOKS = ('food', 'cartoon', 'night', 'custom')
ALLOWED_PRESENTATION_MODES = ('auto', 'asmr', 'voiced')
ALLOWED_QUALITIES = ('standard', 'high')


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _is_num(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _check_non_empty_str(value, field, max_len, issues):
    if not isinstance(value, str) or not value.strip():
        issues.append(f'{field} must be a non-empty string')
        return None
    trimmed = value.strip()
    if len(trimmed) > max_len:
        issues.append(f'{field} exceeds maximum length of {max_len}')
    return trimmed


def _normalize_state(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()


def validate_scenario(data):
    """Return a list of Scenario v1 validation issues (empty list means valid)."""
    issues = []
    if not isinstance(data, dict):
        return ['root must be a JSON object']

    if 'schemaVersion' in data and data['schemaVersion'] is not None:
        if not _is_int(data['schemaVersion']) or data['schemaVersion'] != SCENARIO_SCHEMA_VERSION:
            issues.append(f'schemaVersion must be {SCENARIO_SCHEMA_VERSION}')

    if 'status' in data and data['status'] is not None:
        _check_non_empty_str(data['status'], 'status', 64, issues)

    if 'topic' in data and data['topic'] is not None:
        if not isinstance(data['topic'], str) or len(data['topic']) > 1000:
            issues.append('topic must be a string up to 1000 characters')

    if 'style' in data and data['style'] is not None:
        if not isinstance(data['style'], str) or len(data['style']) > 500:
            issues.append('style must be a string up to 500 characters')

    if 'requestedEnding' in data and data['requestedEnding'] is not None:
        if not isinstance(data['requestedEnding'], str) or len(data['requestedEnding']) > 1000:
            issues.append('requestedEnding must be null or a string up to 1000 characters')

    if 'totalSeconds' in data and data['totalSeconds'] is not None:
        if not _is_num(data['totalSeconds']) or not 1 <= data['totalSeconds'] <= 1800:
            issues.append('totalSeconds must be a number between 1 and 1800')

    settings = data.get('settings')
    valid_seconds = None
    if not isinstance(settings, dict):
        issues.append('settings must be an object')
    else:
        if 'brand' in settings and settings['brand'] is not None:
            _check_non_empty_str(settings['brand'], 'settings.brand', 120, issues)
        fmt = settings.get('format')
        if fmt not in ALLOWED_FORMATS:
            issues.append(f'settings.format must be one of {", ".join(ALLOWED_FORMATS)}')
        sec = settings.get('seconds')
        if not _is_int(sec):
            issues.append('settings.seconds must be an integer')
        else:
            is_wide = fmt in ('long', 'wide')
            lo, hi = (60, 1800) if is_wide else (10, 180)
            if not lo <= sec <= hi:
                issues.append(f'settings.seconds ({sec}) must be between {lo} and {hi} for format "{fmt}"')
            else:
                valid_seconds = sec
        if 'presentationMode' in settings and settings['presentationMode'] is not None:
            if settings['presentationMode'] not in ALLOWED_PRESENTATION_MODES:
                issues.append(f'settings.presentationMode must be one of {", ".join(ALLOWED_PRESENTATION_MODES)}')
        if 'look' in settings and settings['look'] is not None:
            if settings['look'] not in ALLOWED_LOOKS:
                issues.append(f'settings.look must be one of {", ".join(ALLOWED_LOOKS)}')
        if 'quality' in settings and settings['quality'] is not None:
            if settings['quality'] not in ALLOWED_QUALITIES:
                issues.append(f'settings.quality must be one of {", ".join(ALLOWED_QUALITIES)}')
        if 'voice' in settings and settings['voice'] is not None:
            _check_non_empty_str(settings['voice'], 'settings.voice', 120, issues)

    plan = data.get('plan')
    if not isinstance(plan, dict):
        issues.append('plan must be an object')
        return issues

    for field in ('title', 'hook', 'payoff'):
        _check_non_empty_str(plan.get(field), f'plan.{field}', 1000, issues)

    if 'ideas' in plan and plan['ideas'] is not None:
        ideas = plan['ideas']
        if not isinstance(ideas, list) or len(ideas) > 20:
            issues.append('plan.ideas must be a list of at most 20 items')
        else:
            for idx, idea in enumerate(ideas):
                if not isinstance(idea, dict):
                    issues.append(f'plan.ideas[{idx}] must be an object')
                else:
                    _check_non_empty_str(idea.get('title'), f'plan.ideas[{idx}].title', 1000, issues)
                    _check_non_empty_str(idea.get('angle'), f'plan.ideas[{idx}].angle', 1000, issues)

    claims = plan.get('claimsToCheck')
    if not isinstance(claims, list) or len(claims) > 100:
        issues.append('plan.claimsToCheck must be a list of at most 100 strings')
    else:
        for idx, claim in enumerate(claims):
            _check_non_empty_str(claim, f'plan.claimsToCheck[{idx}]', 1000, issues)

    shots = plan.get('shots')
    if not isinstance(shots, list) or not 1 <= len(shots) <= 900:
        issues.append('plan.shots must be a non-empty list of at most 900 shots')
        return issues

    total = 0
    all_seconds_valid = True
    state_count = 0
    checks_count = 0
    parsed_states = []

    for idx, shot in enumerate(shots):
        prefix = f'plan.shots[{idx}]'
        if not isinstance(shot, dict):
            issues.append(f'{prefix} must be an object')
            all_seconds_valid = False
            parsed_states.append(None)
            continue
        sec = shot.get('seconds')
        if not _is_int(sec) or not 1 <= sec <= 30:
            issues.append(f'{prefix}.seconds must be an integer between 1 and 30')
            all_seconds_valid = False
        else:
            total += sec
        _check_non_empty_str(shot.get('narration'), f'{prefix}.narration', 1000, issues)
        _check_non_empty_str(shot.get('imagePrompt'), f'{prefix}.imagePrompt', 2000, issues)
        _check_non_empty_str(shot.get('motionPrompt'), f'{prefix}.motionPrompt', 2000, issues)
        _check_non_empty_str(shot.get('sound'), f'{prefix}.sound', 1000, issues)
        if 'voiceLeadSeconds' in shot and shot['voiceLeadSeconds'] is not None:
            if not _is_num(shot['voiceLeadSeconds']) or not 0 <= shot['voiceLeadSeconds'] <= 10:
                issues.append(f'{prefix}.voiceLeadSeconds must be a number between 0 and 10')

        state = shot.get('sceneState')
        if state is not None:
            state_count += 1
            if not isinstance(state, dict):
                issues.append(f'{prefix}.sceneState must be an object')
                parsed_states.append(None)
            else:
                before = _check_non_empty_str(state.get('before'), f'{prefix}.sceneState.before', 1000, issues)
                _check_non_empty_str(state.get('action'), f'{prefix}.sceneState.action', 1000, issues)
                after = _check_non_empty_str(state.get('after'), f'{prefix}.sceneState.after', 1000, issues)
                parsed_states.append((before, after) if before and after else None)
        else:
            parsed_states.append(None)

        checks = shot.get('visualChecks')
        if checks is not None:
            checks_count += 1
            if not isinstance(checks, dict):
                issues.append(f'{prefix}.visualChecks must be an object')
            else:
                must_show = checks.get('mustShow')
                if not isinstance(must_show, list) or not 1 <= len(must_show) <= 5:
                    issues.append(f'{prefix}.visualChecks.mustShow must be a list of 1 to 5 strings')
                else:
                    for item_i, item in enumerate(must_show):
                        _check_non_empty_str(item, f'{prefix}.visualChecks.mustShow[{item_i}]', 1000, issues)
                for key in ('mustNotShow', 'questions'):
                    arr = checks.get(key)
                    if not isinstance(arr, list) or len(arr) > 5:
                        issues.append(f'{prefix}.visualChecks.{key} must be a list of at most 5 strings')
                    else:
                        for item_i, item in enumerate(arr):
                            _check_non_empty_str(item, f'{prefix}.visualChecks.{key}[{item_i}]', 1000, issues)

    if valid_seconds is not None and all_seconds_valid:
        minimum = 25 if valid_seconds == 30 else valid_seconds - 2
        if not minimum <= total <= valid_seconds + 2:
            issues.append(f'sum of shot durations ({total}s) does not match settings.seconds ({valid_seconds}s)')

    if 0 < state_count < len(shots):
        issues.append('every shot must include sceneState when one shot defines it')
    elif state_count == len(shots):
        for idx, pair in enumerate(parsed_states):
            if pair is None:
                continue
            before, after = pair
            if _normalize_state(before) == _normalize_state(after):
                issues.append(f'shot {idx + 1} sceneState must change from before to after')
            if idx > 0 and parsed_states[idx - 1] is not None:
                prev_after = parsed_states[idx - 1][1]
                if _normalize_state(before) != _normalize_state(prev_after):
                    issues.append(f'shot {idx + 1} sceneState.before must continue shot {idx} sceneState.after')

    if 0 < checks_count < len(shots):
        issues.append('every shot must include visualChecks when one shot defines them')

    return issues


def load_and_validate(path):
    """Load a JSON file (handling UTF-8 BOM) and validate it against Scenario v1."""
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, json.JSONDecodeError) as error:
        return None, [f'could not read scenario JSON: {error}']
    return data, validate_scenario(data)


def main(argv=None):
    paths = list(sys.argv[1:] if argv is None else argv)
    if not paths:
        print('Usage: python3 scripts/scenario_v1.py FILE [FILE ...]', file=sys.stderr)
        return 2
    failed = 0
    for item in paths:
        _, issues = load_and_validate(item)
        if issues:
            failed += 1
            print(f'INVALID {item}:')
            for issue in issues:
                print(f'  - {issue}')
        else:
            print(f'OK {item}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
