export const CONDITION_FIELDS = [
  'destinationCountry',
  'originCountry',
  'weightKg',
  'lengthCm',
  'widthCm',
  'heightCm',
  'declaredValue',
  'serviceType',
  'originBranchId',
  'customerTag'
] as const;

export const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains'] as const;

export const ACTION_TYPES = [
  'assignCarrier',
  'assignRoute',
  'requireCustomsDeclaration',
  'addInsurance',
  'blockBooking',
  'flagForReview',
  'setServiceType',
  'notifyOperator'
] as const;

export type ConditionField = typeof CONDITION_FIELDS[number];
export type ConditionOperator = typeof CONDITION_OPERATORS[number];
export type ActionType = typeof ACTION_TYPES[number];

export type ShippingRuleCondition = {
  field: ConditionField;
  operator: ConditionOperator;
  value: unknown;
};

export type ShippingRuleAction = {
  type: ActionType;
  value?: unknown;
};

export type ShippingRuleRecord = {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  priority: number;
  conditions: unknown;
  actions: unknown;
};

export type ShipmentRuleContext = Partial<Record<ConditionField, unknown>>;

export type ShippingRuleMatch = {
  rule: ShippingRuleRecord;
  actions: ShippingRuleAction[];
};

function asConditions(value: unknown): ShippingRuleCondition[] {
  return Array.isArray(value) ? value as ShippingRuleCondition[] : [];
}

function asActions(value: unknown): ShippingRuleAction[] {
  return Array.isArray(value) ? value as ShippingRuleAction[] : [];
}

function compareNumber(actual: unknown, expected: unknown, predicate: (a: number, b: number) => boolean) {
  const a = Number(actual);
  const b = Number(expected);
  return Number.isFinite(a) && Number.isFinite(b) && predicate(a, b);
}

function includesValue(container: unknown, value: unknown) {
  if (Array.isArray(container)) return container.some((item) => String(item) === String(value));
  if (typeof container === 'string') return container.toLowerCase().includes(String(value).toLowerCase());
  return false;
}

export function matchesCondition(context: ShipmentRuleContext, condition: ShippingRuleCondition) {
  const actual = context[condition.field];
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return String(actual) === String(expected);
    case 'neq':
      return String(actual) !== String(expected);
    case 'gt':
      return compareNumber(actual, expected, (a, b) => a > b);
    case 'gte':
      return compareNumber(actual, expected, (a, b) => a >= b);
    case 'lt':
      return compareNumber(actual, expected, (a, b) => a < b);
    case 'lte':
      return compareNumber(actual, expected, (a, b) => a <= b);
    case 'in':
      return Array.isArray(expected) && expected.some((item) => String(item) === String(actual));
    case 'not_in':
      return Array.isArray(expected) && !expected.some((item) => String(item) === String(actual));
    case 'contains':
      return includesValue(actual, expected);
    default:
      return false;
  }
}

export function ruleMatches(context: ShipmentRuleContext, rule: ShippingRuleRecord) {
  if (!rule.isActive) return false;
  const conditions = asConditions(rule.conditions);
  if (conditions.length === 0) return true;
  return conditions.every((condition) => matchesCondition(context, condition));
}

export function evaluateShippingRules(
  rules: ShippingRuleRecord[],
  context: ShipmentRuleContext,
  options: { evaluateAll?: boolean } = {}
): ShippingRuleMatch[] {
  const sorted = [...rules].filter((rule) => rule.isActive).sort((a, b) => a.priority - b.priority);
  const matches: ShippingRuleMatch[] = [];

  for (const rule of sorted) {
    if (!ruleMatches(context, rule)) continue;
    matches.push({ rule, actions: asActions(rule.actions) });
    if (!options.evaluateAll) break;
  }

  return matches;
}
