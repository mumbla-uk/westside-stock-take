/**
 * West Side Tavern - Unified Beverage Ordering & Unit Conversion Engine
 */

export const BEVERAGE_CONTAINER_DEFAULTS = {
  spirits: { defaultSize: 700, countUnit: 'bottle', orderUnit: 'bottle', defaultCase: 6 },
  draught: { defaultSize: 50000, countUnit: 'keg', orderUnit: 'keg', defaultCase: 1 },
  packaged_beer: { defaultSize: 330, countUnit: 'can', orderUnit: 'case', defaultCase: 24 },
  wine: { defaultSize: 750, countUnit: 'bottle', orderUnit: 'case', defaultCase: 6 },
  prep: { defaultSize: 1000, countUnit: 'bottle', orderUnit: 'bottle', defaultCase: 1 },
  minerals: { defaultSize: 200, countUnit: 'bottle', orderUnit: 'case', defaultCase: 24 }
};

/**
 * Calculates suggested order quantities based on category rules
 * Uses product's buffer_rate scale (1–10, where each point = 10% / 0.1)
 *
 * @param {Object} item - Catalog item
 * @param {number} currentCount - Current counted units on shelf
 * @returns {Object} { orderQty, displayStr, orderUnit, isCase }
 */
export function calculateSmartOrder(item, currentCount = 0) {
  const par = Number(item.par) || 0;
  const count = Number(currentCount) || 0;
  const category = (item.category || 'spirits').toLowerCase();
  const caseSize = Math.max(1, Number(item.units_per_order_case) || 1);
  const countUnit = item.count_unit || item.unit || 'btl';
  const orderUnit = item.order_unit || 'case';

  // No deficit = No order
  if (count >= par) {
    return { orderQty: 0, displayStr: '0', orderUnit: countUnit, isCase: false };
  }

  const rawDeficit = par - count;

  // Buffer Rate scale 1-10: 1 = 10% (0.1), 5 = 50% (0.5 default), 10 = 100% (1.0)
  const bufferRate = Number(item.buffer_rate ?? 5);
  const threshold = Math.min(1.0, Math.max(0.1, bufferRate / 10));

  // RULE 1: Packaged Beer, Cider, Softs & Wine (Ordered strictly in cases)
  if (
    category.includes('packaged') || 
    category.includes('beer') || 
    category.includes('cider') || 
    category.includes('mineral') ||
    category.includes('wine') ||
    category.includes('fizz') ||
    category.includes('champagne')
  ) {
    const deficitInCases = rawDeficit / caseSize;
    const wholeCasesMissing = Math.floor(deficitInCases);
    const partialCaseDeficit = deficitInCases - wholeCasesMissing;

    const extraCase = partialCaseDeficit > threshold ? 1 : 0;
    const totalCasesToOrder = wholeCasesMissing + extraCase;

    if (totalCasesToOrder === 0) {
      return { 
        orderQty: 0, 
        displayStr: '— (Buffer OK)', 
        orderUnit: orderUnit, 
        isCase: true 
      };
    }

    return {
      orderQty: totalCasesToOrder,
      displayStr: `${totalCasesToOrder} ${orderUnit} (${totalCasesToOrder * caseSize} ${countUnit})`,
      orderUnit: orderUnit,
      isCase: true
    };
  }

  // RULE 2: Spirits, Liqueurs, Cordials & Prep (Ordered in bottles)
  if (category.includes('spirit') || category.includes('liqueur') || category.includes('prep')) {
    const wholeBottlesMissing = Math.floor(rawDeficit);
    const partialBottleDeficit = rawDeficit - wholeBottlesMissing;

    const extraBottle = partialBottleDeficit > threshold ? 1 : 0;
    const totalBottlesToOrder = wholeBottlesMissing + extraBottle;

    if (totalBottlesToOrder === 0) {
      return {
        orderQty: 0,
        displayStr: '— (Buffer OK)',
        orderUnit: countUnit,
        isCase: false
      };
    }

    // Roll up to full cases if reaching case multipliers (e.g. 6 or 12)
    if (caseSize > 1 && totalBottlesToOrder >= caseSize) {
      const fullCases = Math.floor(totalBottlesToOrder / caseSize);
      const remainderBottles = totalBottlesToOrder % caseSize;

      const displayStr = remainderBottles > 0
        ? `${fullCases}cs + ${remainderBottles}btl`
        : `${fullCases} ${orderUnit}`;

      return {
        orderQty: totalBottlesToOrder,
        displayStr,
        orderUnit: countUnit,
        isCase: remainderBottles === 0
      };
    }

    return {
      orderQty: totalBottlesToOrder,
      displayStr: `${totalBottlesToOrder} ${countUnit}`,
      orderUnit: countUnit,
      isCase: false
    };
  }

  // RULE 3: Draught Kegs (Keg fractions threshold)
  if (category.includes('draught') || countUnit.includes('keg')) {
    const wholeKegsMissing = Math.floor(rawDeficit);
    const partialKegDeficit = rawDeficit - wholeKegsMissing;
    const extraKeg = partialKegDeficit > threshold ? 1 : 0;
    const totalKegsToOrder = wholeKegsMissing + extraKeg;

    if (totalKegsToOrder === 0) {
      return {
        orderQty: 0,
        displayStr: '— (Buffer OK)',
        orderUnit: 'keg',
        isCase: true
      };
    }

    return {
      orderQty: totalKegsToOrder,
      displayStr: `${totalKegsToOrder} keg`,
      orderUnit: 'keg',
      isCase: true
    };
  }

  // Generic fallback
  const wholeUnitsMissing = Math.floor(rawDeficit);
  const partialUnitDeficit = rawDeficit - wholeUnitsMissing;
  const extraUnit = partialUnitDeficit > threshold ? 1 : 0;
  const totalUnits = wholeUnitsMissing + extraUnit;

  return {
    orderQty: totalUnits,
    displayStr: totalUnits === 0 ? '— (Buffer OK)' : `${totalUnits} ${countUnit}`,
    orderUnit: countUnit,
    isCase: false
  };
}

/**
 * Calculates exact cost of a micro-spillage based on atomic base volume
 */
export function calculateSpillageCost(item, deductedBaseUnits) {
  const packageSize = Number(item.package_size_base) || 700;
  const unitsPerCase = Number(item.units_per_order_case) || 1;
  const costPerCase = Number(item.last_cost_ex_vat || item.cost_price_ex_vat) || 0;

  const totalBaseInCase = packageSize * unitsPerCase;
  if (totalBaseInCase <= 0) return 0;

  const cost = (deductedBaseUnits / totalBaseInCase) * costPerCase;
  return Math.round(cost * 100) / 100;
}