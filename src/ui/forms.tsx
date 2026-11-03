import type { FormEvent } from "react";
import type { Option, Project } from "../lib/model";
import { SQFT_PER_M2 } from "../lib/util";
import { Field, inputCls } from "./ui";

export function formData(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const opt = (k: string) => (s(k) === "" ? null : s(k));
  const num = (k: string) => {
    const v = s(k).replace(/,/g, "");
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
    return n;
  };
  return { fd, s, opt, num, form: e.currentTarget };
}

export function areaM2(value: number | null, unit: string) {
  return value == null ? null : unit === "ft2" ? value / SQFT_PER_M2 : value;
}

export function formatArea(m2: number | null | undefined, unitSystem: string) {
  if (m2 == null) return "—";
  return unitSystem === "si"
    ? `${Math.round(m2).toLocaleString("en-PH")} m²`
    : `${Math.round(m2 * SQFT_PER_M2).toLocaleString("en-PH")} ft² (${Math.round(m2).toLocaleString("en-PH")} m²)`;
}

export function placeName(p: Pick<Project, "barangay" | "city_municipality" | "province" | "region" | "country_code"> & { locality?: string | null; state_region?: string | null }) {
  return [p.barangay, p.city_municipality ?? p.locality, p.province ?? p.state_region, p.region, p.country_code].filter(Boolean).join(", ");
}

export function IdentityFields({ p, types, scopes, withNumber, engineering }: { p?: Partial<Project>; types: Option[]; scopes: Option[]; withNumber?: boolean; engineering?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {withNumber && <Field label="Project number" hint="Unique in this app, e.g. PH-2026-001."><input name="projectNo" required className={inputCls} /></Field>}
      <Field label="Project name"><input name="name" required defaultValue={p?.name ?? ""} className={inputCls} /></Field>
      <Field label="Client"><input name="clientName" defaultValue={p?.client_name ?? ""} className={inputCls} /></Field>
      {engineering && (
        <>
          <Field label="Building type">
            <select name="projectType" defaultValue={(p?.project_type ?? "OFFICE").toUpperCase()} className={inputCls}>
              {types.map((t) => <option key={t.value_key} value={t.value_key}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Our scope">
            <select name="deliveryModel" defaultValue={p?.delivery_model ?? "DESIGN_ONLY"} className={inputCls}>
              {scopes.map((t) => <option key={t.value_key} value={t.value_key}>{t.label}</option>)}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

export function LocationFields({ p, regions, permit = true }: { p?: Partial<Project>; regions: Option[]; permit?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Region">
        <select name="region" defaultValue={p?.region ?? ""} className={inputCls}>
          <option value="">—</option>
          {regions.map((r) => <option key={r.value_key} value={r.value_key}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="Province"><input name="province" defaultValue={p?.province ?? ""} placeholder="e.g. Metro Manila" className={inputCls} /></Field>
      <Field label="City / municipality"><input name="cityMunicipality" defaultValue={p?.city_municipality ?? ""} placeholder="e.g. Taguig City" className={inputCls} /></Field>
      <Field label="Barangay"><input name="barangay" defaultValue={p?.barangay ?? ""} className={inputCls} /></Field>
      <div className="sm:col-span-2"><Field label="Address / venue"><input name="siteAddress" defaultValue={p?.site_address ?? ""} className={inputCls} /></Field></div>
      {permit && <div className="sm:col-span-2">
        <Field label="Permit authority" hint="Usually the Office of the Building Official of the city or municipality.">
          <input name="permitAuthority" defaultValue={p?.permit_authority ?? ""} className={inputCls} />
        </Field>
      </div>}
    </div>
  );
}

export function SizeFields({ p, unitSystem }: { p?: Partial<Project>; unitSystem: string }) {
  const us = unitSystem !== "si";
  const m2 = p?.gross_floor_area_m2 ?? null;
  const shown = m2 == null ? "" : us ? String(Math.round(m2 * SQFT_PER_M2)) : String(Math.round(m2 * 10) / 10);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Floor area (air-conditioned scope)" hint="Drives the man-hour estimate.">
        <div className="flex gap-2">
          <input name="area" defaultValue={shown} inputMode="decimal" className={inputCls} />
          <select name="areaUnit" defaultValue={us ? "ft2" : "m2"} className="rounded-lg border border-slate-300 bg-surface px-2">
            <option value="ft2">ft²</option>
            <option value="m2">m²</option>
          </select>
        </div>
      </Field>
      <Field label="Floors above grade"><input name="floorsAboveGrade" defaultValue={p?.floors_above_grade ?? ""} inputMode="numeric" className={inputCls} /></Field>
      <Field label="Floors below grade"><input name="floorsBelowGrade" defaultValue={p?.floors_below_grade ?? ""} inputMode="numeric" className={inputCls} /></Field>
    </div>
  );
}
