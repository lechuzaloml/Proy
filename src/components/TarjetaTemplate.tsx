import type { MetadataTemplate } from "../templates/catalogo";

interface TarjetaTemplateProps {
  metadata: MetadataTemplate;
  onProbar: () => void;
  onCrearCopia?: () => void | Promise<void>;
}

export default function TarjetaTemplate({
  metadata,
  onProbar,
  onCrearCopia,
}: TarjetaTemplateProps) {
  return (
    <article className="template-card">
      <div className="template-card-heading">
        <h3>{metadata.nombre}</h3>
        <span className="template-format">{metadata.formato}</span>
      </div>
      <dl className="template-details">
        <div>
          <dt>Caso de uso</dt>
          <dd>{metadata.caso_uso}</dd>
        </div>
        <div>
          <dt>Nicho</dt>
          <dd>{metadata.nicho}</dd>
        </div>
      </dl>
      <p>{metadata.descripcion}</p>
      <div className="template-card-actions">
        {onCrearCopia && (
          <button
            className="submit-button template-copy-button"
            onClick={() => void onCrearCopia()}
            type="button"
          >
            Usar como plantilla
          </button>
        )}
        <button
          className="secondary-button template-preview-button"
          onClick={onProbar}
          type="button"
        >
          Probar
        </button>
      </div>
    </article>
  );
}
