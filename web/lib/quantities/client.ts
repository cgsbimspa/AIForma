import { autodeskFetch } from "../autodesk/client";
import type { DataPage, DataQuery } from "../autodesk/data";
import type { QuantityProject } from "./contracts";
const errors: Record<string, string> = {
  expired: "Conexión Autodesk no disponible. Conecta tu cuenta para continuar.",
  consent_required: "Vuelve a conectar Autodesk para autorizar la lectura de proyectos.",
  forbidden: "No tienes acceso a esta fuente o Autodesk no autorizó la solicitud.",
  not_found: "La fuente solicitada no está disponible.",
  duplicate_specialty: "Esta especialidad ya está agregada al proyecto.",
  configuration_conflict: "La configuración cambió en otra sesión. Recarga el proyecto antes de guardar.",
  view_unavailable: "La vista seleccionada ya no está disponible en esa versión. Selecciónala nuevamente.",
  invalid_model: "Selecciona un archivo RVT verificable del proyecto.",
  rate_limited: "Autodesk ha limitado temporalmente las consultas. Intenta nuevamente en unos momentos.",
  quantity_storage_unavailable: "El almacenamiento de cubicaciones no está disponible. No se ha guardado la configuración.",
  incompatible_runs: "Las ejecuciones no corresponden al mismo proyecto, especialidad, archivo y vista, o están en orden inverso.",
  incompatible_units: "Las unidades difieren entre ejecuciones. No se calculará una variación sin una conversión definida.",
  no_previous_run: "No hay dos ejecuciones verificadas para comparar.",
  viewer_derivative_unavailable: "La versión seleccionada no tiene geometría publicada disponible para el visor.",
  viewer_expired: "La sesión del visor venció. Vuelve a cargar el modelo.",
  viewer_resource_unavailable: "Autodesk no pudo entregar los archivos de visualización de este modelo.",
  ai_not_configured: "La conexión con OpenAI no está configurada. Las acciones directas del visor siguen disponibles.",
  ai_unavailable: "OpenAI no pudo interpretar la consulta. Intenta nuevamente o usa los botones de selección.",
  ai_rate_limited: "OpenAI está limitando las consultas. Espera unos momentos y vuelve a intentarlo.",
  ai_invalid_response: "No pude convertir la petición en una acción verificable. No apliqué cambios; indica un parámetro o elemento más concreto.",
};
export async function quantityResponse<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await autodeskFetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? errors[data.error] ?? "No fue posible completar la operación. No se ha confirmado ningún cambio; vuelve a cargar para verificar.");
  return data;
}
export function quantityCommand<T>(scope: QuantityProject, command: unknown, signal?: AbortSignal) {
  return quantityResponse<T>("/api/quantities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, command }), signal });
}
export function quantityBrowse(query: Partial<DataQuery>, signal?: AbortSignal) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== null && value !== undefined) params.set(key, String(value)); });
  return quantityResponse<DataPage>(`/api/autodesk/browse?${params}`, { signal });
}
