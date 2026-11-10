const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MULT: Record<string, number> = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const CUR: Record<string, string> = { dollars: '$', dollar: '$', pounds: '£', pound: '£', euros: '€', euro: '€' };

/** "one hundred fifty nine pounds" -> "£159", "a thousand dollars" -> "$1,000", "five courses" -> "5 courses". */
export function spokenToDigits(text: string): string {
  // Resolve decimal scales before the integer parser can split the amount.
  const digit = '(?:zero|one|two|three|four|five|six|seven|eight|nine)';
  const decimal = new RegExp('\\b(' + digit + ') point (' + digit + '(?: ' + digit + ')*) (thousand|million|billion)(?: (dollars?|euros?|yen|dirhams?))?\\b', 'gi');
  text = text.replace(decimal, (_match, whole: string, fraction: string, scale: string, currency?: string) => {
    const value = Number(String(UNITS[whole.toLowerCase()]) + '.' + fraction.toLowerCase().split(' ').map(w => UNITS[w]).join('')) * MULT[scale.toLowerCase()]!;
    const amount = value.toLocaleString('en-US', { maximumFractionDigits: 6 });
    const symbol = currency ? CUR[currency.toLowerCase()] : undefined;
    return symbol ? symbol + amount : amount + (currency ? ' ' + currency : '');
  });
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let i = 0;
  const bare = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, '');
  while (i < words.length) {
    const w = words[i]!;
    const b = bare(w);
    const startsNum = (b.length > 0 && b.split('-').every((p) => p in UNITS)) || b in MULT || (b === 'a' && bare(words[i + 2] ?? '') in MULT);
    if (!startsNum || /^\s+$/.test(w)) {
      out.push(w);
      i++;
      continue;
    }
    let total = 0;
    let cur = 0;
    let j = i;
    let used = false;
    while (j < words.length) {
      const t = bare(words[j]!);
      if (/^\s+$/.test(words[j]!)) { j++; continue; }
      if (t === 'and' && used) { j++; continue; }
      if (t === 'a' && !used && bare(words[j + 2] ?? '') in MULT) { cur = 1; used = true; j++; continue; }
      const parts = t.split('-');
      if (parts.every((p) => p in UNITS)) { cur += parts.reduce((s, p) => s + UNITS[p]!, 0); used = true; j++; continue; }
      if (t in MULT) {
        if (t === 'hundred') cur = (cur || 1) * 100;
        else { total += (cur || 1) * MULT[t]!; cur = 0; }
        used = true;
        j++;
        continue;
      }
      break;
    }
    const value = total + cur;
    // trailing "and"/spaces consumed by the loop must be given back
    let end = j;
    while (end > i && (/^\s+$/.test(words[end - 1]!) || bare(words[end - 1]!) === 'and')) end--;
    const nextWord = bare(words[end + 1] ?? '');
    const cur$ = CUR[nextWord];
    const num = value.toLocaleString('en-US');
    if (cur$) {
      const punct = (words[end + 1] ?? '').replace(/^[a-zA-Z]+/, '');
      out.push(cur$ + num + punct);
      i = end + 2;
    } else {
      out.push(String(num));
      i = end;
    }
  }
  return out.join('');
}

const TENSION = /\b(illegal|banned|ban|forbidden|outlawed|smuggl\w*|scam|fake|secret|only one|pick one|vs\.?|versus|can't|cannot|never|warning|dangerous|deadly|worth it)\b/i;
const SHOWCASE = /\b(wagyu|steak|burger|tomahawk|biryani|ice cream|cupcake)\b/i;
const OPINION_GAP = /\b(scam|genius|worth it|rip.?off|overrated|spend it|or spend|or skip|drop your take|your take|which one are you|your pick|take a side|team \w+|disgusting or)\b/i;

/** Rotating divisive closing lines (opinion gap), by topic family. */
export const CTA_BANK: Record<string, string[]> = {
  price: ['Genius or total scam? Drop your take below.', 'Worth every penny or the biggest rip-off? Tell me below.'],
  taboo: ['Should this stay illegal? Drop your take below.', 'Ban it or eat it? Team ban or team eat, comment below.'],
  choice: ['Team one or team two? Comment your pick below.', 'Only one allowed. Which one are you taking? Comment below.'],
  default: ['Genius or scam? Drop your take below.'],
};

/** A pinned-comment line that gives viewers something to argue about. */
export function pinnedComment(family: string, topic: string): string {
  const t = topic.trim() || 'this';
  if (family === 'taboo') return `Is the ${t} rule smart, or just food snobbery? Take a side.`;
  if (family === 'choice') return `If you could only pick one, which would you take, and why?`;
  return `If you had $1,000 right now, are you spending it on ${t} or something else? Be honest.`;
}

export interface HookResult { score: number; fixes: string[]; breakdown: Record<string, number> }

/** Heuristic scoring of the opening and structure of a Short script. Max 100; most scripts land 45-85. */
export function scoreHook(texts: string[], hookText?: string, niche: 'food' | 'watch' = 'food'): HookResult {
  const first = texts[0] ?? '';
  const last = texts[texts.length - 1] ?? '';
  const all = texts.join(' ');
  const words = (hookText?.trim() || first).split(/\s+/).filter(Boolean).length;
  const totalWords = all.split(/\s+/).filter(Boolean).length;
  const estSec = totalWords / 2.6;
  const b: Record<string, number> = {};
  const fixes: string[] = [];
  if (niche === 'watch') {
    b.shortHook = words > 0 && words <= 10 ? 20 : words <= 14 && words > 0 ? 10 : 0;
    b.mechanism = /\b(bezel|crown|clasp|rotor|dial|hand|escapement|chronograph|bracelet)\b/i.test(first) ? 20 : 0;
    b.curiosity = /\?|\b(why|how|watch what|what happens)\b/i.test(first) ? 20 : 0;
    b.demonstration = /\b(turns?|clicks?|moves?|rotates?|align|press|pull|point|opens?)\b/i.test(texts.slice(1).join(' ')) ? 15 : 0;
    b.payoff = /\b(so|because|means|that|result)\b/i.test(last) ? 15 : 0;
    b.pacing = estSec >= 10 && estSec <= 40 ? 10 : 0;
    if (!b.shortHook) fixes.push('Open with a short spoken hook.');
    if (!b.mechanism || !b.curiosity) fixes.push('Name the watch detail and raise a specific question in the opening.');
    if (!b.demonstration || !b.payoff) fixes.push('Show one action and explain its visible result before the close.');
    if (!b.pacing) fixes.push('Check the narration against the planned runtime.');
    return { score: Object.values(b).reduce((sum, value) => sum + value, 0), fixes, breakdown: b };
  }
  b.price = /[$£€]|\b(dirhams?|dollars?|pounds?|thousands?|millions?|hundreds?)\b/i.test(first) ? 20 : 0;
  if (!b.price) fixes.push('Open with a concrete price in the first sentence ("This steak costs 159 pounds.").');
  b.number = /\d|\b(one|two|three|four|five|ten|twenty|hundred|thousand|million)\b/i.test(first) ? 5 : 0;
  b.shortHook = words <= 10 ? 15 : words <= 14 ? 9 : 0;
  if (words > 10) fixes.push(`Hook line is ${words} words; 10 or fewer lands the payoff inside 3 seconds.`);
  b.luxury = /gold|diamond|caviar|truffle|saffron|wagyu|jewel|billion/i.test(first) ? 8 : 0;
  // v2 (from 28-day analytics): tension/taboo/either-or openers kept viewers; plain showcases got swiped
  const opening = first + ' ' + (texts[1] ?? '');
  b.tension = TENSION.test(opening) ? 10 : 0;
  if (!b.tension) fixes.push('Add tension in the first two lines: illegal/banned/forbidden, "only one", "vs", a secret or a scam angle.');
  if (SHOWCASE.test(first) && !b.tension) {
    b.showcasePenalty = -15;
    fixes.push('Known-luxury showcase with no tension (plain wagyu/steak/burger) flopped in your analytics; find a twist or pick another topic.');
  }
  if (!b.luxury) fixes.push('Name the luxury element (gold, caviar, truffle) in the first sentence for the niche match.');
  b.curiosity = /here's why|what's inside|guess|would you|can you|could you|the secret|never|banned|why /i.test(first + ' ' + (texts[1] ?? '')) ? 10 : 0;
  if (!b.curiosity) fixes.push('Add a curiosity gap in the first two lines ("Here\'s why", "Guess the price", "What\'s inside?").');
  b.cta = OPINION_GAP.test(last) ? 12 : /\?/.test(last) || /\b(comment|pick one|which)\b/i.test(last) ? 5 : 0;
  if (b.cta < 12) fixes.push('Use a divisive opinion-gap close ("Genius or scam? Drop your take.") instead of a passive question.');
  b.length = estSec <= 30 ? 10 : estSec <= 40 ? 6 : estSec <= 55 ? 2 : 0;
  if (estSec > 40) fixes.push(`About ${Math.round(estSec)} s of narration; 13 to 35 s retains best.`);
  b.pacing = texts.length >= 5 && texts.length <= 9 ? 8 : texts.length >= 4 ? 4 : 0;
  b.loop = /\b(again|next time|more)\b/i.test(last) ? 5 : 0;
  const score = Math.max(0, Math.min(100, Object.values(b).reduce((s, n) => s + n, 0)));
  return { score, fixes, breakdown: b };
}

/** Keep generated titles readable instead of cutting a word in half. */
export function shortTitle(title: string, max = 70): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const end = slice.lastIndexOf(' ');
  return (end > max / 2 ? slice.slice(0, end) : slice) + '…';
}
