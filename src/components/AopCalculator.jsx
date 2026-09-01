import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ReferenceDot, ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  UV/H2O2 AOP — micropollutant degradation                           */
/*  Steady-state ·OH + direct 254 nm photolysis, mixed batch slab      */
/*                                                                     */
/*  r·OH    = Ep0·(A/V)·(1 − 10^(−a·L))·f_H2O2·Φ                       */
/*  [·OH]ss = r·OH / (S + kH2O2[H2O2]0 + Σ kPi[Pi]0)                   */
/*  k'_i    = kPi·[·OH]ss + k254,i·E_avg                               */
/*  [Pi]    = [Pi]0 · exp(−k'_i·t)                                     */
/*                                                                     */
/*  Rate constants are entered by the user. The presets below are a    */
/*  handful of well-known compounds chosen to show contrasting         */
/*  behaviour, not a database — look your own values up and cite them. */
/* ------------------------------------------------------------------ */

// n=name, o=k(·OH) ×10⁹ M⁻¹s⁻¹, p=fluence-based k254 cm²/mJ, e=ε254 M⁻¹cm⁻¹
const EXAMPLES = [
  { n: "1,4-Dioxane",        o: "2.8",  p: "0",        e: "0",     why: "·OH only — no meaningful 254 nm absorbance" },
  { n: "Atrazine",           o: "3.0",  p: "5.94e-4",  e: "3680",  why: "both paths contribute" },
  { n: "NDMA",               o: "0.45", p: "2.42e-3",  e: "1650",  why: "photolysis dominates" },
  { n: "pCBA",               o: "5.0",  p: "0",        e: "0",     why: "standard ·OH probe" },
  { n: "Carbamazepine",      o: "8.8",  p: "1.78e-5",  e: "6070",  why: "fast with ·OH, negligible photolysis" },
  { n: "Methylene blue",     o: "10",   p: "1.4e-4",   e: "11800", why: "strong absorber — screens the lamp" },
];

const U254 = 471528;  // J per einstein at 254 nm
const LN10 = Math.log(10);
const EPS_OPTIONS = [18.6, 17.1];
const COMPOUND_COLORS = ["#6A4FD8", "#1C7C8C", "#B0894B", "#C2503C", "#3D8A4E", "#7A5C8E"];

const T = {
  bg: "#EFF3F2", panel: "#FFFFFF", ink: "#17302C", sub: "#5B6E6A", line: "#D8E0DE",
  uv: "#6A4FD8", uvSoft: "#EFEAFB", water: "#1C7C8C", amber: "#B0894B",
  warn: "#9A6A00", warnBg: "#FBF3DE",
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  sans: "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif",
};

function fmt(x, digits = 3) {
  if (x === null || x === undefined || !isFinite(x)) return "—";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 0.01 && abs < 10000) return Number(x.toPrecision(digits)).toString();
  const e = Math.floor(Math.log10(abs));
  const m = x / Math.pow(10, e);
  return `${Number(m.toPrecision(digits))}×10${sup(e)}`;
}
function sup(n) {
  const map = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(n).split("").map((c) => map[c] || c).join("");
}

function Field({ label, unit, value, onChange, hint, compact }) {
  return (
    <label style={{ display: "block", marginBottom: compact ? 0 : 14, flex: compact ? 1 : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: compact ? 11.5 : 13, fontWeight: 600, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 11, color: T.sub, fontFamily: T.mono }}>{unit}</span>
      </div>
      <input type="number" value={value} step="any" onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${T.line}`,
          borderRadius: 6, fontFamily: T.mono, fontSize: 13.5, color: T.ink, background: "#FCFDFD", outlineColor: T.uv }} />
      {hint && <div style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>{hint}</div>}
    </label>
  );
}

function Stat({ label, value, unit, accent }) {
  return (
    <div style={{ padding: "10px 12px", background: accent ? T.uvSoft : "#F6F8F7",
      border: `1px solid ${accent ? "#D9CFF5" : T.line}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 600, color: accent ? T.uv : T.ink }}>
        {value}{unit && <span style={{ fontSize: 11.5, fontWeight: 400, color: T.sub, marginLeft: 5 }}>{unit}</span>}
      </div>
    </div>
  );
}

function DepthProfile({ aTotal, L }) {
  const stops = [];
  for (let i = 0; i <= 10; i++) {
    const z = (i / 10) * L;
    const frac = Math.pow(10, -aTotal * z);
    stops.push(`rgba(106,79,216,${(0.12 + 0.78 * frac).toFixed(3)}) ${i * 10}%`);
  }
  const bottom = Math.pow(10, -aTotal * L) * 100;
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub, marginBottom: 6 }}>UV field through depth</div>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div style={{ width: 46, height: 120, borderRadius: 6, border: `1px solid ${T.line}`,
          background: `linear-gradient(to bottom, ${stops.join(", ")})`, position: "relative" }}>
          <div style={{ position: "absolute", top: -9, left: 0, right: 0, height: 5, background: T.uv, borderRadius: 3, boxShadow: "0 0 8px rgba(106,79,216,0.7)" }} />
        </div>
        <div style={{ fontSize: 11.5, color: T.sub, alignSelf: "center", lineHeight: 1.6 }}>
          <div>surface · 100% transmitted</div>
          <div style={{ fontFamily: T.mono, color: T.ink }}>z = {fmt(L, 3)} cm · {fmt(bottom, 3)}% transmitted</div>
          <div style={{ marginTop: 3, fontSize: 10.5 }}>% = light passing through (not absorbed)</div>
        </div>
      </div>
    </div>
  );
}

let nextId = 100;

export default function UVH2O2Calculator() {
  const [irr, setIrr] = useState("0.16");
  const [time, setTime] = useState("600");
  const [a254, setA254] = useState("0.05");
  const [depth, setDepth] = useState("1.5");
  const [h2o2, setH2o2] = useState("10");
  const [scav, setScav] = useState("5");
  const [compounds, setCompounds] = useState([
    { id: 1, name: "Atrazine", k: "3.0", kp: "5.94e-4", ep: "3680", p0: "1" },
    { id: 2, name: "1,4-Dioxane", k: "2.8", kp: "0", ep: "0", p0: "1" },
  ]);
  const [yMode, setYMode] = useState("linear");
  const [showAdv, setShowAdv] = useState(false);
  const [eps, setEps] = useState("18.6");
  const [phi, setPhi] = useState("1.0");
  const [kHP, setKHP] = useState("2.7");

  const updateCompound = (id, patch) => setCompounds((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCompound = (id) => setCompounds((cs) => cs.filter((c) => c.id !== id));
  const loadExample = (id, name) => {
    const ex = EXAMPLES.find((e) => e.n === name);
    if (ex) updateCompound(id, { name: ex.n, k: ex.o, kp: ex.p, ep: ex.e });
  };
  const addCompound = () => {
    if (compounds.length >= 6) return;
    setCompounds((cs) => [...cs, { id: nextId++, name: "", k: "", kp: "0", ep: "0", p0: "1" }]);
  };

  const r = useMemo(() => {
    const I = parseFloat(irr), t = parseFloat(time), aM = parseFloat(a254), L = parseFloat(depth),
      H = parseFloat(h2o2), S = parseFloat(scav) * 1e4, e = parseFloat(eps), PHI = parseFloat(phi), kH = parseFloat(kHP) * 1e7;
    const numOr0 = (v) => (v === "" || v == null ? 0 : parseFloat(v));

    const parsed = compounds.map((c, i) => ({
      id: c.id, name: c.name.trim() === "" ? `Compound ${i + 1}` : c.name.trim(),
      k: c.k === "" ? 0 : parseFloat(c.k) * 1e9,
      ep: numOr0(c.ep), kp: numOr0(c.kp),
      p0: parseFloat(c.p0) * 1e-6,
      color: COMPOUND_COLORS[i % COMPOUND_COLORS.length],
    }));

    const bad = [I, t, aM, L, H, S, e, PHI, kH].some((x) => !isFinite(x)) ||
      parsed.some((c) => !isFinite(c.k) || !isFinite(c.kp) || !isFinite(c.ep) || !isFinite(c.p0) ||
        c.k < 0 || c.kp < 0 || c.ep < 0 || c.p0 < 0) ||
      I <= 0 || t <= 0 || L <= 0 || H <= 0 || aM < 0 || S < 0 || parsed.length === 0 ||
      parsed.every((c) => c.k === 0 && c.kp === 0);
    if (bad) return null;

    const Ep0 = (I * 1e-3) / U254;
    const HM = H / 34.01 / 1000;
    const aH2O2 = e * HM;
    const aComp = parsed.reduce((acc, c) => acc + c.ep * c.p0, 0);
    const aTot = aM + aH2O2 + aComp;
    const fH = aTot > 0 ? aH2O2 / aTot : 0;
    const fComp = aTot > 0 ? aComp / aTot : 0;
    const absorbed = aTot > 0 ? 1 - Math.pow(10, -aTot * L) : 0;
    const rOH = Ep0 * (1 / L) * absorbed * fH * PHI * 1000;
    const sumKP = parsed.reduce((acc, c) => acc + c.k * c.p0, 0);
    const denom = S + kH * HM + sumKP;
    const OHss = rOH / denom;
    const avgI = aTot > 0 ? (I * absorbed) / (aTot * L * LN10) : I;
    const dose = avgI * t;
    const surfDose = I * t;
    const bottomDose = I * Math.pow(10, -aTot * L) * t;

    const results = parsed.map((c) => {
      const kOHobs = c.k * OHss;
      const kPhoto = c.kp * avgI;
      const kObs = kOHobs + kPhoto;
      return {
        ...c, p0uM: c.p0 * 1e6, kOHobs, kPhoto, kObs, Ct: Math.exp(-kObs * t),
        logRem: (kObs * t) / LN10, halfLife: Math.LN2 / kObs,
        share: (c.k * c.p0) / denom,
        photoFrac: kObs > 0 ? kPhoto / kObs : 0,
      };
    });

    const N = 80, floorPct = 1e-6;
    const series = Array.from({ length: N + 1 }, (_, i) => {
      const tt = (i / N) * t;
      const row = { t: tt / 60 };
      results.forEach((c) => {
        const frac = Math.exp(-c.kObs * tt);
        row[c.name] = Math.max(frac * 100, floorPct);
        const fr = Math.max(frac, 1e-12);
        row[c.name + "__ln"] = Math.log(fr);
        row[c.name + "__log"] = Math.log10(fr);
      });
      return row;
    });

    const pShareTot = sumKP / denom, hShare = (kH * HM) / denom;
    const minC = Math.min(...results.map((c) => c.Ct * 100));
    const logMin = Math.max(Math.pow(10, Math.floor(Math.log10(Math.max(minC, 1e-5))) - 1), 1e-5);
    const lnMin = Math.min(-0.01, ...results.map((c) => Math.log(Math.max(c.Ct, 1e-12))));
    const log10Min = Math.min(-0.005, ...results.map((c) => Math.log10(Math.max(c.Ct, 1e-12))));

    const ohAt = (Hs) => {
      const HMs = Hs / 34.01 / 1000;
      const aHs = e * HMs;
      const aTs = aM + aHs + aComp;
      const absS = aTs > 0 ? 1 - Math.pow(10, -aTs * L) : 0;
      const rHs = aTs > 0 ? Ep0 * (1 / L) * absS * (aHs / aTs) * PHI * 1000 : 0;
      return { rGen: rHs, oh: rHs / (S + kH * HMs + sumKP) };
    };
    const hMax = 3000, Msw = 200;
    let optH = 0, optOH = -1;
    const doseSweep = [];
    for (let i = 0; i <= Msw; i++) {
      const Hs = (i / Msw) * hMax, { rGen, oh } = ohAt(Hs);
      doseSweep.push({ h2o2: Hs, ohss: oh, rgen: rGen });
      if (oh > optOH) { optOH = oh; optH = Hs; }
    }

    return { aTot, fH, fComp, absorbed, rOH, OHss, avgI, results, series,
      dose, surfDose, bottomDose, pShareTot, hShare, t, aM, L, logMin, lnMin, log10Min,
      doseSweep, optH, optOH, optAtEdge: optH >= hMax * 0.98, hMax, h2o2Init: H };
  }, [irr, time, a254, depth, h2o2, scav, eps, phi, kHP, compounds]);

  const warnings = [];
  if (r) {
    if (r.pShareTot > 0.05)
      warnings.push(`The compounds you entered together account for ${(r.pShareTot * 100).toFixed(1)}% of total ·OH scavenging. They are not trace probes at this concentration, so [·OH]ss will rise as they degrade and these predictions are conservative.`);
    if (r.aM * r.L > 0.3)
      warnings.push(`aL = ${fmt(r.aM * r.L, 2)} for the matrix alone: strong attenuation with depth. Volume-averaged rates are used, which assume complete mixing.`);
    if (r.results.some((c) => c.photoFrac > 0.5))
      warnings.push("Direct photolysis dominates for at least one compound. Fluence-based k₂₅₄ values are pH- and matrix-dependent — check that yours applies to these conditions.");
    warnings.push("Assumes [H₂O₂] stays roughly constant over the exposure, and base-10 absorbances throughout.");
  }

  const logTicks = r ? [1e-5, 1e-4, 1e-3, 0.01, 0.1, 1, 10, 100].filter((v) => v >= r.logMin) : [];

  return (
    <div style={{ background: T.bg, fontFamily: T.sans, color: T.ink, padding: "20px 14px", borderRadius: 10 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 34, height: 8, background: T.uv, borderRadius: 4, boxShadow: "0 0 10px rgba(106,79,216,0.6)" }} />
            <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.uv, letterSpacing: "0.1em" }}>UV/H₂O₂ · 254 nm · ·OH + DIRECT PHOTOLYSIS</span>
          </div>
          <p style={{ fontSize: 13, color: T.sub, margin: "0 0 8px", maxWidth: 780, lineHeight: 1.55 }}>
            Each compound decays by two parallel first-order paths: ·OH oxidation (k<sub>P</sub>·[·OH]<sub>ss</sub>) and
            direct 254 nm photolysis (k<sub>254</sub>·E<sub>avg</sub>). All compounds share one [·OH]<sub>ss</sub>,
            and each one adds to the ·OH sink.
          </p>
          <div style={{ padding: "9px 12px", background: T.warnBg, border: "1px solid #EAD9A8", borderRadius: 8,
            fontSize: 12.5, color: T.warn, lineHeight: 1.5, maxWidth: 780 }}>
            <b>Enter your own rate constants.</b> The presets are a few well-known compounds included to show
            contrasting behaviour — they are not a validated database. Look your values up in the primary
            literature and check they apply to your pH and matrix. This is a teaching tool for building
            intuition, not a design tool.
          </div>
        </header>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
          <section style={{ flex: "1 1 330px", minWidth: 300, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: T.sub, margin: "0 0 14px" }}>Reactor &amp; matrix</h3>

            <Field label="Incident fluence rate, E₀" unit="mW·cm⁻²" value={irr} onChange={setIrr} hint="At the water surface (radiometer or actinometry)." />
            <Field label="Exposure time, t" unit="s" value={time} onChange={setTime} />
            <Field label="Matrix UV₂₅₄, a" unit="cm⁻¹ (base 10)" value={a254} onChange={setA254} hint="Water matrix only — H₂O₂ absorbance is added automatically." />
            <Field label="Water depth / path length, L" unit="cm" value={depth} onChange={setDepth} />
            <Field label="H₂O₂ dose, [H₂O₂]₀" unit="mg·L⁻¹" value={h2o2} onChange={setH2o2} />
            <Field label="Matrix ·OH scavenging capacity, S" unit="×10⁴ s⁻¹" value={scav} onChange={setScav} hint="Σkₛᵢ[S]ᵢ excluding H₂O₂ and your compounds. Drinking waters ≈ 3–8." />

            <div style={{ height: 1, background: T.line, margin: "4px 0 14px" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", color: T.sub, margin: 0 }}>
                Compounds <span style={{ fontFamily: T.mono }}>({compounds.length}/6)</span>
              </h3>
              <button onClick={addCompound} disabled={compounds.length >= 6}
                style={{ border: `1px solid ${T.uv}`, background: compounds.length >= 6 ? "#F0F0F0" : T.uvSoft,
                  color: compounds.length >= 6 ? T.sub : T.uv, borderRadius: 6, padding: "4px 10px",
                  fontSize: 12.5, fontWeight: 600, cursor: compounds.length >= 6 ? "default" : "pointer", fontFamily: T.sans }}>
                + Add compound
              </button>
            </div>

            {compounds.map((c, i) => (
              <div key={c.id} style={{ border: `1px solid ${T.line}`, borderLeft: `4px solid ${COMPOUND_COLORS[i % COMPOUND_COLORS.length]}`,
                borderRadius: 8, padding: "10px 12px", marginBottom: 10, background: "#FBFCFC" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <input value={c.name} placeholder="Compound name"
                    onChange={(e) => updateCompound(c.id, { name: e.target.value })}
                    style={{ flex: 1, boxSizing: "border-box", padding: "6px 8px", border: `1px solid ${T.line}`,
                      borderRadius: 6, fontFamily: T.sans, fontSize: 13, background: "#FFF", color: T.ink, outlineColor: T.uv }} />
                  {compounds.length > 1 && (
                    <button onClick={() => removeCompound(c.id)} title="Remove"
                      style={{ border: `1px solid ${T.line}`, background: "#FFF", color: T.sub, borderRadius: 6,
                        width: 28, height: 28, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
                  )}
                </div>

                <label style={{ display: "block", marginBottom: 10 }}>
                  <span style={{ fontSize: 11.5, color: T.sub }}>Load an example</span>
                  <select value="" onChange={(e) => e.target.value && loadExample(c.id, e.target.value)}
                    style={{ width: "100%", marginTop: 3, padding: "6px 8px", border: `1px solid ${T.line}`,
                      borderRadius: 6, fontFamily: T.sans, fontSize: 12.5, background: "#FFF", color: T.ink }}>
                    <option value="">Choose…</option>
                    {EXAMPLES.map((ex) => <option key={ex.n} value={ex.n}>{ex.n} — {ex.why}</option>)}
                  </select>
                </label>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <Field compact label="k(P + ·OH)" unit="×10⁹ M⁻¹s⁻¹" value={c.k} onChange={(v) => updateCompound(c.id, { k: v })} />
                  <Field compact label="[P]₀" unit="µM" value={c.p0} onChange={(v) => updateCompound(c.id, { p0: v })} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Field compact label="Photolysis k₂₅₄ (0 = none)" unit="cm²·mJ⁻¹" value={c.kp} onChange={(v) => updateCompound(c.id, { kp: v })} />
                  <Field compact label="ε₂₅₄ (0 = ignore)" unit="M⁻¹cm⁻¹" value={c.ep} onChange={(v) => updateCompound(c.id, { ep: v })} />
                </div>
              </div>
            ))}

            <button onClick={() => setShowAdv(!showAdv)}
              style={{ border: "none", background: "none", color: T.uv, fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", padding: 0, fontFamily: T.sans, marginTop: 8 }}>
              {showAdv ? "▾ Hide constants" : "▸ Constants (ε, Φ, k H₂O₂)"}
            </button>
            {showAdv && (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>ε H₂O₂ at 254 nm</span>
                    <span style={{ fontSize: 11, color: T.sub, fontFamily: T.mono }}>M⁻¹·cm⁻¹</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    {EPS_OPTIONS.map((v) => (
                      <button key={v} onClick={() => setEps(String(v))}
                        style={{ flex: 1, padding: "6px 4px", border: `1px solid ${parseFloat(eps) === v ? T.uv : T.line}`,
                          borderRadius: 6, cursor: "pointer", background: parseFloat(eps) === v ? T.uvSoft : "#FCFDFD",
                          color: parseFloat(eps) === v ? T.uv : T.ink, fontFamily: T.mono, fontSize: 13, fontWeight: 600 }}>{v}</button>
                    ))}
                  </div>
                  <input type="number" value={eps} step="any" onChange={(e) => setEps(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${T.line}`,
                      borderRadius: 6, fontFamily: T.mono, fontSize: 13.5, color: T.ink, background: "#FCFDFD" }} />
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>18.6 and 17.1 are both reported; pick one or type your own.</div>
                </div>
                <Field label="Φ(·OH) from H₂O₂ photolysis" unit="mol·einstein⁻¹" value={phi} onChange={setPhi} />
                <Field label="k(H₂O₂ + ·OH)" unit="×10⁷ M⁻¹·s⁻¹" value={kHP} onChange={setKHP} />
              </div>
            )}
          </section>

          <section style={{ flex: "2 1 480px", minWidth: 300, display: "flex", flexDirection: "column", gap: 16 }}>
            {!r ? (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 24, color: T.sub, fontSize: 14, lineHeight: 1.6 }}>
                Enter positive values for fluence rate, time, depth and H₂O₂ dose. Each compound needs a ·OH rate
                constant, a photolysis k₂₅₄, or both — at least one compound must have a non-zero value.
              </div>
            ) : (
              <>
                <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub }}>Decay curves — C/C₀ (%)</div>
                    <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 6, overflow: "hidden" }}>
                      {[["Linear", "linear"], ["Log", "log"], ["ln(C/C₀)", "ln"], ["log(C/C₀)", "log10"]].map(([lbl, val]) => (
                        <button key={lbl} onClick={() => setYMode(val)}
                          style={{ border: "none", padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                            fontFamily: T.sans, background: yMode === val ? T.uv : "#FFF", color: yMode === val ? "#FFF" : T.sub }}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={r.series} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                        <CartesianGrid stroke={T.line} strokeDasharray="3 3" />
                        <XAxis dataKey="t" tickFormatter={(v) => v.toFixed(1)} tick={{ fontSize: 11, fontFamily: T.mono, fill: T.sub }}
                          label={{ value: "time (min)", position: "insideBottomRight", offset: -2, fontSize: 11, fill: T.sub }} />
                        <YAxis
                          scale={yMode === "log" ? "log" : "linear"}
                          domain={yMode === "log" ? [r.logMin, 100] : yMode === "ln" ? [r.lnMin, 0] : yMode === "log10" ? [r.log10Min, 0] : [0, 100]}
                          ticks={yMode === "log" ? logTicks : undefined} allowDataOverflow
                          tickFormatter={(v) => (yMode === "ln" ? v.toFixed(1) : yMode === "log10" ? v.toFixed(2) : yMode === "log" ? (v < 0.01 ? v.toExponential(0) : String(v)) : v)}
                          tick={{ fontSize: 11, fontFamily: T.mono, fill: T.sub }} width={yMode === "ln" || yMode === "log10" ? 52 : 48}
                          label={yMode === "ln" ? { value: "ln(C/C₀)", angle: -90, position: "insideLeft", fontSize: 11, fill: T.sub, dy: 30 }
                            : yMode === "log10" ? { value: "log₁₀(C/C₀)", angle: -90, position: "insideLeft", fontSize: 11, fill: T.sub, dy: 34 } : undefined} />
                        <Tooltip
                          formatter={(v, name) => (yMode === "ln" || yMode === "log10" ? [v.toFixed(3), name] : [`${v < 0.01 ? v.toExponential(2) : v.toFixed(2)}%`, name])}
                          labelFormatter={(v) => `t = ${v.toFixed(2)} min`}
                          contentStyle={{ fontFamily: T.mono, fontSize: 12, border: `1px solid ${T.line}`, borderRadius: 6 }} />
                        <Legend wrapperStyle={{ fontSize: 12, fontFamily: T.sans }} />
                        {r.results.map((c) => (
                          <Line key={c.id} type="monotone" name={c.name}
                            dataKey={yMode === "ln" ? c.name + "__ln" : yMode === "log10" ? c.name + "__log" : c.name}
                            stroke={c.color} strokeWidth={2.5} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {yMode !== "linear" && (
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
                      First-order kinetics plot as straight lines on this axis.
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                    <DepthProfile aTotal={r.aTot} L={r.L} />
                    <div style={{ fontSize: 11.5, color: T.sub, marginTop: 10, fontFamily: T.mono }}>
                      a(total) = {fmt(r.aTot, 3)} cm⁻¹ · {fmt(r.absorbed * 100, 3)}% absorbed over depth L
                    </div>
                  </div>
                  <div style={{ flex: "1 1 220px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub, marginBottom: 8 }}>·OH sinks</div>
                    {[
                      { n: "Water matrix (S)", v: 1 - r.hShare - r.pShareTot, c: T.water },
                      { n: "H₂O₂", v: r.hShare, c: T.uv },
                      ...r.results.map((c) => ({ n: c.name, v: c.share, c: c.color })),
                    ].map((row) => (
                      <div key={row.n} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                          <span>{row.n}</span><span style={{ fontFamily: T.mono }}>{fmt(row.v * 100, 3)}%</span>
                        </div>
                        <div style={{ height: 6, background: "#EDF1F0", borderRadius: 3 }}>
                          <div style={{ width: `${Math.max(row.v * 100, 0.5)}%`, height: "100%", background: row.c, borderRadius: 3 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
                    <Stat accent label="·OH generation rate" value={fmt(r.rOH)} unit="M·s⁻¹" />
                    <Stat accent label="[·OH]ss" value={fmt(r.OHss)} unit="M" />
                    <Stat label="UV dose at surface" value={fmt(r.surfDose, 3)} unit="mJ·cm⁻²" />
                    <Stat label="UV dose at z = L" value={fmt(r.bottomDose, 3)} unit="mJ·cm⁻²" />
                    <Stat label="Avg. UV dose in column" value={fmt(r.dose, 3)} unit="mJ·cm⁻²" />
                    <Stat label="Light absorbed by H₂O₂" value={`${fmt(r.fH * 100, 3)}%`} />
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: T.sub, textAlign: "left" }}>
                          {["Compound", "[P]₀ (µM)", `[P] @ ${fmt(r.t)} s`, "Removal", "Log rem.", "k′ (s⁻¹)", "hν share", "t½ (min)"].map((h) => (
                            <th key={h} style={{ padding: "6px 8px", borderBottom: `1px solid ${T.line}`, fontWeight: 600, fontSize: 11 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.results.map((c) => (
                          <tr key={c.id}>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}` }}>
                              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: c.color, marginRight: 7, verticalAlign: "middle" }} />
                              {c.name}
                            </td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono }}>{fmt(c.p0uM, 3)}</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono, fontWeight: 600, color: c.color }}>{fmt(c.p0uM * c.Ct, 3)}</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono, fontWeight: 600, color: c.color }}>{fmt((1 - c.Ct) * 100, 3)}%</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono }}>{fmt(c.logRem, 3)}</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono }}>{fmt(c.kObs)}</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono }}>{fmt(c.photoFrac * 100, 2)}%</td>
                            <td style={{ padding: "7px 8px", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono }}>{fmt(c.halfLife / 60, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 11, color: T.sub, marginTop: 8 }}>
                    "hν share" is the fraction of k′ from direct photolysis; the rest is ·OH oxidation.
                  </div>
                </div>

                <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub, marginBottom: 8 }}>
                    [·OH]ss &amp; r·OH vs H₂O₂ dose
                  </div>
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer>
                      <LineChart data={r.doseSweep} margin={{ top: 6, right: 8, bottom: 6, left: 8 }}>
                        <CartesianGrid stroke={T.line} strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="h2o2" domain={[0, r.hMax]} allowDataOverflow
                          tickFormatter={(v) => v.toFixed(0)} tick={{ fontSize: 11, fontFamily: T.mono, fill: T.sub }}
                          label={{ value: "H₂O₂ dose (mg·L⁻¹)", position: "insideBottom", offset: -3, fontSize: 11, fill: T.sub }} />
                        <YAxis yAxisId="left" tickFormatter={(v) => v.toExponential(0)} tick={{ fontSize: 11, fontFamily: T.mono, fill: T.uv }} width={60}
                          label={{ value: "[·OH]ss (M)", angle: -90, position: "insideLeft", fontSize: 11, fill: T.uv, dy: 40 }} />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => v.toExponential(0)} tick={{ fontSize: 11, fontFamily: T.mono, fill: T.water }} width={60}
                          label={{ value: "r·OH (M·s⁻¹)", angle: 90, position: "insideRight", fontSize: 11, fill: T.water, dy: -36 }} />
                        <Tooltip formatter={(v, name) => [`${v.toExponential(3)}${name === "[·OH]ss" ? " M" : " M·s⁻¹"}`, name]}
                          labelFormatter={(v) => `H₂O₂ = ${v.toFixed(0)} mg/L`}
                          contentStyle={{ fontFamily: T.mono, fontSize: 12, border: `1px solid ${T.line}`, borderRadius: 6 }} />
                        <Legend wrapperStyle={{ fontSize: 12, fontFamily: T.sans }} />
                        <ReferenceLine yAxisId="left" x={r.h2o2Init} stroke={T.sub} strokeDasharray="4 3"
                          label={{ value: "current", fontSize: 10, fill: T.sub, position: "top" }} />
                        <ReferenceLine yAxisId="left" x={r.optH} stroke={T.amber} strokeDasharray="4 3"
                          label={{ value: "optimum", fontSize: 10, fill: T.amber, position: "top" }} />
                        <Line yAxisId="left" name="[·OH]ss" type="monotone" dataKey="ohss" stroke={T.uv} strokeWidth={2.5} dot={false} />
                        <Line yAxisId="right" name="r·OH" type="monotone" dataKey="rgen" stroke={T.water} strokeWidth={2} strokeDasharray="5 3" dot={false} />
                        <ReferenceDot yAxisId="left" x={r.optH} y={r.optOH} r={4} fill={T.amber} stroke="#FFF" strokeWidth={1.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 6, lineHeight: 1.5 }}>
                    Peak [·OH]<sub>ss</sub> = <b style={{ color: T.amber, fontFamily: T.mono }}>{fmt(r.optOH)} M</b> at{" "}
                    <b style={{ color: T.amber, fontFamily: T.mono }}>{fmt(r.optH, 3)} mg·L⁻¹</b> H₂O₂
                    {r.optAtEdge ? " (still rising at 3000 mg·L⁻¹ — the optimum is higher)." : "."}{" "}
                    Note the contrast: r·OH keeps climbing and saturates as H₂O₂ captures all the light, but
                    [·OH]<sub>ss</sub> peaks and then falls, because H₂O₂ also scavenges ·OH.
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div style={{ background: T.warnBg, border: "1px solid #EAD9A8", borderRadius: 12, padding: "12px 16px" }}>
                    {warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: 12.5, color: T.warn, lineHeight: 1.55, marginBottom: i < warnings.length - 1 ? 8 : 0 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer style={{ marginTop: 18, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: T.sub, marginBottom: 10 }}>Equations &amp; constants</div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div style={{ flex: "2 1 380px", minWidth: 300 }}>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.ink, lineHeight: 2.0 }}>
                <li>Photon irradiance: <span style={{ fontFamily: T.mono }}>E<sub>p0</sub> = E₀ / U₂₅₄</span></li>
                <li>Total absorbance: <span style={{ fontFamily: T.mono }}>a = a<sub>matrix</sub> + ε<sub>H₂O₂</sub>[H₂O₂]₀ + Σ ε<sub>254,i</sub>[P<sub>i</sub>]₀</span></li>
                <li>Fraction absorbed by H₂O₂: <span style={{ fontFamily: T.mono }}>f<sub>H₂O₂</sub> = ε<sub>H₂O₂</sub>[H₂O₂]₀ / a</span></li>
                <li>·OH generation: <span style={{ fontFamily: T.mono }}>r<sub>·OH</sub> = E<sub>p0</sub>·(1/L)·(1 − 10<sup>−aL</sup>)·f<sub>H₂O₂</sub>·Φ</span></li>
                <li>Steady state: <span style={{ fontFamily: T.mono }}>[·OH]<sub>ss</sub> = r<sub>·OH</sub> / (S + k<sub>H₂O₂</sub>[H₂O₂]₀ + Σ k<sub>Pi</sub>[P<sub>i</sub>]₀)</span></li>
                <li>Average fluence rate: <span style={{ fontFamily: T.mono }}>E<sub>avg</sub> = E₀·(1 − 10<sup>−aL</sup>) / (a·L·ln 10)</span></li>
                <li>Combined decay: <span style={{ fontFamily: T.mono }}>k′ = k<sub>P</sub>[·OH]<sub>ss</sub> + k₂₅₄·E<sub>avg</sub></span>; <span style={{ fontFamily: T.mono }}>[P] = [P]₀·exp(−k′t)</span></li>
              </ol>
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 240 }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                <tbody>
                  {[
                    ["U₂₅₄", "4.715×10⁵ J·einstein⁻¹"],
                    ["MW H₂O₂", "34.01 g·mol⁻¹"],
                    ["ε H₂O₂ (254 nm)", `${eps} M⁻¹·cm⁻¹`],
                    ["Φ(·OH)", `${phi} mol·einstein⁻¹`],
                    ["k(H₂O₂ + ·OH)", `${kHP}×10⁷ M⁻¹·s⁻¹`],
                  ].map(([n, v]) => (
                    <tr key={n}>
                      <td style={{ padding: "5px 8px 5px 0", borderBottom: `1px solid ${T.line}`, color: T.sub }}>{n}</td>
                      <td style={{ padding: "5px 0", borderBottom: `1px solid ${T.line}`, fontFamily: T.mono, whiteSpace: "nowrap" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11.5, color: T.sub, marginTop: 10, lineHeight: 1.6 }}>
                Assumes a completely mixed batch slab, roughly constant [H₂O₂], and base-10 absorbances.
                The ·OH framework follows Wang, Rosenfeldt, Li &amp; Hofmann, <i>Environ. Sci. Technol.</i>{" "}
                2020, <b>54</b>, 1929–1937 (SI, including the 2022 ln 10 correction).
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
