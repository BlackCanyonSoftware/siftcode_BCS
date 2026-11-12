export interface CycloneDxLike {
  readonly metadata?: { readonly component?: { readonly name?: string } };
  readonly components?: readonly { readonly name: string; readonly version?: string }[];
}

export function sbomProblems(
  sbom: CycloneDxLike,
  manifest: { readonly name: string; readonly dependencies?: Readonly<Record<string, string>> },
): string[];
