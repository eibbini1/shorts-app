"""Model-free checks that a planned story reaches the ending the owner asked for.

The checks read only the last planned shot: what the story says happens (sceneState.after),
what the first-frame/motion reviewer is told to look for (visualChecks.mustShow) and what it
is told to reject (mustNotShow). Nothing here calls a model.
"""
import re

QUESTION = re.compile(r'\?\s*$|^\s*(is|are|does|do|has|have|was|were|can)\b', re.I)


def _texts(items):
    return [str(item) for item in (items or [])]


def _matches(patterns, text):
    return all(re.search(p, text, re.I) for p in patterns)


def ending_problems(plan, ending):
    """Return a list of problem codes for the final shot. Empty means the ending is covered.

    ending = {'after': [[regex, ...], ...], 'visible': [[regex, ...], ...]}
      after   - every group must match the final sceneState.after (one regex per required idea)
      visible - every group must match at least one final mustShow line
    """
    shots = plan.get('shots') or []
    if not shots:
        return ['no-shots']
    last = shots[-1]
    state = last.get('sceneState') or {}
    checks = last.get('visualChecks') or {}
    after = str(state.get('after', ''))
    must_show = _texts(checks.get('mustShow'))
    must_not = _texts(checks.get('mustNotShow'))
    problems = []
    for group in ending['after']:
        if not _matches(group, after):
            problems.append('ending-not-reached')
            break
    for group in ending['visible']:
        if not any(_matches(group, line) for line in must_show):
            problems.append('final-frame-check-omits-ending')
            break
    # A rejection rule that matches the requested end state would fail the correct clip.
    # Only the state-change groups count; merely naming an object is not a contradiction.
    if any(_matches(group, line) for line in must_not for group in ending['after']):
        problems.append('rejects-the-ending')
    if any(QUESTION.search(line) for line in must_show + must_not):
        problems.append('check-written-as-question')
    return problems
