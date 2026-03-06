export interface PhotographerEarningsSummary {
  total_earnings: number;
  total_earned_photo_fraction: number;
  total_real_photos_sold: number;
  total_photos_sold: number;
  total_orders_involved: number;
  photographer_id: number;
  start_date: string | null; // ISO date string or null
  end_date: string | null; // ISO date string or null
}

export interface AdminDashboardSchema {
  total_photos: number;
  total_photos_sold: number;
  total_real_photos_sold: number;
  total_orders: number;
  total_gross_revenue: number;
  total_commissions: number;
  orders_by_payment_method: Record<string, number>;
  commissions_by_photographer: AdminCommissionSummary[];
}
