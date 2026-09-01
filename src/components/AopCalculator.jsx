import React, { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  UV/H2O2 AOP — one compound, ·OH oxidation + direct 254 nm photolysis */
/*                                                                     */
/*  r·OH    = Ep0·(1/L)·(1 − 10^(−a·L))·f_H2O2·Φ                       */
/*  [·OH]ss = r·OH / (S + kH2O2[H2O2]0 + kP[P]0)                       */
/*  k'      = kP·[·OH]ss + k254·E_avg                                  */
/*  [P]     = [P]0 · exp(−k'·t)                                        */
/*                                                                     */
/*  Rate constants are entered by the user. The presets are a few      */
/*  well-known compounds chosen to show contrasting behaviour.         */
/* ------------------------------------------------------------------ */

const EXAMPLES = [
  { n: "1,4-Dioxane",    o: "2.8",  p: "0",       e: "0",     why: "·OH only" },
  { n: "Atrazine",       o: "3.0",  p: "5.94e-4", e: "3680",  why: "both paths" },
  { n: "NDMA",           o: "0.45", p: "2.42e-3", e: "1650",  why: "photolysis dominates" },
  { n: "pCBA",           o: "5.0",  p: "0",       e: "0",     why: "standard ·OH probe" },
  { n: "Carbamazepine",  o: "8.8",  p: "1.78e-5", e: "6070",  why: "fast with ·OH" },
];

const U254 = 471528;   // J per einstein at 254 nm
const LN10 = Math.log(10);
const EPS_H2O2 = 17.1; // M^-1 cm^-1 at 254 nm
const PHI_OH = 1.0;    // mol ·OH per einstein absorbed
const K_H2O2 = 2.7e7;  // M^-1 s^-1, H2O2 + ·OH

const T = {
  bg: "#EFF3F2", panel: "#FFFFFF", ink: "#17302C", sub: "#5B6E6A", line: "#D8E0DE",
  uv: "#6A4FD8", uvSoft: "#EFEAFB", warn: "#9A6A00", warnBg: "#FBF3DE",
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
  const sup = (n) => String(n).split("").map((c) => ({ "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }[c] || c)).join("");
  return `${Number(m.toPrecision(digits))}×10${sup(e)}`;
}

function Field({ label, unit, value, onChange, hint, span }) {
  return (
    <label style={{ display: "block", gridColumn: span ? "1 / -1" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>{label}</span>
        <span style={{ fontSize: 10.5, color: T.sub, fontFamily: T.mono }}>{unit}</span>
      </div>
      <input type="number" value={value} step="any" onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${T.line}`,
          borderRadius: 6, fontFamily: T.mono, fontSize: 13, color: T.ink, background: "#FCFDFD", outlineColor: T.uv }} />
      {hint && <div style={{ fontSize: 10.5, color: T.sub, marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </label>
  );
}

export default function AopCalculator() {
  const [irr, setIrr] = useState("0.16");
  const [time, setTime] = useState("600");
  const [a254, setA254] = useState("0.05");
  const [depth, setDepth] = useState("1.5");
  const [h2o2, setH2o2] = useState("10");
  const [scav, setScav] = useState("5");
  const [name, setName] = useState("Atrazine");
  const [k, setK] = useState("3.0");
  const [kp, setKp] = useState("5.94e-4");
  const [ep, setEp] = useState("3680");
  const [p0, setP0] = useState("1");
  const [yMode, setYMode] = useState("linear");

  // Fires on every keystroke; only acts when the text matches a preset.
  const loadExample = (n) => {
    const ex = EXAMPLES.find((e) => e.n === n);
    if (ex) { setK(ex.o); setKp(ex.p); setEp(ex.e); }
  };

  const r = useMemo(() => {
    const num = (v) => (v === "" || v == null ? 0 : parseFloat(v));
    const I = parseFloat(irr), t = parseFloat(time), aM = parseFloat(a254), L = parseFloat(depth),
      H = parseFloat(h2o2), S = parseFloat(scav) * 1e4;
    const kP = num(k) * 1e9, k254 = num(kp), eps254 = num(ep), P0 = parseFloat(p0) * 1e-6;

    const bad = [I, t, aM, L, H, S, kP, k254, eps254, P0].some((x) => !isFinite(x) || x < 0) ||
      I <= 0 || t <= 0 || L <= 0 || H <= 0 || P0 <= 0 || (kP === 0 && k254 === 0);
    if (bad) return null;

    const Ep0 = (I * 1e-3) / U254;
    const HM = H / 34.01 / 1000;
    const aH2O2 = EPS_H2O2 * HM;
    const aTot = aM + aH2O2 + eps254 * P0;
    const fH = aTot > 0 ? aH2O2 / aTot : 0;
    const absorbed = aTot > 0 ? 1 - Math.pow(10, -aTot * L) : 0;
    const rOH = Ep0 * (1 / L) * absorbed * fH * PHI_OH * 1000;
    const denom = S + K_H2O2 * HM + kP * P0;
    const OHss = rOH / denom;
    const avgI = aTot > 0 ? (I * absorbed) / (aTot * L * LN10) : I;

    const kOH = kP * OHss, kPhoto = k254 * avgI, kObs = kOH + kPhoto;
    const Ct = Math.exp(-kObs * t);
    const photoFrac = kObs > 0 ? kPhoto / kObs : 0;

    const N = 80;
    const series = Array.from({ length: N + 1 }, (_, i) => {
      const tt = (i / N) * t;
      const frac = Math.exp(-kObs * tt);
      return {
        t: tt / 60,
        pct: Math.max(frac * 100, 1e-6),
        ln: Math.log(Math.max(frac, 1e-12)),
        log: Math.log10(Math.max(frac, 1e-12)),
      };
    });

    const pShare = (kP * P0) / denom;
    return { OHss, avgI, kObs, Ct, photoFrac, series, t, aM, L, pShare,
      lnMin: Math.min(-0.01, Math.log(Math.max(Ct, 1e-12))),
      log10Min: Math.min(-0.005, Math.log10(Math.max(Ct, 1e-12))) };
  }, [irr, time, a254, depth, h2o2, scav, k, kp, ep, p0]);

  const warnings = [];
  if (r) {
    if (r.pShare > 0.05)
      warnings.push(`This compound accounts for ${(r.pShare * 100).toFixed(1)}% of the total ·OH scavenging, so it is not a trace probe at this concentration and the prediction is conservative.`);
    if (r.aM * r.L > 0.3)
      warnings.push(`aL = ${fmt(r.aM * r.L, 2)} for the matrix alone: strong attenuation with depth. Volume-averaged rates assume complete mixing.`);
    if (r.photoFrac > 0.5)
      warnings.push("Direct photolysis dominates. Fluence-based k₂₅₄ values are pH- and matrix-dependent — check yours applies here.");
  }

  // Decimals scaled to the span, so a shallow curve does not render every
  // tick as "-0.00".
  const tickFmt = (v) => {
    if (yMode === "linear") return v;
    const span = Math.abs(yMode === "ln" ? r.lnMin : r.log10Min);
    const d = span >= 1 ? 1 : span >= 0.1 ? 2 : span >= 0.01 ? 3 : 4;
    return v.toFixed(d);
  };
  const dataKey = yMode === "ln" ? "ln" : yMode === "log10" ? "log" : "pct";

  return (
    <div style={{ background: T.bg, fontFamily: T.sans, color: T.ink, padding: "18px 14px", borderRadius: 10 }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 30, height: 7, background: T.uv, borderRadius: 4, boxShadow: "0 0 10px rgba(106,79,216,0.6)" }} />
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.uv, letterSpacing: "0.1em" }}>UV/H₂O₂ · 254 nm</span>
        </div>

        <div style={{ padding: "8px 11px", background: T.warnBg, border: "1px solid #EAD9A8", borderRadius: 8,
          fontSize: 12, color: T.warn, lineHeight: 1.5, marginBottom: 14 }}>
          <b>Enter your own rate constants.</b> The presets are a few well-known compounds included to show
          contrasting behaviour, not a validated database. A teaching tool for building intuition, not a design tool.
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <section style={{ flex: "1 1 340px", minWidth: 280, background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: T.sub, marginBottom: 10 }}>Reactor &amp; matrix</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px 14px" }}>
              <Field label="Fluence rate, E₀" unit="mW·cm⁻²" value={irr} onChange={setIrr} />
              <Field label="Exposure time, t" unit="s" value={time} onChange={setTime} />
              <Field label="Path length, L" unit="cm" value={depth} onChange={setDepth} />
              <Field label="H₂O₂ dose" unit="mg·L⁻¹" value={h2o2} onChange={setH2o2} />
              <Field label="Matrix UV₂₅₄, a" unit="cm⁻¹" value={a254} onChange={setA254} hint="Matrix only — H₂O₂ added automatically." />
              <Field label="·OH scavenging, S" unit="×10⁴ s⁻¹" value={scav} onChange={setScav} hint="Drinking waters ≈ 3–8." />
            </div>

            <div style={{ height: 1, background: T.line, margin: "6px 0 14px" }} />

            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: T.sub, marginBottom: 10 }}>Compound</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px 14px" }}>
              <label style={{ display: "block", gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>Compound</span>
                <input list="aop-examples" value={name} placeholder="Type a name, or pick an example"
                  onChange={(e) => { setName(e.target.value); loadExample(e.target.value); }}
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "7px 9px",
                    border: `1px solid ${T.line}`, borderRadius: 6, fontFamily: T.sans, fontSize: 13,
                    background: "#FCFDFD", color: T.ink, outlineColor: T.uv }} />
                <datalist id="aop-examples">
                  {EXAMPLES.map((ex) => <option key={ex.n} value={ex.n}>{ex.why}</option>)}
                </datalist>
                <div style={{ fontSize: 10.5, color: T.sub, marginTop: 3, lineHeight: 1.4 }}>
                  Picking an example fills the constants below; edit them freely.
                </div>
              </label>
              <Field label="k(P + ·OH)" unit="×10⁹ M⁻¹s⁻¹" value={k} onChange={setK} />
              <Field label="[P]₀" unit="µM" value={p0} onChange={setP0} />
              <Field label="Photolysis k₂₅₄" unit="cm²·mJ⁻¹" value={kp} onChange={setKp} hint="0 = no direct photolysis" />
              <Field label="ε₂₅₄" unit="M⁻¹cm⁻¹" value={ep} onChange={setEp} hint="0 = ignore screening" />
            </div>
          </section>

          <section style={{ flex: "1 1 420px", minWidth: 300 }}>
            {!r ? (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: 22, color: T.sub, fontSize: 13.5, lineHeight: 1.6 }}>
                Enter positive values for fluence rate, time, path length, H₂O₂ dose and starting concentration.
                The compound needs a ·OH rate constant, a photolysis k₂₅₄, or both.
              </div>
            ) : (
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: T.sub }}>Decay curve — C/C₀</div>
                  <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 6, overflow: "hidden" }}>
                    {[["Linear", "linear"], ["ln", "ln"], ["log10", "log10"]].map(([lbl, val]) => (
                      <button key={val} onClick={() => setYMode(val)}
                        style={{ border: "none", padding: "5px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          fontFamily: T.sans, background: yMode === val ? T.uv : "#FFF", color: yMode === val ? "#FFF" : T.sub }}>{lbl}</button>
                    ))}
                  </div>
                </div>
                <div style={{ width: "100%", height: 340 }}>
                  <ResponsiveContainer>
                    <LineChart data={r.series} margin={{ top: 6, right: 14, bottom: 6, left: 0 }}>
                      <CartesianGrid stroke={T.line} strokeDasharray="3 3" />
                      <XAxis dataKey="t" tickFormatter={(v) => v.toFixed(1)} tick={{ fontSize: 11, fontFamily: T.mono, fill: T.sub }}
                        label={{ value: "time (min)", position: "insideBottomRight", offset: -2, fontSize: 11, fill: T.sub }} />
                      <YAxis
                        domain={yMode === "ln" ? [r.lnMin, 0] : yMode === "log10" ? [r.log10Min, 0] : [0, 100]}
                        allowDataOverflow
                        tickFormatter={tickFmt}
                        tick={{ fontSize: 11, fontFamily: T.mono, fill: T.sub }} width={58}
                        label={{ value: yMode === "ln" ? "ln(C/C0)" : yMode === "log10" ? "log10(C/C0)" : "C/C0 (%)",
                          angle: -90, position: "insideLeft", fontSize: 11, fill: T.sub, dy: 34 }} />
                      <Tooltip
                        formatter={(v) => (yMode === "ln" || yMode === "log10" ? v.toFixed(3) : `${v < 0.01 ? v.toExponential(2) : v.toFixed(2)}%`)}
                        labelFormatter={(v) => `t = ${v.toFixed(2)} min`}
                        contentStyle={{ fontFamily: T.mono, fontSize: 12, border: `1px solid ${T.line}`, borderRadius: 6 }} />
                      <Line type="monotone" name={name || "Compound"} dataKey={dataKey} stroke={T.uv} strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, fontSize: 12, fontFamily: T.mono, color: T.sub }}>
                  <span><b style={{ color: T.ink }}>{fmt((1 - r.Ct) * 100, 3)}%</b> removed</span>
                  <span>·</span>
                  <span>k′ = <b style={{ color: T.ink }}>{fmt(r.kObs)}</b> s⁻¹</span>
                  <span>·</span>
                  <span>[·OH]ss = <b style={{ color: T.ink }}>{fmt(r.OHss)}</b> M</span>
                  <span>·</span>
                  <span><b style={{ color: T.ink }}>{fmt(r.photoFrac * 100, 2)}%</b> of k′ from photolysis</span>
                </div>

                {warnings.length > 0 && (
                  <div style={{ background: T.warnBg, border: "1px solid #EAD9A8", borderRadius: 8, padding: "10px 12px", marginTop: 12 }}>
                    {warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: 12, color: T.warn, lineHeight: 1.5, marginBottom: i < warnings.length - 1 ? 6 : 0 }}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 11, color: T.sub, marginTop: 12, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
                  <span style={{ fontFamily: T.mono }}>k′ = k<sub>P</sub>·[·OH]<sub>ss</sub> + k₂₅₄·E<sub>avg</sub></span>, with{" "}
                  <span style={{ fontFamily: T.mono }}>[·OH]<sub>ss</sub> = r<sub>·OH</sub> / (S + k<sub>H₂O₂</sub>[H₂O₂] + k<sub>P</sub>[P]₀)</span>.
                  Completely mixed batch, roughly constant [H₂O₂], base-10 absorbances,
                  ε<sub>H₂O₂</sub> = {EPS_H2O2} M⁻¹cm⁻¹, Φ(·OH) = {PHI_OH}. Framework: Wang, Rosenfeldt, Li &amp; Hofmann,{" "}
                  <i>Environ. Sci. Technol.</i> 2020, <b>54</b>, 1929–1937.
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
