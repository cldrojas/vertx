/**
 * VERT/X — Visual configuration.
 *
 * Centralized luminosity/brightness controls for different light sources.
 * All values are multipliers (0.0 - 1.0+) applied to base intensities.
 */

export const LUMINOSITY = {
  // Building interior windows (lit windows)
  buildingWindows: 1.0,

  // Neon signs/billboards on building faces (carteles)
  neonSigns: 1.0,

  // AC unit ventilation glows
  acVents: 1.0,

  // Roof spire tips and antennas
  roofDetails: 1.0,

  // Vertical neon accent strips on building inner edges
  buildingEdgeNeon: 1.0,

  // Neon strips on gap edges (tunnel walls)
  gapEdgeNeon: 1.0,

  // VERT-X text in gap center
  centerText: 1.0,

  // Corner brackets
  cornerBrackets: 1.0,
};

/**
 * Global master brightness multiplier.
 * Applies to ALL light sources uniformly.
 * Range: 0.0 (pitch black) to 1.0+ (overbright)
 */
export const MASTER_BRIGHTNESS = 1.0;

/**
 * Get effective luminosity for a specific light source.
 * Combines master brightness with source-specific multiplier.
 *
 * @param {keyof typeof LUMINOSITY} source - Light source key
 * @returns {number} Effective brightness multiplier
 */
export function getLuminosity(source) {
  return MASTER_BRIGHTNESS * (LUMINOSITY[source] ?? 1.0);
}

/**
 * Set luminosity for a specific light source.
 *
 * @param {keyof typeof LUMINOSITY} source - Light source key
 * @param {number} value - Multiplier (0.0 - 2.0 recommended)
 */
export function setLuminosity(source, value) {
  if (source in LUMINOSITY) {
    LUMINOSITY[source] = Math.max(0, Math.min(2, value));
  }
}

/**
 * Set master brightness.
 *
 * @param {number} value - Multiplier (0.0 - 2.0 recommended)
 */
export function setMasterBrightness(value) {
  const v = Math.max(0, Math.min(2, value));
  return v;
}