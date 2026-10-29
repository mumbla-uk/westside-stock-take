/**
 * Hospitality Category-Aware Order Calculation
 * @param {Object} item Catalog item with category, par, count_unit, order_unit, units_per_order_case
 * @param {number} currentCount Current counted units on shelf
 * @returns {Object} { orderQty, displayStr, orderUnit, isCase }
 */
export function calculateSmartOrder(item, currentCount = 0) {
  const par = Number(item.par) || 0;
  const count = Number(currentCount) || 0;
  const category = (item.category || '').toLowerCase();
  const caseSize = Math.max(1, Number(item.units_per_order_case) || 1);
  const countUnit = item.count_unit || item.unit || 'btl';
  const orderUnit = item.order_unit || 'case';

  // If already at or above par, zero order needed
  if (count >= par) {
    return { orderQty: 0, displayStr: '0', orderUnit: countUnit, isCase: false };
  }

  const deficit = par - count;

  // RULE 1: Packaged Beer & Cider (Strictly whole cases + 50% threshold)
  if (category.includes('packaged') || category.includes('beer') || category.includes('cider')) {
    if (count < par * 0.5) {
      const casesNeeded = Math.max(1, Math.ceil(deficit / caseSize));
      return {
        orderQty: casesNeeded,
        displayStr: `${casesNeeded} ${orderUnit}`,
        orderUnit: orderUnit,
        isCase: true
      };
    }
    return { orderQty: 0, displayStr: '—', orderUnit: orderUnit, isCase: true };
  }

  // RULE 2: Wine & Champagne (Strictly full cases)
  if (category.includes('wine') || category.includes('fizz') || category.includes('champagne')) {
    const casesNeeded = Math.max(1, Math.ceil(deficit / caseSize));
    return {
      orderQty: casesNeeded,
      displayStr: `${casesNeeded} ${orderUnit}`,
      orderUnit: orderUnit,
      isCase: true
    };
  }

  // RULE 3: Spirits & Liqueurs (Bottles first, rollup to whole cases if exact multiple)
  if (category.includes('spirit') || category.includes('liqueur')) {
    const bottlesNeeded = Math.ceil(deficit);
    if (caseSize > 1 && bottlesNeeded >= caseSize) {
      const fullCases = Math.floor(bottlesNeeded / caseSize);
      const rem = bottlesNeeded % caseSize;
      const displayStr = rem > 0 ? `${fullCases}cs + ${rem}btl` : `${fullCases} ${orderUnit}`;
      return {
        orderQty: bottlesNeeded,
        displayStr,
        orderUnit: countUnit,
        isCase: rem === 0
      };
    }
    return {
      orderQty: bottlesNeeded,
      displayStr: `${bottlesNeeded} ${countUnit}`,
      orderUnit: countUnit,
      isCase: false
    };
  }

  // RULE 4: Draught Beer Kegs
  if (category.includes('draught') || countUnit.includes('keg')) {
    const kegsNeeded = Math.max(1, Math.ceil(deficit));
    return {
      orderQty: kegsNeeded,
      displayStr: `${kegsNeeded} keg`,
      orderUnit: 'keg',
      isCase: true
    };
  }

  // DEFAULT / PREP / SOFTS
  const standardNeeded = Math.ceil(deficit);
  return {
    orderQty: standardNeeded,
    displayStr: `${standardNeeded} ${countUnit}`,
    orderUnit: countUnit,
    isCase: false
  };
}