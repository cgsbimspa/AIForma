// Product catalog supplied in the Cubicaciones MVP 1.0 specification.
// These are configuration choices, never inferred model classifications.
export const quantitySpecialties = [
  { code: "architecture", name: "Arquitectura" },
  { code: "structure", name: "Cálculo" },
  { code: "mep", name: "MEP · Instalaciones" },
  { code: "sewer", name: "Alcantarillado" },
  { code: "cold-water", name: "Agua Potable Fría" },
  { code: "hot-water", name: "Agua Potable Caliente" },
  { code: "ventilation", name: "Ventilación" },
  { code: "electricity", name: "Electricidad" },
  { code: "hvac", name: "HVAC" },
  { code: "telecommunications", name: "Telecomunicaciones" },
  { code: "external-water", name: "Agua Potable Exterior" },
  { code: "external-sewer", name: "Alcantarillado Exterior" },
  { code: "external-electricity", name: "Electricidad Exterior" },
] as const;
export const specialtyName = (code: string) => quantitySpecialties.find(s => s.code === code)?.name ?? "Especialidad no disponible";
