export function fitOutlineIdeas(value, count = 5) {
  if (!Array.isArray(value?.ideas) || value.ideas.length <= count) return value;
  return {...value, ideas: value.ideas.slice(0, count)};
}

export function narrationWordBand(seconds) {
  return {
    min: Math.max(3, Math.floor(seconds * 0.8)),
    max: Math.floor(seconds * 2.5),
  };
}
