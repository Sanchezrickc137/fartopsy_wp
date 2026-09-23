const TAU = Math.PI * 2;
const MIN_SPACING = 9;

export function createStars(width, height, { seed = 0x46415254, maxStars = 950 } = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const limit = Math.max(0, Math.floor(Number.isFinite(maxStars) ? maxStars : 950));
  const count = Math.min(limit, Math.round(width * height / 1900));
  let state = Number.isFinite(seed) ? seed >>> 0 : 0x46415254;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [], cells = new Map();
  const key = (x, y) => `${x},${y}`;
  // Bins accelerate exclusion checks; positions remain continuous random
  // samples, not points on the bins themselves. The attempt cap also handles
  // very narrow viewports without an unbounded placement loop.
  for (let attempt = 0; stars.length < count && attempt < count * 40; attempt++) {
    const x = random() * width, y = random() * height;
    const column = Math.floor(x / MIN_SPACING), row = Math.floor(y / MIN_SPACING);
    let crowded = false;
    for (let dx = -1; dx <= 1 && !crowded; dx++) {
      for (let dy = -1; dy <= 1 && !crowded; dy++) {
        for (const other of cells.get(key(column + dx, row + dy)) || []) {
          if ((x - other.x) ** 2 + (y - other.y) ** 2 < MIN_SPACING ** 2) {
            crowded = true;
            break;
          }
        }
      }
    }
    if (crowded) continue;
    const star = {
      x, y,
      radius: .65 + random() * .85,
      alpha: .28 + random() * .37,
      color: Math.floor(random() * 3),
      sparkle: random() < .12,
      inclination: .25 + random() * (Math.PI - .5),
      ascension: random() * TAU,
      phase: random() * TAU,
      orbitRadius: 14 + random() * 34,
      amount: 0,
    };
    stars.push(star);
    const cellKey = key(column, row);
    if (!cells.has(cellKey)) cells.set(cellKey, []);
    cells.get(cellKey).push(star);
  }
  return stars;
}

export function stepStar(star, pointer, timeSeconds, dtSeconds, impactRadius = 155) {
  const dt = Number.isFinite(dtSeconds) ? Math.max(0, Math.min(.05, dtSeconds)) : 0;
  let target = 0;
  if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) &&
      Number.isFinite(impactRadius) && impactRadius > 0) {
    const proximity = Math.max(0, 1 - Math.hypot(pointer.x - star.x, pointer.y - star.y) / impactRadius);
    target = proximity * proximity * (3 - 2 * proximity);
  }
  const current = Number.isFinite(star.amount) ? Math.max(0, Math.min(1, star.amount)) : 0;
  const response = target > current ? .16 : .45;
  star.amount = current + (target - current) * (1 - Math.exp(-dt / response));
  if (target === 0 && star.amount < .001) star.amount = 0;
  if (star.amount === 0) return { x: star.x, y: star.y, z: 0, scale: 1, alpha: star.alpha };

  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const angle = star.phase + time * .95;
  const orbit = star.orbitRadius * star.amount;
  const u = Math.cos(angle) * orbit, v = Math.sin(angle) * orbit;
  const projectedV = v * Math.cos(star.inclination);
  const cosine = Math.cos(star.ascension), sine = Math.sin(star.ascension);
  return {
    x: star.x + u * cosine - projectedV * sine,
    y: star.y + u * sine + projectedV * cosine,
    z: v * Math.sin(star.inclination),
    scale: 1 + star.amount * 1.2,
    alpha: star.alpha + (1 - star.alpha) * star.amount,
  };
}
