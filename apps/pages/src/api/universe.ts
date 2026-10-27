import { api } from "./client";
import type {
  Universe,
  ProductTwin,
  GraphNode,
  GraphEdge,
} from "../../../../portal-os/universe";
export type Ecosystem = Universe & { sampledAt: string };
export const getEcosystem = (signal?: AbortSignal) =>
  api<Ecosystem>("/api/ecosystem", { signal });
export interface DivisionCentre {
  division: Universe["divisions"][number];
  products: ProductTwin[];
  dependencies: {
    id: string;
    sourceId: string;
    targetId: string;
    relation: string;
  }[];
  sampledAt: string;
}
export interface Twin {
  product: ProductTwin;
  history: {
    day: string;
    revenue: number;
    score: number;
    users: number | null;
    stage: string;
    status: string;
  }[];
  audit: {
    id: string;
    engine: string;
    reason: string;
    actor: string;
    createdAt: string;
  }[];
  runs: { id: string; stage: string; status: string; message: string }[];
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  schemaVersion: number;
  sampledAt: string;
}
export interface Operations {
  workers: {
    name: string;
    configured: boolean;
    health: string;
    queued: number;
    blocked: number;
    expiredLeases: number;
  }[];
  operations: {
    id: string;
    productId: string;
    worker: string;
    attempts: number;
    status: string;
    leaseExpiresAt: number | null;
    message: string;
  }[];
  compensation: {
    id: string;
    productId: string;
    attempts: number;
    status: string;
    message: string;
  }[];
  healthSource: string;
}
export interface MarketplaceOperations {
  products: {
    id: string;
    name: string;
    releaseId: string;
    type: string;
    slug: string;
    withdrawnAt: string | null;
    downloads: number;
    libraries: number;
    paidOrders: number;
    rating: number | null;
  }[];
  creators: { id: string; name: string; releases: number; downloads: number }[];
  currencies: {
    productId: string;
    creatorId: string;
    currency: string;
    paidMinor: number;
    refundedMinor: number;
  }[];
  source: string;
}
