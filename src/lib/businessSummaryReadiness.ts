/** Identidad y estado de cada lectura del Resumen; sin Firebase ni escrituras. */
export type BusinessSummaryFeedStatus = 'loading' | 'ready' | 'error';
export interface BusinessSummaryFeedState {
  businessId: string;
  status: BusinessSummaryFeedStatus;
}

export function isBusinessSummaryFeedReady(businessId: string, feed: BusinessSummaryFeedState): boolean {
  return businessId.trim().length > 0 && feed.businessId === businessId && feed.status === 'ready';
}

export function isBusinessSummaryFeedError(businessId: string, feed: BusinessSummaryFeedState): boolean {
  return businessId.trim().length > 0 && feed.businessId === businessId && feed.status === 'error';
}
