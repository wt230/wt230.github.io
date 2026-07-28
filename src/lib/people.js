import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const data = yaml.load(
  fs.readFileSync(path.resolve("./src/data/people.yml"), "utf8")
);

export const pi = data.pi;
export const current = data.current ?? [];
export const alumni = data.alumni ?? [];
export const coSupervisors = data.co_supervisors ?? [];

/** True when a YAML value is still an unfilled placeholder. */
export const isTodo = (v) =>
  typeof v === "string" && v.trim().toUpperCase().startsWith("TODO");

/** Value if real, otherwise null — so templates can omit cleanly. */
export const real = (v) => (isTodo(v) || !v ? null : v);

export const counts = {
  current: current.length,
  alumni: alumni.length,
  total: current.length + alumni.length,
};
