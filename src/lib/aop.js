/**
 * Fluence-based UV/H2O2 micropollutant degradation.
 *
 * Illustrative, not a design tool — it assumes a well-mixed batch with a
 * uniform fluence rate and a steady-state radical concentration. The
 * behaviour it is meant to show is real, though: diminishing returns on
 * peroxide dose, the penalty from a light-absorbing matrix, and the
 * split between compounds that photolyse and compounds that only fall
 * to the radical.
 *
 *   -ln(C/C0) = k'_d * H  +  k_OH,M * integral[.OH] dt
 *
 *   integral[.OH] dt = OH produced per unit fluence * H / S_total
 */

// --- constants ------------------------------------------------------

export const U254 = 4.713e8; // mJ per einstein at 254 nm
export const EPS_H2O2 = 19.6; // M^-1 cm^-1, decadic, 254 nm
export const PHI_OH = 1.0; // mol .OH per einstein absorbed by H2O2
export const K_OH_H2O2 = 2.7e7; // M^-1 s^-1, peroxide scavenging .OH
export const MW_H2O2 = 34.01; // g/mol
export const PATH_CM = 1.0; // nominal optical path

// --- compounds ------------------------------------------------------
// kOH  : second-order rate constant with .OH, M^-1 s^-1
// eps  : molar absorption coefficient at 254 nm, M^-1 cm^-1
// phi  : direct photolysis quantum yield at 254 nm, mol/einstein

export const COMPOUNDS = [
  { id: "atrazine", name: "Atrazine", kOH: 3.0e9, eps: 3860, phi: 0.04 },
  { id: "carbamazepine", name: "Carbamazepine", kOH: 8.8e9, eps: 6070, phi: 0.0006 },
  { id: "dioxane", name: "1,4-Dioxane", kOH: 2.8e9, eps: 0, phi: 0 },
  { id: "ndma", name: "NDMA", kOH: 4.3e8, eps: 1974, phi: 0.3 },
  { id: "smx", name: "Sulfamethoxazole", kOH: 5.5e9, eps: 16000, phi: 0.09 },
];

// --- model ----------------------------------------------------------

/** Fluence-based first-order constant for direct photolysis, cm^2/mJ. */
export function kDirect({ eps, phi }) {
  if (!eps || !phi) return 0;
  return (2.303 * eps * phi * 1000) / U254;
}

/**
 * @param {object} o
 * @param {number} o.doseMgL      H2O2 dose, mg/L
 * @param {number} o.absorbance   background decadic absorbance at 254 nm, cm^-1
 * @param {number} o.scavenging   background .OH scavenging capacity, s^-1
 * @param {object} o.compound     entry from COMPOUNDS
 */
export function model({ doseMgL, absorbance, scavenging, compound }) {
  const h2o2 = doseMgL / (MW_H2O2 * 1000); // M
  const aH2O2 = EPS_H2O2 * h2o2; // cm^-1
  const aTotal = absorbance + aH2O2;

  // Standard collimated-beam water factor: the average fraction of the
  // incident irradiance seen through an absorbing depth.
  const tau = aTotal * PATH_CM;
  const waterFactor =
    tau > 1e-9 ? (1 - Math.pow(10, -tau)) / (tau * Math.LN10) : 1;

  // Peroxide scavenges the radical it produces, which is what puts a
  // ceiling on dosing more of it.
  const sTotal = scavenging + K_OH_H2O2 * h2o2; // s^-1

  // .OH produced per unit fluence, M per (mJ/cm^2)
  const ohPerFluence =
    (PHI_OH * 2.303 * aH2O2 * waterFactor * 1000) / U254;

  // .OH exposure per unit fluence, M*s per (mJ/cm^2)
  const rct = ohPerFluence / sTotal;

  const kd = kDirect(compound);

  return {
    h2o2,
    sTotal,
    waterFactor,
    rct,
    kd,
    /** C/C0 at a given fluence H (mJ/cm^2) */
    survival(H) {
      const exponent = kd * H + compound.kOH * rct * H;
      return Math.exp(-exponent);
    },
    /** Fraction removed by the radical alone, at fluence H. */
    radicalShare(H) {
      const total = kd * H + compound.kOH * rct * H;
      return total > 0 ? (compound.kOH * rct * H) / total : 0;
    },
  };
}

/** Series of [fluence, C/C0] pairs for plotting. */
export function curve(params, maxFluence = 1000, points = 80) {
  const m = model(params);
  const out = [];
  for (let i = 0; i <= points; i++) {
    const H = (maxFluence * i) / points;
    out.push([H, m.survival(H)]);
  }
  return out;
}
