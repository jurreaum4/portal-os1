import { validateEvidence, type ExecutionEvidence } from "./engines";
export const productTypes = [
  "game",
  "app",
  "art",
  "asset",
  "media",
  "course",
  "framework",
] as const;
export interface ReleasePackage {
  operationId: string;
  artifact: string;
  digest: string;
  slug: string;
  title: string;
  summary: string;
  type: (typeof productTypes)[number];
  priceMinor: number;
  currency: string;
  creator: { id: string; slug: string; name: string; bio: string };
}
export interface Publication {
  operationId: string;
  packageDigest: string;
  downloadReference: string;
  receipt: string;
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}
export function validatePackage(
  input: unknown,
  operationId: string,
  build: ExecutionEvidence,
  qa: ExecutionEvidence,
): ReleasePackage {
  validateEvidence(qa, qa.operationId, true, build);
  const value = input as ReleasePackage;
  if (
    !value ||
    value.operationId !== operationId ||
    value.artifact !== build.artifact ||
    value.digest !== build.digest ||
    !text(value.slug, 100) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) ||
    !text(value.title, 120) ||
    !text(value.summary, 4000) ||
    !productTypes.includes(value.type) ||
    !Number.isSafeInteger(value.priceMinor) ||
    value.priceMinor < 0 ||
    value.priceMinor > 100_000_000 ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !value.creator ||
    !text(value.creator.id, 120) ||
    !text(value.creator.slug, 100) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.creator.slug) ||
    !text(value.creator.name, 120) ||
    typeof value.creator.bio !== "string" ||
    value.creator.bio.length > 2000
  )
    throw new Error("Invalid package or mismatched QA artifact");
  // Canonical allowlist: unknown provider fields never enter the public projection.
  return {
    operationId,
    artifact: value.artifact,
    digest: value.digest,
    slug: value.slug,
    title: value.title,
    summary: value.summary,
    type: value.type,
    priceMinor: value.priceMinor,
    currency: value.currency,
    creator: {
      id: value.creator.id,
      slug: value.creator.slug,
      name: value.creator.name,
      bio: value.creator.bio,
    },
  };
}
export function validatePublication(
  input: unknown,
  operationId: string,
  packageDigest: string,
): Publication {
  const value = input as Publication;
  if (
    !value ||
    value.operationId !== operationId ||
    value.packageDigest !== packageDigest ||
    !text(value.downloadReference, 2000) ||
    !text(value.receipt, 2000) ||
    !/^https:\/\/\S+$/.test(value.receipt)
  )
    throw new Error("Publisher returned uncorrelated release evidence");
  return {
    operationId,
    packageDigest,
    downloadReference: value.downloadReference,
    receipt: value.receipt,
  };
}
