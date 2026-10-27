import { Link } from "react-router-dom";
import type { Product } from "../types";
export function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      className="product-card"
      to={`/products/${encodeURIComponent(product.id)}`}
    >
      <div className="product-card-head">
        <span className="product-icon">{product.name.slice(0, 1)}</span>
        <span className={`badge ${product.stage.toLowerCase()}`}>
          {product.stage}
        </span>
      </div>
      <h3>{product.name}</h3>
      <span className="product-division">
        {product.divisionId.startsWith("max-")
          ? `MAX ${product.divisionId.slice(4)}`
          : "Division product"}
      </span>
      <p>{product.description || "No description yet."}</p>
      <div className="product-score">
        <span>Portfolio score</span>
        <strong>
          {product.score}
          <span>/100</span>
        </strong>
      </div>
      <div className="progress">
        <span style={{ width: `${product.score}%` }} />
      </div>
    </Link>
  );
}
