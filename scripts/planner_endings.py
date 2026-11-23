"""Model-free checks on a planned story's last shot. Nothing here calls a model.

What is checked, and why only this:
  * ending-not-reached: the last shot's sceneState.after must express the requested ending.
    (Current code forces this through lockRequestedEnding; older plans did not.)
  * check-written-as-question: mustShow/mustNotShow are fed to the still selector as
    "required visible items" / "forbidden items", so a line such as "Is the dock pristine?"
    is ill-formed. Reported only; fixing it automatically could invert its meaning.
  * no-shots.

Deliberately NOT checked: that mustShow/mustNotShow describe the ending. The still selector
applies them to a shot's first-frame candidates and the motion pre-review applies them to the
middle frame; the final frame is judged separately against the plan's ending. Requiring the
ending in mustShow would fail every correct first frame.
"""
import re

QUESTION = re.compile(r'\?\s*$|^\s*(is|are|does|do|has|have|was|were|can)\b', re.I)


def _matches(patterns, text):
    return all(re.search(p, text, re.I) for p in patterns)


def ending_problems(plan, ending):
    """Return problem codes for the final shot; empty means none found.

    ending = {'after': [[regex, ...], ...]} - every group must match the final sceneState.after.
    """
    shots = plan.get('shots') or []
    if not shots:
        return ['no-shots']
    last = shots[-1]
    after = str((last.get('sceneState') or {}).get('after', ''))
    checks = last.get('visualChecks') or {}
    problems = []
    if not all(_matches(group, after) for group in ending['after']):
        problems.append('ending-not-reached')
    lines = [str(x) for x in (checks.get('mustShow') or []) + (checks.get('mustNotShow') or [])]
    if any(QUESTION.search(line) for line in lines):
        problems.append('check-written-as-question')
    return problems
