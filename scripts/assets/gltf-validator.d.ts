declare module "gltf-validator" {
  export interface ValidationMessage {
    readonly code: string;
    readonly severity: number;
    readonly pointer?: string;
    readonly uri?: string;
  }

  export interface ValidationReport {
    readonly validatorVersion: string;
    readonly issues: {
      readonly numErrors: number;
      readonly numWarnings: number;
      readonly numInfos: number;
      readonly numHints: number;
      readonly messages: readonly ValidationMessage[];
      readonly truncated: boolean;
    };
    readonly info?: {
      readonly animationCount?: number;
      readonly materialCount?: number;
      readonly hasSkins?: boolean;
      readonly hasTextures?: boolean;
      readonly totalVertexCount?: number;
      readonly totalTriangleCount?: number;
    };
  }

  export interface ValidatorApi {
    version(): string;
    supportedExtensions(): string[];
    validateBytes(
      bytes: Uint8Array,
      options: {
        readonly uri: string;
        readonly format: "glb";
        readonly writeTimestamp: false;
        readonly maxIssues: 0;
      },
    ): Promise<ValidationReport>;
  }

  const validator: ValidatorApi;
  export default validator;
}
