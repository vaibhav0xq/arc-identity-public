/* Plan ladder numbers for the public pricing page.

   These are the published limits of the hosted Kyro API, the same numbers
   rendered at https://www.thekyro.co/pricing. Enforcement lives in the
   hosted service; editing a value here changes this page, not the API. */

export interface PlanLimits {
  unitsPerMinute: number;
  batchMaxRows: number;
  intakeStartsPerDay: number;
}

export const ANONYMOUS_LIMITS: PlanLimits = {
  unitsPerMinute: 20,
  batchMaxRows: 10,
  intakeStartsPerDay: 25
};

export const DEVELOPER_LIMITS: PlanLimits = {
  unitsPerMinute: 120,
  batchMaxRows: 50,
  intakeStartsPerDay: 200
};

export const PLUS_LIMITS: PlanLimits = {
  unitsPerMinute: 200,
  batchMaxRows: 100,
  intakeStartsPerDay: 500
};

export const PRO_LIMITS: PlanLimits = {
  unitsPerMinute: 300,
  batchMaxRows: 250,
  intakeStartsPerDay: 1000
};

export const PARTNER_DEFAULT_LIMITS: PlanLimits = {
  unitsPerMinute: 600,
  batchMaxRows: 500,
  intakeStartsPerDay: 2000
};
