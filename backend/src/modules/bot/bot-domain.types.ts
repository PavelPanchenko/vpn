export type PlanLike = {
  id: string;
  name: string;
  price: number;
  currency: string;
  periodDays: number;
  active?: boolean;
  isTrial?: boolean;
};

export type ServerLike = {
  id: string;
  name: string;
};

