export interface QualityToleranceSourceOption {
  value: string;
  labelKey: string;
}

/** 允差取值来源词表；与 backend/src/services/quality_standard_service.rs 保持同一集合 */
export const QUALITY_TOLERANCE_SOURCES: QualityToleranceSourceOption[] = [
  {
    value: 'product_standard',
    labelKey: 'qualityStandards.toleranceSource.product_standard',
  },
  {
    value: 'order_agreement',
    labelKey: 'qualityStandards.toleranceSource.order_agreement',
  },
  {
    value: 'confirmed_sample',
    labelKey: 'qualityStandards.toleranceSource.confirmed_sample',
  },
];
