import type { OfferingInput, Selection } from "./contracts";

export type ResponseConfig = { responseType: "yes_no" | "single" | "multiple" | "text"; quantityEnabled: boolean };
/** One compatibility boundary: do not reinterpret old saved forms. */
export function resolveResponse(o: Pick<OfferingInput, "responseConfig" | "formType" | "variants">): ResponseConfig {
  if (o.responseConfig) return o.responseConfig;
  return {
    responseType: o.formType === "choice" ? "single" : o.variants.length ? "multiple" : ["text", "custom"].includes(o.formType ?? "") ? "text" : "yes_no",
    quantityEnabled: !["simple", "choice", "text", "custom"].includes(o.formType ?? ""),
  };
}
export function responseLimit(o: Pick<OfferingInput, "responseConfig" | "formType" | "variants" | "maxQuantity">) {
  const config = resolveResponse(o);
  return !config.quantityEnabled && config.responseType !== "multiple" ? 1 : o.maxQuantity;
}
export function replaceSelection(selections: Selection[], o: OfferingInput & { id: string }, variantId: string | null, quantity: number, inputs?: Selection["inputs"]) {
  const single = resolveResponse(o).responseType === "single";
  const rest = selections.filter(s => !(s.offeringId === o.id && ((single && quantity > 0) || s.variantId === variantId)));
  return quantity > 0 ? [...rest, { offeringId: o.id, variantId, quantity, ...(inputs ? { inputs } : {}) }] : rest;
}
export function needsResponseText(o: Pick<OfferingInput, "responseConfig" | "formType" | "variants" | "noteRequired">) {
  return o.noteRequired || (o.responseConfig?.responseType === "text");
}

export function requiredResponseError(o: OfferingInput, inputs?: Selection["inputs"]) {
  if (needsResponseText(o) && !inputs?.note?.trim()) return `Provide ${o.noteLabel || "a response"} for ${o.name}.`;
  if ((o.timeRequired || o.formType === "scheduled") && !inputs?.serviceAt) return `Choose when you need ${o.name}.`;
  if (o.peopleRequired && !inputs?.people) return "Choose the number of people.";
  const missing = o.choiceGroups?.find(g => g.required && !inputs?.choices?.[g.id]);
  return missing ? `Choose ${missing.name}.` : "";
}
