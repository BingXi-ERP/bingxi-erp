import type { WageRecordStatus } from '@/api/wage';

export function canCalculateWageRecord(status: WageRecordStatus): boolean {
  return status === 'draft';
}

export function canConfirmWageRecord(status: WageRecordStatus): boolean {
  return status === 'draft';
}

export function canPayWageRecord(status: WageRecordStatus): boolean {
  return status === 'confirmed';
}

export function canCancelWageRecord(status: WageRecordStatus): boolean {
  return status === 'draft' || status === 'confirmed';
}

export function canEditWageRecord(status: WageRecordStatus): boolean {
  return status === 'draft';
}

export function canDeleteWageRecord(status: WageRecordStatus): boolean {
  return status === 'draft';
}
