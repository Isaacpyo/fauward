type BarcodeFormat =
  | "aztec"
  | "code_128"
  | "code_39"
  | "code_93"
  | "codabar"
  | "data_matrix"
  | "ean_13"
  | "ean_8"
  | "itf"
  | "pdf417"
  | "qr_code"
  | "upc_a"
  | "upc_e";

type DetectedBarcode = {
  boundingBox?: DOMRectReadOnly;
  cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
  format: BarcodeFormat;
  rawValue?: string;
};

interface BarcodeDetectorOptions {
  formats?: BarcodeFormat[];
}

interface BarcodeDetector {
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: BarcodeDetectorOptions): BarcodeDetector;
  getSupportedFormats?: () => Promise<BarcodeFormat[]>;
}

declare const BarcodeDetector: BarcodeDetectorConstructor | undefined;
