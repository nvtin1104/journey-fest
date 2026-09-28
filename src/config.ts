/** Meters per map unit (a 40u booth = 2 m). */
export const SCALE = 0.05;

/** Map point (in map units) that becomes the world origin. */
export const ORIGIN = { x: 1900, y: 1265 };

export const WALL = { height: 4, thickness: 0.3, doorHeight: 3, color: '#ece6f5', doorColor: '#38528f' };
export const ROOM = { height: 3 };

export const BOOTH = {
  counterHeight: 0.9,
  /** Counter depth as a fraction of the booth depth. */
  counterDepthRatio: 0.4,
  postHeight: 2.4,
  postSize: 0.06,
  backPanelHeight: 1.8,
  fasciaHeight: 0.45,
};

export const PAVILION = { postHeight: 3.2, headerHeight: 0.7, floorHeight: 0.08 };

export const PLAYER = {
  radius: 0.35,
  walkSpeed: 4.5,
  runSpeed: 9,
};

/** Spawn at the tip of the green entrance arrow on the bottom sidewalk (map units). */
export const SPAWN = { x: 3560, y: 2825, facing: 'W' as const };

/** Map units: a direction with less free space than this is blocked (a back-to-back neighbour or a wall). */
export const FACING_MIN_CLEARANCE = 25;
