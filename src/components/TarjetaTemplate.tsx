import type { MetadataTemplate } from "../templates/catalogo";

interface TarjetaTemplateProps {
  metadata: MetadataTemplate;
  onSeleccionar: () => void;
}

export default function TarjetaTemplate({
  metadata,
  onSeleccionar,
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
      <button className="submit-button" onClick={onSeleccionar} type="button">
        Ver template
      </button>
    </article>
  );
}
