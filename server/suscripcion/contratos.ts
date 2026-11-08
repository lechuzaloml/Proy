export interface SolicitudApi extends AsyncIterable<Uint8Array> {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface RespuestaApi {
  headersSent?: boolean;
  status(code: number): RespuestaApi;
  json(body: unknown): void;
}
