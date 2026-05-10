export const DEFAULT_VOLUMETRIC_DIVISOR = 5000;

export interface DimensionsCm {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export function calculateVolumetricWeightKg(
  dimensions: DimensionsCm,
  divisor = DEFAULT_VOLUMETRIC_DIVISOR
): number {
  if (divisor <= 0) {
    throw new Error('Volumetric divisor must be greater than zero');
  }

  const { lengthCm, widthCm, heightCm } = dimensions;
  if (lengthCm < 0 || widthCm < 0 || heightCm < 0) {
    throw new Error('Dimensions cannot be negative');
  }

  return (lengthCm * widthCm * heightCm) / divisor;
}

export function calculateChargeableWeightKg(
  actualWeightKg: number,
  dimensions: DimensionsCm,
  divisor = DEFAULT_VOLUMETRIC_DIVISOR
): number {
  if (actualWeightKg < 0) {
    throw new Error('Actual weight cannot be negative');
  }

  return Math.max(actualWeightKg, calculateVolumetricWeightKg(dimensions, divisor));
}
