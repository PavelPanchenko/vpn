export type PlanLike = {
  id: string;
  name: string;
  periodDays: number;
  active?: boolean;
  isTrial?: boolean;
  isTop?: boolean;
  variants?: Array<{
    id: string;
    code: string;
    currency: string;
    price: number;
    provider: string;
    active?: boolean;
  }>;
};

export type ServerLike = {
  id: string;
  name: string;
  isRecommended?: boolean;
};

